/**
 * Minimal ZIP writer, stored method only.
 *
 * Exists because the colour separation export produces a set of files rather
 * than one, and firing N downloads from a single gesture is throttled or
 * blocked outright by Chrome and Safari.
 *
 * No compression, and none wanted: PNG and JPG carry their own deflate stream,
 * so a second pass over them buys a fraction of a percent for a dependency and
 * a chunk of CPU. SVG would compress, but it is the one format the separation
 * export can also emit as a single layered file, so it rarely arrives here in
 * bulk.
 *
 * Format: PKWARE APPNOTE 6.3.2, sections 4.3.7 (local header), 4.3.12 (central
 * directory) and 4.3.16 (end of central directory). No Zip64 -- the archive
 * would have to pass 4 GB or 65,535 entries, and a separation that large is a
 * bug upstream, so both are checked rather than silently truncated.
 */

export interface ZipEntry {
  /** Path inside the archive. Forward slashes only; no leading slash. */
  name: string;
  data: Uint8Array;
}

const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;

/** Bit 11: filename and comment are UTF-8 rather than CP437. */
const FLAG_UTF8 = 0x0800;

const MAX_ENTRIES = 0xffff;
const MAX_SIZE = 0xffffffff;

let crcTable: Uint32Array | null = null;

function getCrcTable(): Uint32Array {
  if (crcTable) return crcTable;
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[n] = c >>> 0;
  }
  crcTable = t;
  return t;
}

export function crc32(data: Uint8Array): number {
  const t = getCrcTable();
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    c = t[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * MS-DOS date and time, the only timestamp the base format has. Two-second
 * resolution, and 1980 is the epoch -- anything earlier is clamped rather than
 * wrapped into a nonsense year.
 */
function dosDateTime(d: Date): { time: number; date: number } {
  const year = Math.max(1980, d.getFullYear());
  return {
    time: ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) | ((d.getSeconds() / 2) & 31),
    date: (((year - 1980) & 127) << 9) | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31),
  };
}

/** Whether the name needs the UTF-8 flag, i.e. is not plain ASCII. */
function isAscii(s: string): boolean {
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) > 127) return false;
  return true;
}

/**
 * Builds a ZIP archive in memory.
 *
 * @param entries files to store, in the order they should appear
 * @param when    timestamp stamped on every entry; defaults to now
 */
export function createZip(entries: ZipEntry[], when: Date = new Date()): Blob {
  if (entries.length > MAX_ENTRIES) {
    throw new Error(`ZIP supports at most ${MAX_ENTRIES} entries without Zip64 (got ${entries.length})`);
  }

  const encoder = new TextEncoder();
  const { time, date } = dosDateTime(when);

  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const data = entry.data;
    if (data.length > MAX_SIZE) {
      throw new Error(`ZIP entry "${entry.name}" exceeds 4 GB and needs Zip64`);
    }
    const crc = crc32(data);
    const flags = isAscii(entry.name) ? 0 : FLAG_UTF8;

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, LOCAL_SIG, true);
    lv.setUint16(4, 20, true); // version needed: 2.0, stored
    lv.setUint16(6, flags, true);
    lv.setUint16(8, 0, true); // method 0 = stored
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true); // compressed size == uncompressed
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true); // no extra field
    local.set(nameBytes, 30);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, CENTRAL_SIG, true);
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true); // version needed
    cv.setUint16(8, flags, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true); // extra
    cv.setUint16(32, 0, true); // comment
    cv.setUint16(34, 0, true); // disk number start
    cv.setUint16(36, 0, true); // internal attributes
    cv.setUint32(38, 0, true); // external attributes
    cv.setUint32(42, offset, true); // offset of the local header
    central.set(nameBytes, 46);

    locals.push(local, data);
    centrals.push(central);
    offset += local.length + data.length;
  }

  const centralSize = centrals.reduce((a, b) => a + b.length, 0);
  if (offset > MAX_SIZE || centralSize > MAX_SIZE) {
    throw new Error('ZIP archive exceeds 4 GB and needs Zip64');
  }

  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, EOCD_SIG, true);
  ev.setUint16(4, 0, true); // this disk
  ev.setUint16(6, 0, true); // disk with central directory
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true); // central directory starts after the last entry
  ev.setUint16(20, 0, true); // no archive comment

  return new Blob([...locals, ...centrals, eocd], { type: 'application/zip' });
}
