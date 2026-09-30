// Shooting order for a batch of photos, before anything is uploaded (the upload re-encodes photos and strips all
// metadata, so the date has to be read here, from the original file, in the browser).
//
// Order: the photo's own "date taken" (EXIF DateTimeOriginal, with its sub-seconds so a burst shot within one
// second keeps its order), then the file name in natural order (IMG_8101 before IMG_8102, 9 before 10), then the
// file's last-modified time. Photos without a date taken (screenshots, some exports) come after the dated ones,
// in name order: mixing them in by name would scatter them between unrelated dated shots.
//
// Copies from Google Drive, WhatsApp or a download keep the photo's bytes (and so its EXIF) but not its file time,
// which is why last-modified comes last.

const EXIF_SCAN_BYTES = 256 * 1024   // EXIF sits in the first APP1 segment, near the start of the file

// "2026:08:07 14:03:21" (+ sub-seconds "45") -> ms since epoch, read as local time like the camera wrote it.
function parseExifDate(s, sub) {
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(String(s || '').trim())
  if (!m) return null
  const [, y, mo, d, h, mi, se] = m.map(Number)
  if (!y || y < 1970 || mo < 1 || mo > 12) return null   // "0000:00:00 00:00:00" = unset
  const frac = sub && /^\d+$/.test(sub) ? Number(`0.${sub}`) * 1000 : 0
  return new Date(y, mo - 1, d, h, mi, se).getTime() + frac
}

// Reads EXIF DateTimeOriginal (0x9003) + SubSecTimeOriginal (0x9291) from a JPEG's bytes. null when there is none,
// or for anything that isn't a JPEG with EXIF. Never throws.
export function exifDateTakenFromBuffer(buffer) {
  try {
    const v = new DataView(buffer)
    if (v.byteLength < 4 || v.getUint16(0) !== 0xFFD8) return null
    let p = 2
    while (p + 4 <= v.byteLength) {
      if (v.getUint8(p) !== 0xFF) return null
      const marker = v.getUint8(p + 1)
      const size = v.getUint16(p + 2)
      if (marker === 0xDA || marker === 0xD9) return null            // image data started: no EXIF found
      if (marker === 0xE1 && p + 10 <= v.byteLength && v.getUint32(p + 4) === 0x45786966 && v.getUint16(p + 8) === 0) {
        return readTiff(v, p + 10, Math.min(v.byteLength, p + 2 + size))
      }
      p += 2 + size
    }
  } catch { /* truncated or odd file: no date */ }
  return null
}

function readTiff(v, t, end) {
  const order = v.getUint16(t)
  const le = order === 0x4949                                         // "II" little-endian, "MM" big-endian
  if (!le && order !== 0x4D4D) return null
  const u16 = o => v.getUint16(t + o, le)
  const u32 = o => v.getUint32(t + o, le)
  const ascii = (entry) => {
    const count = u32(entry + 4)
    const off = count <= 4 ? entry + 8 : u32(entry + 8)
    let s = ''
    for (let i = 0; i < count && t + off + i < end; i++) {
      const c = v.getUint8(t + off + i)
      if (!c) break
      s += String.fromCharCode(c)
    }
    return s
  }
  const tags = (ifd) => {
    const out = {}
    if (!ifd || t + ifd + 2 > end) return out
    const n = u16(ifd)
    for (let i = 0; i < n; i++) {
      const e = ifd + 2 + i * 12
      if (t + e + 12 > end) break
      out[u16(e)] = e
    }
    return out
  }
  const ifd0 = tags(u32(4))
  if (ifd0[0x8769] == null) return null                               // no Exif sub-IFD
  const exif = tags(u32(ifd0[0x8769] + 8))
  if (exif[0x9003] == null) return null
  return parseExifDate(ascii(exif[0x9003]), exif[0x9291] != null ? ascii(exif[0x9291]).trim() : '')
}

// file: a File/Blob. Reads only the start of the file.
export async function exifDateTaken(file) {
  if (!file || typeof file.slice !== 'function') return null
  try { return exifDateTakenFromBuffer(await file.slice(0, EXIF_SCAN_BYTES).arrayBuffer()) } catch { return null }
}

const byName = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })

// items: [{ name, lastModified, taken }] (taken: ms or null). Returns a new array in shooting order.
export function shootingOrder(items) {
  return [...items].sort((a, b) =>
    (a.taken == null) - (b.taken == null)                              // dated photos first
    || (a.taken != null && b.taken != null ? a.taken - b.taken : 0)
    || byName(a.name, b.name)
    || (a.lastModified || 0) - (b.lastModified || 0))
}

// Files -> the same files in shooting order (reads each one's date taken).
export async function sortFilesByShootingOrder(files) {
  const withDates = await Promise.all(files.map(async f => ({ f, name: f.name, lastModified: f.lastModified, taken: await exifDateTaken(f) })))
  return shootingOrder(withDates).map(x => x.f)
}

// Moves `id` to sit before (or after) `targetId` in `order`. Returns a new array; unchanged if either is missing.
export function moveInOrder(order, id, targetId, after = false) {
  if (id === targetId || !order.includes(id) || !order.includes(targetId)) return order
  const rest = order.filter(x => x !== id)
  const at = rest.indexOf(targetId) + (after ? 1 : 0)
  return [...rest.slice(0, at), id, ...rest.slice(at)]
}
