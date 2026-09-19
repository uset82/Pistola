const crcTable = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i += 1) {
    let crc = i
    for (let j = 0; j < 8; j += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
    table[i] = crc
  }
  return table
})()

const crc32 = (bytes: Uint8Array) => {
  let crc = 0xffffffff
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

const u32 = (value: number) => {
  const out = new Uint8Array(4)
  new DataView(out.buffer).setUint32(0, value)
  return out
}

const chunk = (type: string, data: Uint8Array) => {
  const tag = new TextEncoder().encode(type)
  const body = new Uint8Array(tag.length + data.length)
  body.set(tag)
  body.set(data, tag.length)
  const out = new Uint8Array(8 + data.length + 4)
  out.set(u32(data.length))
  out.set(body, 4)
  out.set(u32(crc32(body)), 8 + data.length)
  return out
}

const deflateStore = (input: Uint8Array) => {
  const blocks: Uint8Array[] = []
  for (let offset = 0; offset < input.length; offset += 65535) {
    const slice = input.subarray(offset, offset + 65535)
    const last = offset + 65535 >= input.length ? 1 : 0
    const block = new Uint8Array(5 + slice.length)
    block[0] = last
    block[1] = slice.length & 0xff
    block[2] = (slice.length >> 8) & 0xff
    block[3] = ~slice.length & 0xff
    block[4] = (~slice.length >> 8) & 0xff
    block.set(slice, 5)
    blocks.push(block)
  }
  const adler = adler32(input)
  const total = 2 + blocks.reduce((sum, block) => sum + block.length, 0) + 4
  const out = new Uint8Array(total)
  out[0] = 0x78
  out[1] = 0x01
  let cursor = 2
  for (const block of blocks) {
    out.set(block, cursor)
    cursor += block.length
  }
  out.set(u32(adler), cursor)
  return out
}

const adler32 = (bytes: Uint8Array) => {
  let a = 1
  let b = 0
  for (const byte of bytes) {
    a = (a + byte) % 65521
    b = (b + a) % 65521
  }
  return ((b << 16) | a) >>> 0
}

export const encodePng = (width: number, height: number, rgba: Uint8ClampedArray) => {
  const raw = new Uint8Array((width * 4 + 1) * height)
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1)
    raw[row] = 0
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), row + 1)
  }
  const ihdr = new Uint8Array(13)
  ihdr.set(u32(width))
  ihdr.set(u32(height), 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const png = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateStore(raw)),
    chunk('IEND', new Uint8Array()),
  ]
  const size = png.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(size)
  let cursor = 0
  for (const part of png) {
    out.set(part, cursor)
    cursor += part.length
  }
  return out
}

export const pngDataUrl = (width: number, height: number, rgba: Uint8ClampedArray) => {
  const bytes = encodePng(width, height, rgba)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `data:image/png;base64,${btoa(binary)}`
}

const readU32 = (bytes: Uint8Array, offset: number) =>
  ((bytes[offset] ?? 0) << 24) | ((bytes[offset + 1] ?? 0) << 16) | ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0)

const inflateStore = (zlib: Uint8Array) => {
  if (zlib.length < 6 || zlib[0] !== 0x78) {
    throw new Error('PNG IDAT is not a zlib stream this decoder can inflate.')
  }
  const out: number[] = []
  let cursor = 2
  while (cursor + 5 <= zlib.length - 4) {
    const last = zlib[cursor] ?? 0
    const len = (zlib[cursor + 1] ?? 0) | ((zlib[cursor + 2] ?? 0) << 8)
    cursor += 5
    for (let i = 0; i < len; i += 1) out.push(zlib[cursor + i] ?? 0)
    cursor += len
    if (last & 1) break
  }
  return Uint8Array.from(out)
}

const inflateIdat = (idat: Uint8Array) => inflateStore(idat)

const paeth = (a: number, b: number, c: number) => {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  if (pb <= pc) return b
  return c
}

const unfilter = (raw: Uint8Array, width: number, height: number) => {
  const stride = width * 4
  const rgba = new Uint8ClampedArray(stride * height)
  let src = 0
  for (let y = 0; y < height; y += 1) {
    const filter = raw[src] ?? 0
    src += 1
    const dest = y * stride
    for (let x = 0; x < stride; x += 1) {
      const byte = raw[src + x] ?? 0
      const left = x >= 4 ? (rgba[dest + x - 4] ?? 0) : 0
      const up = y > 0 ? (rgba[dest - stride + x] ?? 0) : 0
      const upLeft = y > 0 && x >= 4 ? (rgba[dest - stride + x - 4] ?? 0) : 0
      let value = byte
      if (filter === 1) value = (byte + left) & 255
      else if (filter === 2) value = (byte + up) & 255
      else if (filter === 3) value = (byte + Math.floor((left + up) / 2)) & 255
      else if (filter === 4) value = (byte + paeth(left, up, upLeft)) & 255
      rgba[dest + x] = value
    }
    src += stride
  }
  return rgba
}

export const decodePng = (bytes: Uint8Array) => {
  if (bytes[0] !== 137 || bytes[1] !== 80 || bytes[2] !== 78 || bytes[3] !== 71) {
    throw new Error('Not a PNG.')
  }
  let width = 0
  let height = 0
  const idat: number[] = []
  let offset = 8
  while (offset + 12 <= bytes.length) {
    const length = readU32(bytes, offset)
    const type = String.fromCharCode(
      bytes[offset + 4] ?? 0,
      bytes[offset + 5] ?? 0,
      bytes[offset + 6] ?? 0,
      bytes[offset + 7] ?? 0,
    )
    const data = bytes.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = readU32(data, 0)
      height = readU32(data, 4)
      if ((data[8] ?? 0) !== 8 || (data[9] ?? 0) !== 6) {
        throw new Error('Only 8-bit RGBA PNGs are supported.')
      }
    } else if (type === 'IDAT') {
      idat.push(...data)
    } else if (type === 'IEND') {
      break
    }
    offset += 12 + length
  }
  if (!width || !height) throw new Error('PNG is missing IHDR.')
  const raw = inflateIdat(Uint8Array.from(idat))
  return { width, height, data: unfilter(raw, width, height) }
}

export const bytesFromDataUrl = (dataUrl: string) => {
  const comma = dataUrl.indexOf(',')
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}
