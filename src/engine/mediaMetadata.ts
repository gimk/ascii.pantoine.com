/**
 * Dither Studio — Container Metadata Injector
 * 
 * Embeds standard non-visual container metadata (PNG tEXt chunks, JPEG COM markers,
 * and GIF89a Comment Extensions) into media blobs referencing https://studio.pantoine.com.
 */

// CRC32 Lookup Table for PNG Chunk Validation
let crcTable: Uint32Array | null = null;
function getCrcTable(): Uint32Array {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) {
        c = 0xedb88320 ^ (c >>> 1);
      } else {
        c = c >>> 1;
      }
    }
    crcTable[n] = c;
  }
  return crcTable;
}

function calculateCrc32(buf: Uint8Array, offset: number, length: number): number {
  const table = getCrcTable();
  let c = 0xffffffff;
  for (let i = 0; i < length; i++) {
    c = table[(c ^ buf[offset + i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function createPngTextChunk(keyword: string, text: string): Uint8Array {
  const enc = new TextEncoder();
  const keywordBytes = enc.encode(keyword);
  const textBytes = enc.encode(text);
  const dataLen = keywordBytes.length + 1 + textBytes.length;
  const chunkLen = 4 + 4 + dataLen + 4;
  const chunk = new Uint8Array(chunkLen);
  const view = new DataView(chunk.buffer);

  // Length (4 bytes, Big Endian)
  view.setUint32(0, dataLen, false);

  // Chunk Type: "tEXt"
  chunk[4] = 0x74; // 't'
  chunk[5] = 0x45; // 'E'
  chunk[6] = 0x58; // 'X'
  chunk[7] = 0x74; // 't'

  // Data: keyword + null separator + text
  chunk.set(keywordBytes, 8);
  chunk[8 + keywordBytes.length] = 0x00;
  chunk.set(textBytes, 8 + keywordBytes.length + 1);

  // CRC-32 (calculated over type + data)
  const crc = calculateCrc32(chunk, 4, 4 + dataLen);
  view.setUint32(chunkLen - 4, crc, false);

  return chunk;
}

/**
 * Injects standard PNG tEXt metadata chunks immediately following the IHDR chunk.
 */
export function injectPngMetadata(pngBuffer: ArrayBuffer, metadata: Record<string, string>): Blob {
  const bytes = new Uint8Array(pngBuffer);

  // Validate PNG signature (8 bytes: 89 50 4E 47 0D 0A 1A 0A)
  if (
    bytes.length < 33 ||
    bytes[0] !== 0x89 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x4e ||
    bytes[3] !== 0x47 ||
    bytes[4] !== 0x0d ||
    bytes[5] !== 0x0a ||
    bytes[6] !== 0x1a ||
    bytes[7] !== 0x0a
  ) {
    return new Blob([pngBuffer], { type: 'image/png' });
  }

  const chunksToInject: Uint8Array[] = [];
  for (const [key, value] of Object.entries(metadata)) {
    if (value && value.trim()) {
      chunksToInject.push(createPngTextChunk(key, value.trim()));
    }
  }

  if (chunksToInject.length === 0) {
    return new Blob([pngBuffer], { type: 'image/png' });
  }

  const totalInjectSize = chunksToInject.reduce((acc, c) => acc + c.length, 0);
  const out = new Uint8Array(bytes.length + totalInjectSize);

  // Copy signature (8 bytes) + IHDR chunk (25 bytes) = 33 bytes
  out.set(bytes.subarray(0, 33), 0);

  let offset = 33;
  for (const c of chunksToInject) {
    out.set(c, offset);
    offset += c.length;
  }

  // Copy remaining original PNG bytes
  out.set(bytes.subarray(33), offset);

  return new Blob([out], { type: 'image/png' });
}

/**
 * Injects a standard JPEG COM (Comment) segment after the SOI (0xFFD8) marker.
 */
export function injectJpegComment(jpegBuffer: ArrayBuffer, comment: string): Blob {
  const bytes = new Uint8Array(jpegBuffer);

  // Validate SOI marker (0xFF 0xD8)
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return new Blob([jpegBuffer], { type: 'image/jpeg' });
  }

  const enc = new TextEncoder();
  const commentBytes = enc.encode(comment);
  const segmentLen = commentBytes.length + 2; // Length includes the 2 length bytes

  const segment = new Uint8Array(4 + commentBytes.length);
  segment[0] = 0xff;
  segment[1] = 0xfe; // COM marker
  segment[2] = (segmentLen >> 8) & 0xff;
  segment[3] = segmentLen & 0xff;
  segment.set(commentBytes, 4);

  const out = new Uint8Array(bytes.length + segment.length);
  // Put SOI (2 bytes)
  out.set(bytes.subarray(0, 2), 0);
  // Insert COM segment
  out.set(segment, 2);
  // Append remaining JPEG bytes
  out.set(bytes.subarray(2), 2 + segment.length);

  return new Blob([out], { type: 'image/jpeg' });
}

/**
 * Injects a standard GIF89a Comment Extension block prior to the 0x3B trailer byte.
 */
export function injectGifComment(gifBytes: Uint8Array, comment: string): Blob {
  const enc = new TextEncoder();
  const commentBytes = enc.encode(comment);

  // Sub-blocks must be <= 255 bytes each
  const subBlocks: Uint8Array[] = [];
  for (let i = 0; i < commentBytes.length; i += 255) {
    const chunk = commentBytes.subarray(i, Math.min(commentBytes.length, i + 255));
    const sb = new Uint8Array(1 + chunk.length);
    sb[0] = chunk.length;
    sb.set(chunk, 1);
    subBlocks.push(sb);
  }

  const totalSubBlocksLen = subBlocks.reduce((acc, b) => acc + b.length, 0);
  // Introducer (0x21), Label (0xFE), sub-blocks, Terminator (0x00)
  const commentExt = new Uint8Array(2 + totalSubBlocksLen + 1);
  commentExt[0] = 0x21; // Extension Introducer
  commentExt[1] = 0xfe; // Comment Label
  let offset = 2;
  for (const sb of subBlocks) {
    commentExt.set(sb, offset);
    offset += sb.length;
  }
  commentExt[offset] = 0x00; // Block Terminator

  // Insert before the 0x3B trailer byte if present
  if (gifBytes.length > 0 && gifBytes[gifBytes.length - 1] === 0x3b) {
    const out = new Uint8Array(gifBytes.length - 1 + commentExt.length + 1);
    out.set(gifBytes.subarray(0, gifBytes.length - 1), 0);
    out.set(commentExt, gifBytes.length - 1);
    out[out.length - 1] = 0x3b; // GIF Trailer
    return new Blob([out], { type: 'image/gif' });
  }

  const out = new Uint8Array(gifBytes.length + commentExt.length);
  out.set(gifBytes, 0);
  out.set(commentExt, gifBytes.length);
  return new Blob([out], { type: 'image/gif' });
}
