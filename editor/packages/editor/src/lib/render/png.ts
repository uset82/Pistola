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
