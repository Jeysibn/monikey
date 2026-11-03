import { extname } from 'node:path'

export const ACCOUNT_TYPES = new Set(['cash', 'bank', 'ewallet', 'credit_card'])
export const CATALOG_STATUSES = new Set(['candidate', 'verified', 'approved', 'rejected', 'retired'])

export function slug(value) {
  return value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export function mergeCandidates(existing, discovered) {
  const merged = new Map(existing.map((item) => [item.id, item]))
  for (const candidate of discovered) {
    const previous = merged.get(candidate.id)
    merged.set(candidate.id, previous ? {
      ...previous,
      candidate_image_url: candidate.candidate_image_url ?? previous.candidate_image_url,
      image_format: candidate.image_format ?? previous.image_format,
      image_width: candidate.image_width ?? previous.image_width,
      image_height: candidate.image_height ?? previous.image_height,
      source_check: candidate.source_check,
      last_checked_on: candidate.last_checked_on,
    } : candidate)
  }
  return [...merged.values()].sort((a, b) => a.id.localeCompare(b.id))
}

export function validateInventory(items) {
  const errors = []
  const ids = new Set()
  for (const item of items) {
    if (!item.id || ids.has(item.id)) errors.push(`duplicate or missing id: ${item.id ?? '(missing)'}`)
    ids.add(item.id)
    if (!CATALOG_STATUSES.has(item.catalog_status)) errors.push(`${item.id}: invalid catalog_status`)
    if (!Array.isArray(item.account_types) || item.account_types.some((type) => !ACCOUNT_TYPES.has(type))) {
      errors.push(`${item.id}: unsupported account type`)
    }
    if (!item.official_product_url || !isHttpsUrl(item.official_product_url)) errors.push(`${item.id}: official_product_url must be HTTPS`)
    if (item.catalog_status === 'candidate' && item.local_asset_path !== null) errors.push(`${item.id}: candidate cannot reference a local asset`)
    if (item.catalog_status === 'approved') {
      if (!item.source_verified) errors.push(`${item.id}: approved item needs verified product source`)
      if (!Array.isArray(item.account_types) || item.account_types.length === 0) errors.push(`${item.id}: approved item needs a supported account type`)
      if (!isRealDate(item.verified_on)) errors.push(`${item.id}: approved item needs a real verification date`)
      if (item.permission_status !== 'approved' || !hasPermissionEvidence(item.permission_evidence)) errors.push(`${item.id}: approved item needs redistribution permission evidence`)
      if (!item.candidate_image_url || !['official-issuer-cdn', 'official-page-embedded-external'].includes(item.image_source_classification)) {
        errors.push(`${item.id}: approved item needs a source image linked from an official issuer page`)
      }
      if (!isSafeLocalAssetPath(item.local_asset_path)) errors.push(`${item.id}: approved item needs a safe local asset`)
    }
    if (item.candidate_image_url && !isHttpsUrl(item.candidate_image_url)) errors.push(`${item.id}: candidate image URL must be HTTPS`)
  }
  return errors
}

export function isHttpsUrl(value) {
  try { return new URL(value).protocol === 'https:' } catch { return false }
}

function isRealDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

function hasPermissionEvidence(value) {
  return typeof value === 'string' && /redistribut|public distribution|application bundle/i.test(value)
    && /https:\/\/\S+|(?:^|\s)(?:docs|licenses|assets?)\/[\w./-]+/i.test(value)
}

export function isSafeLocalAssetPath(value) {
  return typeof value === 'string' && /^\/card-art\/[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?\.(?:svg|png|jpe?g|webp)$/.test(value)
}

export function isOfficialHost(url, hosts) {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && hosts.includes(parsed.hostname.toLowerCase())
  } catch { return false }
}

export function validatePermissionEvidence(record, artworkId) {
  const errors = []
  if (!record || record.artwork_id !== artworkId) errors.push('rights record artwork_id must match the candidate')
  if (record?.status !== 'approved') errors.push('rights record status must be approved')
  if (!isHttpsUrl(record?.permission_source_url)) errors.push('permission_source_url must be an HTTPS evidence link')
  if (!/redistribut|public distribution|application bundle/i.test(record?.permission_scope ?? '')) {
    errors.push('permission_scope must explicitly permit redistribution or application bundling')
  }
  if (typeof record?.evidence_summary !== 'string' || record.evidence_summary.trim().length < 20) {
    errors.push('evidence_summary must describe the permission evidence')
  }
  if (!isRealDate(record?.reviewed_on)) errors.push('reviewed_on must be a real YYYY-MM-DD date')
  if (typeof record?.reviewer !== 'string' || !record.reviewer.trim()) errors.push('reviewer is required')
  return errors
}

export function inspectImageHeader(buffer, filename) {
  if (!Buffer.isBuffer(buffer) || buffer.length > 12 * 1024 * 1024) throw new Error('Image must be a buffer no larger than 12 MiB')
  const extension = extname(filename).toLowerCase()
  let format
  let width
  let height
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    format = 'png'; width = buffer.readUInt32BE(16); height = buffer.readUInt32BE(20)
  } else if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    format = 'webp'
    const kind = buffer.toString('ascii', 12, 16)
    if (kind === 'VP8X' && buffer.length >= 30) {
      width = 1 + buffer.readUIntLE(24, 3); height = 1 + buffer.readUIntLE(27, 3)
    } else if (kind === 'VP8L' && buffer.length >= 25) {
      const bits = buffer.readUInt32LE(21); width = (bits & 0x3fff) + 1; height = ((bits >> 14) & 0x3fff) + 1
    } else if (kind === 'VP8 ' && buffer.length >= 30) {
      width = buffer.readUInt16LE(26) & 0x3fff; height = buffer.readUInt16LE(28) & 0x3fff
    }
  } else if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    format = 'jpeg'
    for (let offset = 2; offset + 9 < buffer.length;) {
      if (buffer[offset] !== 0xff) { offset++; continue }
      const marker = buffer[offset + 1]
      const size = buffer.readUInt16BE(offset + 2)
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        height = buffer.readUInt16BE(offset + 5); width = buffer.readUInt16BE(offset + 7); break
      }
      if (size < 2) break
      offset += size + 2
    }
  } else throw new Error('Unsupported or unrecognized image format (use PNG, JPEG, or WebP)')

  const expected = { '.png': 'png', '.jpg': 'jpeg', '.jpeg': 'jpeg', '.webp': 'webp' }[extension]
  if (!expected || expected !== format) throw new Error('File extension does not match its image content')
  if (!width || !height || width < 200 || height < 126 || width > 4096 || height > 4096) {
    throw new Error('Image dimensions must be readable and between 200×126 and 4096×4096')
  }
  const text = buffer.toString('latin1')
  if (/(?:\d[ -]?){13,19}/.test(text)) throw new Error('Image bytes contain a payment-number-like sequence; inspect and provide a clean product artwork file')
  return { format, width, height }
}

/**
 * Release gate: list files under a card-art directory that are not allowed to ship, and source references to
 * the removed generated-image directory. `allowed` is the set of root-relative paths ("/card-art/x.svg") that the
 * approved catalog (plus the original MoniKey default) may bundle. Returns human-readable problems.
 */
export function findUnapprovedArtwork({ files, allowed, sources = [] }) {
  const problems = []
  for (const file of files) {
    if (!allowed.has(file)) problems.push(`${file} is bundled but is not an approved artwork file`)
  }
  for (const { path, text } of sources) {
    if (/card-art\/generated|card-art\/concepts/.test(text)) problems.push(`${path} references a removed, unapproved artwork directory`)
  }
  return problems
}
