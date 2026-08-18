import { WaveParams, PhosphorTheme, CustomRenderContext } from '../types/ascii';
import { renderAsciiFrame } from './renderer';

/**
 * Lightweight pure-TypeScript GIF89a stream encoder with LZW compression.
 * Zero external dependencies.
 */
class ByteArray {
  private buffer: Uint8Array;
  private length: number = 0;

  constructor(initialCapacity = 1024 * 128) {
    this.buffer = new Uint8Array(initialCapacity);
  }

  ensureCapacity(additional: number) {
    if (this.length + additional > this.buffer.length) {
      let newCap = Math.max(this.buffer.length * 2, this.length + additional + 1024);
      const newBuf = new Uint8Array(newCap);
      newBuf.set(this.buffer.subarray(0, this.length));
      this.buffer = newBuf;
    }
  }

  writeByte(val: number) {
    this.ensureCapacity(1);
    this.buffer[this.length++] = val & 0xff;
  }

  writeBytes(bytes: number[] | Uint8Array) {
    this.ensureCapacity(bytes.length);
    if (bytes instanceof Uint8Array) {
      this.buffer.set(bytes, this.length);
      this.length += bytes.length;
    } else {
      for (let i = 0; i < bytes.length; i++) {
        this.buffer[this.length++] = bytes[i] & 0xff;
      }
    }
  }

  writeShort(val: number) {
    this.writeByte(val & 0xff);
    this.writeByte((val >> 8) & 0xff);
  }

  writeString(str: string) {
    this.ensureCapacity(str.length);
    for (let i = 0; i < str.length; i++) {
      this.buffer[this.length++] = str.charCodeAt(i) & 0xff;
    }
  }

  getUint8Array(): Uint8Array {
    return this.buffer.subarray(0, this.length);
  }
}

/**
 * LZW GIF compressor
 */
function lzwCompress(minCodeSize: number, indexedPixels: Uint8Array, out: ByteArray) {
  const clearCode = 1 << minCodeSize;
  const eofCode = clearCode + 1;

  let codeSize = minCodeSize + 1;
  let maxCode = (1 << codeSize) - 1;
  let nextCode = eofCode + 1;

  // LZW Dictionary table using a hash map
  const table = new Map<number, number>();

  let curAccum = 0;
  let curBits = 0;
  const packet = new Uint8Array(256);
  let packetLen = 0;

  const flushPacket = () => {
    if (packetLen > 0) {
      out.writeByte(packetLen);
      for (let i = 0; i < packetLen; i++) {
        out.writeByte(packet[i]);
      }
      packetLen = 0;
    }
  };

  const writeBits = (code: number, length: number) => {
    curAccum |= (code << curBits);
    curBits += length;
    while (curBits >= 8) {
      packet[packetLen++] = curAccum & 0xff;
      if (packetLen === 254) {
        flushPacket();
      }
      curAccum >>= 8;
      curBits -= 8;
    }
  };

  const initTable = () => {
    table.clear();
    codeSize = minCodeSize + 1;
    maxCode = (1 << codeSize) - 1;
    nextCode = eofCode + 1;
  };

  // Output Clear Code
  writeBits(clearCode, codeSize);
  initTable();

  if (indexedPixels.length === 0) {
    writeBits(eofCode, codeSize);
    if (curBits > 0) {
      packet[packetLen++] = curAccum & 0xff;
    }
    flushPacket();
    out.writeByte(0);
    return;
  }

  let prefix = indexedPixels[0];

  for (let i = 1; i < indexedPixels.length; i++) {
    const k = indexedPixels[i];
    const key = (prefix << 12) | k;

    if (table.has(key)) {
      prefix = table.get(key)!;
    } else {
      writeBits(prefix, codeSize);

      if (nextCode <= 4095) {
        table.set(key, nextCode++);
        if (nextCode > maxCode && nextCode < 4096) {
          codeSize++;
          maxCode = (1 << codeSize) - 1;
        }
      } else {
        writeBits(clearCode, codeSize);
        initTable();
      }
      prefix = k;
    }
  }

  writeBits(prefix, codeSize);
  writeBits(eofCode, codeSize);

  if (curBits > 0) {
    packet[packetLen++] = curAccum & 0xff;
  }
  flushPacket();
  out.writeByte(0); // Block terminator
}

/**
 * Quantize RGBA frame data into a palette of max 256 colors
 */
function quantizeFrame(rgba: Uint8ClampedArray, width: number, height: number): {
  palette: number[]; // Flat array of [r, g, b, r, g, b, ...]
  indexed: Uint8Array;
} {
  const pixelCount = width * height;
  const indexed = new Uint8Array(pixelCount);
  const colorMap = new Map<number, number>();
  const palette: number[] = [];

  for (let i = 0; i < pixelCount; i++) {
    const r = rgba[i * 4];
    const g = rgba[i * 4 + 1];
    const b = rgba[i * 4 + 2];
    // Reduce color depth to 6-bit per channel for snappy palette grouping
    const qr = r & 0xfc;
    const qg = g & 0xfc;
    const qb = b & 0xfc;
    const key = (qr << 16) | (qg << 8) | qb;

    let index = colorMap.get(key);
    if (index === undefined) {
      if (palette.length / 3 < 256) {
        index = palette.length / 3;
        colorMap.set(key, index);
        palette.push(qr, qg, qb);
      } else {
        // Nearest color match fallback
        let minDist = Infinity;
        let bestIdx = 0;
        const count = palette.length / 3;
        for (let p = 0; p < count; p++) {
          const pr = palette[p * 3];
          const pg = palette[p * 3 + 1];
          const pb = palette[p * 3 + 2];
          const dist = (qr - pr) * (qr - pr) + (qg - pg) * (qg - pg) + (qb - pb) * (qb - pb);
          if (dist < minDist) {
            minDist = dist;
            bestIdx = p;
          }
        }
        index = bestIdx;
        colorMap.set(key, index);
      }
    }
    indexed[i] = index;
  }

  // Ensure palette size is a power of 2 (between 2 and 256)
  let pLen = palette.length / 3;
  let targetLen = 2;
  while (targetLen < pLen && targetLen < 256) {
    targetLen <<= 1;
  }
  while (palette.length / 3 < targetLen) {
    palette.push(0, 0, 0);
  }

  return { palette, indexed };
}

export interface GifExportOptions {
  name: string;
  type: 'parametric' | 'custom';
  params: WaveParams;
  customCode?: string;
  customPrepare?: string;
  density: string;
  cols: number;
  rows: number;
  theme: PhosphorTheme;
  customThemeColor?: string;
  scanlines?: boolean;
  duration?: number; // Duration in seconds (default: 2.0s)
  fps?: number; // Framerate (default: 15 fps)
  scale?: number; // Render resolution multiplier (1.0 or 1.5)
}

const THEME_COLORS: Record<PhosphorTheme, { bg: string; text: string }> = {
  green: { bg: '#040905', text: '#00ff66' },
  amber: { bg: '#090602', text: '#ffb000' },
  cyan: { bg: '#03080a', text: '#00f0ff' },
  monochrome: { bg: '#0a0a0a', text: '#f0f0f0' },
  blood: { bg: '#0a0304', text: '#ff3344' },
  paper: { bg: '#f0eee6', text: '#151515' },
  matrix: { bg: '#040905', text: '#00ff66' },
};

function getThemeColors(theme: PhosphorTheme, customColor?: string): { bg: string; text: string } {
  if (customColor) {
    let cleaned = customColor.replace('#', '').trim();
    if (cleaned.length === 3) cleaned = cleaned.split('').map((c) => c + c).join('');
    const num = parseInt(cleaned, 16);
    const [r, g, b] = Number.isNaN(num) ? [0, 255, 102] : [(num >> 16) & 255, (num >> 8) & 255, num & 255];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    if (lum < 80) {
      return {
        bg: `rgb(${Math.round(244 - (255 - r) * 0.05)}, ${Math.round(242 - (255 - g) * 0.05)}, ${Math.round(236 - (255 - b) * 0.05)})`,
        text: `rgb(${r}, ${g}, ${b})`,
      };
    }
    return {
      bg: `rgb(${Math.max(2, Math.round(r * 0.035 + 2))}, ${Math.max(2, Math.round(g * 0.035 + 2))}, ${Math.max(2, Math.round(b * 0.035 + 2))})`,
      text: `rgb(${r}, ${g}, ${b})`,
    };
  }
  return THEME_COLORS[theme] || THEME_COLORS.green;
}

/**
 * Records an animated GIF loop of the active ASCII animation in the browser.
 */
export async function exportAnimatedGif(
  opts: GifExportOptions,
  onProgress?: (progress: number, frame: number, total: number) => void
): Promise<Blob> {
  const {
    cols,
    rows,
    params,
    density,
    customCode,
    customPrepare,
    type,
    theme,
    customThemeColor,
    scanlines = false,
    duration = 2.0,
    fps = 15,
    scale = 1.0,
  } = opts;

  const totalFrames = Math.max(2, Math.round(duration * fps));
  const frameDelay = Math.round(100 / fps); // in 1/100th seconds (e.g. 15fps => 6 or 7)

  // Character cell dimensions on canvas
  const charWidth = 6.015 * scale;
  const charHeight = 10.0 * scale;
  const width = Math.round(cols * charWidth);
  const height = Math.round(rows * charHeight);

  // Setup offscreen canvas
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not create 2D canvas context');

  const { bg, text } = getThemeColors(theme, customThemeColor);

  // Compile custom code if needed
  let customRenderFn: any;
  let prepareFn: any;
  let customContext: CustomRenderContext = {};

  if (type === 'custom' && customCode) {
    try {
      customRenderFn = new Function(
        'x', 'y', 'time', 'dist', 'dx', 'dy', 'cols', 'rows', 'angle', 'ctx',
        customCode
      );
      if (customPrepare) {
        prepareFn = new Function('time', 'cols', 'rows', 'ctx', customPrepare);
      }
    } catch {}
  }

  // Pre-generate frames
  const framesData: { palette: number[]; indexed: Uint8Array }[] = [];

  for (let i = 0; i < totalFrames; i++) {
    const t = i * (1 / fps) * (params.timeSpeed || 1.0);

    const frameText = renderAsciiFrame({
      cols,
      rows,
      time: t,
      density,
      trailPoints: [],
      waveParams: params,
      customRenderFn,
      prepareFn,
      customContext,
      interactiveInfluence: false,
    });

    const lines = frameText.split('\n');

    // Render to Canvas
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = text;
    ctx.font = `${Math.round(10 * scale)}px 'JuliaMono', 'Noto Sans Mono', 'JetBrains Mono', monospace`;
    ctx.textBaseline = 'top';

    for (let row = 0; row < lines.length; row++) {
      const line = lines[row];
      if (!line) continue;
      ctx.fillText(line, 0, Math.round(row * charHeight));
    }

    // Optional CRT scanlines
    if (scanlines) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
      for (let y = 0; y < height; y += 3) {
        ctx.fillRect(0, y, width, 1);
      }
    }

    const imgData = ctx.getImageData(0, 0, width, height);
    const quantized = quantizeFrame(imgData.data, width, height);
    framesData.push(quantized);

    if (onProgress) {
      onProgress(Math.round(((i + 1) / totalFrames) * 80), i + 1, totalFrames);
    }

    // Yield execution every 3 frames for responsive UI
    if (i % 3 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  // Build binary GIF stream
  const gif = new ByteArray();

  // 1. Header
  gif.writeString('GIF89a');

  // 2. Logical Screen Descriptor
  gif.writeShort(width);
  gif.writeShort(height);
  // GCT Flag: 0 (we use Local Color Tables per frame for optimal palette clarity)
  gif.writeByte(0x70); // Color resolution 8 bits, no GCT
  gif.writeByte(0x00); // Background color index
  gif.writeByte(0x00); // Pixel aspect ratio

  // 3. Netscape 2.0 Loop Extension (Infinite looping)
  gif.writeByte(0x21); // Extension Introducer
  gif.writeByte(0xff); // Application Extension
  gif.writeByte(0x0b); // Block Size
  gif.writeString('NETSCAPE2.0');
  gif.writeByte(0x03); // Sub-block size
  gif.writeByte(0x01); // Sub-block ID
  gif.writeShort(0x0000); // Loop count (0 = infinite)
  gif.writeByte(0x00); // Block Terminator

  // 4. Encode Frames
  for (let f = 0; f < framesData.length; f++) {
    const { palette, indexed } = framesData[f];
    const paletteColorCount = palette.length / 3;
    const gctSizePower = Math.max(1, Math.ceil(Math.log2(paletteColorCount)));
    const minCodeSize = Math.max(2, gctSizePower);

    // Graphic Control Extension
    gif.writeByte(0x21);
    gif.writeByte(0xf9);
    gif.writeByte(0x04); // Block size
    gif.writeByte(0x04); // Disposal method: Restore to background (0x04 or 0x00)
    gif.writeShort(frameDelay);
    gif.writeByte(0x00); // Transparent color index
    gif.writeByte(0x00); // Block terminator

    // Image Descriptor with Local Color Table
    gif.writeByte(0x2c); // Image separator
    gif.writeShort(0); // Left
    gif.writeShort(0); // Top
    gif.writeShort(width);
    gif.writeShort(height);
    // Local Color Table Flag (1), Interlace (0), Sort (0), Size (gctSizePower - 1)
    gif.writeByte(0x80 | (gctSizePower - 1));

    // Local Color Table
    for (let p = 0; p < (1 << gctSizePower); p++) {
      if (p < paletteColorCount) {
        gif.writeByte(palette[p * 3]);
        gif.writeByte(palette[p * 3 + 1]);
        gif.writeByte(palette[p * 3 + 2]);
      } else {
        gif.writeByte(0);
        gif.writeByte(0);
        gif.writeByte(0);
      }
    }

    // LZW Minimum Code Size
    gif.writeByte(minCodeSize);

    // LZW Compressed Image Data
    lzwCompress(minCodeSize, indexed, gif);

    if (onProgress) {
      onProgress(80 + Math.round(((f + 1) / framesData.length) * 20), f + 1, totalFrames);
    }
  }

  // 5. GIF Trailer
  gif.writeByte(0x3b);

  return new Blob([gif.getUint8Array()], { type: 'image/gif' });
}
