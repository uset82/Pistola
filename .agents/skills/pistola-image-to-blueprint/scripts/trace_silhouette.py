#!/usr/bin/env python3
"""Trace the outer silhouette of one object on a plain background into a polygon in meters.

Commands:
  trace    <image> (--width-m W | --height-m H) [--view side|front|top] [--origin ...]
           [--epsilon PX] [--threshold N] [--out file.json]
  palette  <image> [--colors K]
  self-test

The image should show a single view (crop views out of an ortho sheet first) on a plain
or transparent background. Output coordinates: +X right, +Y up. With the default
bottom-center origin, the polygon's lowest point sits at y=0 and it is centered on x=0.
Requires Pillow.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from collections import deque

from PIL import Image, ImageDraw

MAX_SIDE = 512
# 8-neighbourhood, clockwise on screen (image y grows downward).
DIRS = [(1, 0), (1, 1), (0, 1), (-1, 1), (-1, 0), (-1, -1), (0, -1), (1, -1)]


def _open(path: str) -> Image.Image:
    img = Image.open(path)
    img.load()
    if max(img.size) > MAX_SIDE:
        ratio = MAX_SIDE / max(img.size)
        img = img.resize(
            (max(1, round(img.width * ratio)), max(1, round(img.height * ratio))),
            Image.LANCZOS,
        )
    return img.convert("RGBA")


def _corner_samples(px, w: int, h: int, patch: int = 4):
    samples = []
    for cx, cy in ((0, 0), (w - patch, 0), (0, h - patch), (w - patch, h - patch)):
        for y in range(max(0, cy), min(h, cy + patch)):
            for x in range(max(0, cx), min(w, cx + patch)):
                samples.append(px[x, y])
    return samples


def foreground_mask(img: Image.Image, threshold: int) -> list[list[bool]]:
    w, h = img.size
    px = img.load()
    corners = _corner_samples(px, w, h)
    if sum(1 for c in corners if c[3] < 128) > len(corners) // 2:
        return [[px[x, y][3] >= 128 for x in range(w)] for y in range(h)]

    bg = [sum(c[i] for c in corners) / len(corners) for i in range(3)]
    limit = threshold * threshold

    def is_fg(c) -> bool:
        if c[3] < 128:
            return False
        return (c[0] - bg[0]) ** 2 + (c[1] - bg[1]) ** 2 + (c[2] - bg[2]) ** 2 > limit

    return [[is_fg(px[x, y]) for x in range(w)] for y in range(h)]


def dilate(mask: list[list[bool]], radius: int) -> list[list[bool]]:
    """Grow the foreground so nearly-touching parts (mast, cabin) join the main body."""
    if radius <= 0:
        return mask
    h, w = len(mask), len(mask[0])
    rows = [[any(row[max(0, x - radius) : x + radius + 1]) for x in range(w)] for row in mask]
    return [
        [any(rows[yy][x] for yy in range(max(0, y - radius), min(h, y + radius + 1))) for x in range(w)]
        for y in range(h)
    ]


def largest_component(mask: list[list[bool]]) -> set[tuple[int, int]]:
    h, w = len(mask), len(mask[0])
    seen = [[False] * w for _ in range(h)]
    best: set[tuple[int, int]] = set()
    for sy in range(h):
        for sx in range(w):
            if not mask[sy][sx] or seen[sy][sx]:
                continue
            comp = set()
            queue = deque([(sx, sy)])
            seen[sy][sx] = True
            while queue:
                x, y = queue.popleft()
                comp.add((x, y))
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and mask[ny][nx] and not seen[ny][nx]:
                        seen[ny][nx] = True
                        queue.append((nx, ny))
            if len(comp) > len(best):
                best = comp
    return best


def all_components(mask: list[list[bool]], min_size: int = 24) -> list[set[tuple[int, int]]]:
    h, w = len(mask), len(mask[0])
    seen = [[False] * w for _ in range(h)]
    comps: list[set[tuple[int, int]]] = []
    for sy in range(h):
        for sx in range(w):
            if not mask[sy][sx] or seen[sy][sx]:
                continue
            comp = set()
            queue = deque([(sx, sy)])
            seen[sy][sx] = True
            while queue:
                x, y = queue.popleft()
                comp.add((x, y))
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and mask[ny][nx] and not seen[ny][nx]:
                        seen[ny][nx] = True
                        queue.append((nx, ny))
            if len(comp) >= min_size:
                comps.append(comp)
    comps.sort(key=lambda c: len(c), reverse=True)
    return comps


def trace_component(comp: set[tuple[int, int]], *, width_m: float | None = None,
                    height_m: float | None = None, view: str = "side", origin: str | None = None,
                    epsilon: float = 1.5) -> dict:
    contour = moore_trace(comp)
    xs = [p[0] for p in comp]
    ys = [p[1] for p in comp]
    min_x, max_x, min_y, max_y = min(xs), max(xs), min(ys), max(ys)
    width_px, height_px = max_x - min_x + 1, max_y - min_y + 1

    if width_m is not None and height_m is not None:
        scale_x = width_m / width_px
        scale_y = height_m / height_px
    elif width_m is not None:
        scale_x = scale_y = width_m / width_px
    elif height_m is not None:
        scale_x = scale_y = height_m / height_px
    else:
        scale_x = scale_y = 1.0

    origin = origin or ("center" if view == "top" else "bottom-center")
    cx = (min_x + max_x) / 2
    base_y = max_y + 0.5 if origin == "bottom-center" else (min_y + max_y) / 2

    simplified = simplify_closed(contour, epsilon)
    pts = [[round((x - cx) * scale_x, 4), round((base_y - y) * scale_y, 4)] for x, y in simplified]
    area = signed_area(pts)
    if area < 0:
        pts.reverse()
        area = -area

    return {
        "view": view,
        "units": "m",
        "origin": origin,
        "width_m": round(width_px * scale_x, 4),
        "height_m": round(height_px * scale_y, 4),
        "area_m2": round(area, 5),
        "point_count": len(pts),
        "points": pts,
        "pixel_bbox": [min_x, min_y, max_x, max_y],
    }


def moore_trace(comp: set[tuple[int, int]]) -> list[tuple[int, int]]:
    start = min(comp, key=lambda p: (p[1], p[0]))  # topmost, then leftmost: west is outside
    contour = [start]
    cur, back = start, (start[0] - 1, start[1])
    first_move = None
    for _ in range(8 * len(comp) + 8):
        k = DIRS.index((back[0] - cur[0], back[1] - cur[1]))
        nxt = None
        for i in range(1, 9):
            d = (k + i) % 8
            cand = (cur[0] + DIRS[d][0], cur[1] + DIRS[d][1])
            if cand in comp:
                nxt = cand
                pd = (k + i - 1) % 8
                back = (cur[0] + DIRS[pd][0], cur[1] + DIRS[pd][1])
                break
        if nxt is None:
            return contour
        if cur == start and first_move is not None and nxt == first_move:
            break
        if first_move is None:
            first_move = nxt
        cur = nxt
        contour.append(cur)
    if len(contour) > 1 and contour[-1] == start:
        contour.pop()
    return contour


def _perp_dist(p, a, b) -> float:
    if a == b:
        return math.dist(p, a)
    (x, y), (x1, y1), (x2, y2) = p, a, b
    return abs((y2 - y1) * x - (x2 - x1) * y + x2 * y1 - y2 * x1) / math.dist(a, b)


def _dp_open(points, epsilon: float):
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        lo, hi = stack.pop()
        idx, dmax = -1, 0.0
        for i in range(lo + 1, hi):
            d = _perp_dist(points[i], points[lo], points[hi])
            if d > dmax:
                idx, dmax = i, d
        if dmax > epsilon and idx > 0:
            keep[idx] = True
            stack.extend(((lo, idx), (idx, hi)))
    return [p for p, k in zip(points, keep) if k]


def simplify_closed(points, epsilon: float):
    if len(points) < 4:
        return points
    far = max(range(len(points)), key=lambda i: math.dist(points[0], points[i]))
    first = _dp_open(points[: far + 1], epsilon)
    second = _dp_open(points[far:] + [points[0]], epsilon)
    return first[:-1] + second[:-1]


def signed_area(points) -> float:
    return 0.5 * sum(
        points[i][0] * points[(i + 1) % len(points)][1] - points[(i + 1) % len(points)][0] * points[i][1]
        for i in range(len(points))
    )


def trace_image(img: Image.Image, *, width_m=None, height_m=None, view="side", origin=None,
                epsilon=1.5, threshold=40, dilate_px=0) -> dict:
    comp = largest_component(dilate(foreground_mask(img, threshold), dilate_px))
    if len(comp) < 16:
        raise ValueError("No object found. Use a plain background and crop to a single view.")
    contour = moore_trace(comp)
    xs = [p[0] for p in comp]
    ys = [p[1] for p in comp]
    min_x, max_x, min_y, max_y = min(xs), max(xs), min(ys), max(ys)
    width_px, height_px = max_x - min_x + 1, max_y - min_y + 1

    if width_m:
        scale = width_m / width_px
    elif height_m:
        scale = height_m / height_px
    else:
        raise ValueError("Pass --width-m or --height-m to set the real-world scale.")

    origin = origin or ("center" if view == "top" else "bottom-center")
    cx = (min_x + max_x) / 2
    base_y = max_y + 0.5 if origin == "bottom-center" else (min_y + max_y) / 2

    simplified = simplify_closed(contour, epsilon)
    pts = [[round((x - cx) * scale, 4), round((base_y - y) * scale, 4)] for x, y in simplified]
    area = signed_area(pts)
    if area < 0:
        pts.reverse()
        area = -area

    return {
        "view": view,
        "units": "m",
        "origin": origin,
        "width_m": round(width_px * scale, 4),
        "height_m": round(height_px * scale, 4),
        "area_m2": round(area, 5),
        "point_count": len(pts),
        "points": pts,
        "pixel_bbox": [min_x, min_y, max_x, max_y],
        "meters_per_pixel": round(scale, 6),
    }


def trace_ortho_sheet(img: Image.Image, *, length_m: float, width_m: float, height_m: float,
                      epsilon: float = 1.5, threshold: int = 40, dilate_px: int = 0) -> dict:
    """Trace an orthographic sheet with side view and top view into Pistola CAD intersect_profiles spec."""
    mask = dilate(foreground_mask(img, threshold), dilate_px)
    comps = all_components(mask)
    if len(comps) < 2:
        w, h = img.size
        top_half = img.crop((0, 0, w, h // 2))
        bottom_half = img.crop((0, h // 2, w, h))
        side_res = trace_image(top_half, width_m=length_m, height_m=height_m, view="side", origin="bottom-center", epsilon=epsilon, threshold=threshold)
        top_res = trace_image(bottom_half, width_m=length_m, height_m=width_m, view="top", origin="center", epsilon=epsilon, threshold=threshold)
    else:
        c1, c2 = comps[0], comps[1]
        c1_avg_y = sum(p[1] for p in c1) / len(c1)
        c2_avg_y = sum(p[1] for p in c2) / len(c2)
        comp_side, comp_top = (c1, c2) if c1_avg_y < c2_avg_y else (c2, c1)
        side_res = trace_component(comp_side, width_m=length_m, height_m=height_m, view="side", origin="bottom-center", epsilon=epsilon)
        top_res = trace_component(comp_top, width_m=length_m, height_m=width_m, view="top", origin="center", epsilon=epsilon)

    return {
        "action": "build_cad_solid",
        "name": "traced_solid",
        "dimensions": {
            "length_m": length_m,
            "width_m": width_m,
            "height_m": height_m,
        },
        "spec": {
            "op": "intersect_profiles",
            "sideProfile": side_res["points"],
            "topProfile": top_res["points"],
        },
        "views": {
            "side": side_res,
            "top": top_res,
        },
    }


def palette(img: Image.Image, colors: int, threshold: int = 40) -> list[dict]:
    mask = foreground_mask(img, threshold)
    w, h = img.size
    px = img.load()
    fg = [px[x, y][:3] for y in range(h) for x in range(w) if mask[y][x]]
    if not fg:
        return []
    strip = Image.new("RGB", (len(fg), 1))
    strip.putdata(fg)
    quant = strip.quantize(colors=colors)
    pal = quant.getpalette()
    counts = sorted(quant.getcolors(), reverse=True)
    return [
        {
            "hex": "#{:02x}{:02x}{:02x}".format(*pal[i * 3 : i * 3 + 3]),
            "share": round(n / len(fg), 3),
        }
        for n, i in counts
    ]


def self_test() -> int:
    img = Image.new("RGB", (600, 400), "white")
    ImageDraw.Draw(img).ellipse((100, 80, 500, 320), fill="black")
    result = trace_image(img.convert("RGBA"), width_m=2.0, view="side")
    expected = math.pi * 1.0 * 0.6
    ok_ellipse = abs(result["area_m2"] - expected) / expected < 0.05

    img = Image.new("RGBA", (300, 300), (0, 0, 0, 0))
    ImageDraw.Draw(img).rectangle((50, 100, 249, 199), fill=(200, 40, 40, 255))
    rect = trace_image(img, width_m=1.0, view="top")
    ok_rect = abs(rect["area_m2"] - 0.5) / 0.5 < 0.05 and rect["point_count"] <= 8

    ortho_img = Image.new("RGB", (600, 600), "white")
    draw = ImageDraw.Draw(ortho_img)
    draw.ellipse((50, 50, 550, 250), fill="black")
    draw.ellipse((100, 350, 500, 550), fill="black")
    ortho_res = trace_ortho_sheet(ortho_img.convert("RGBA"), length_m=3.0, width_m=1.5, height_m=1.0)
    ok_ortho = (
        ortho_res["spec"]["op"] == "intersect_profiles"
        and len(ortho_res["spec"]["sideProfile"]) >= 4
        and len(ortho_res["spec"]["topProfile"]) >= 4
    )

    print(json.dumps({
        "ellipse": {"area_m2": result["area_m2"], "expected": round(expected, 5), "ok": ok_ellipse},
        "rectangle": {"area_m2": rect["area_m2"], "points": rect["point_count"], "ok": ok_rect},
        "ortho_sheet": {"op": ortho_res["spec"]["op"], "ok": ok_ortho},
    }, indent=2))
    return 0 if ok_ellipse and ok_rect and ok_ortho else 1


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)

    t = sub.add_parser("trace", help="trace one view into a polygon in meters")
    t.add_argument("image")
    size = t.add_mutually_exclusive_group(required=True)
    size.add_argument("--width-m", type=float)
    size.add_argument("--height-m", type=float)
    t.add_argument("--view", default="side", choices=["side", "front", "top"])
    t.add_argument("--origin", choices=["bottom-center", "center"])
    t.add_argument("--epsilon", type=float, default=1.5, help="simplification tolerance in pixels")
    t.add_argument("--threshold", type=int, default=40, help="color distance from the background")
    t.add_argument("--dilate", type=int, default=0,
                   help="grow the mask by N px to merge nearly-touching parts (inflates the outline by ~N px)")
    t.add_argument("--out")

    o = sub.add_parser("trace-ortho", help="trace side + top orthographic sheet into build_cad_solid action")
    o.add_argument("image")
    o.add_argument("--length-m", type=float, required=True, help="total length in meters along X")
    o.add_argument("--width-m", type=float, required=True, help="total width in meters along Z")
    o.add_argument("--height-m", type=float, required=True, help="total height in meters along Y")
    o.add_argument("--epsilon", type=float, default=1.5, help="simplification tolerance in pixels")
    o.add_argument("--threshold", type=int, default=40, help="color distance from the background")
    o.add_argument("--dilate", type=int, default=0)
    o.add_argument("--out")

    p = sub.add_parser("palette", help="dominant object colors as hex")
    p.add_argument("image")
    p.add_argument("--colors", type=int, default=5)

    sub.add_parser("self-test")

    args = parser.parse_args(argv)
    if args.command == "self-test":
        return self_test()

    img = _open(args.image)
    if args.command == "palette":
        print(json.dumps(palette(img, args.colors), indent=2))
        return 0

    if args.command == "trace-ortho":
        result = trace_ortho_sheet(
            img,
            length_m=args.length_m,
            width_m=args.width_m,
            height_m=args.height_m,
            epsilon=args.epsilon,
            threshold=args.threshold,
            dilate_px=args.dilate,
        )
    else:
        result = trace_image(
            img,
            width_m=args.width_m,
            height_m=args.height_m,
            view=args.view,
            origin=args.origin,
            epsilon=args.epsilon,
            threshold=args.threshold,
            dilate_px=args.dilate,
        )

    text = json.dumps(result, indent=2)
    if args.out:
        with open(args.out, "w", encoding="utf-8") as handle:
            handle.write(text + "\n")
    print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
