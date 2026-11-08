import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inspectImageHeader } from './artworkResearch.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const reviewRoot = 'docs/design/card-artwork-review'
const file = JSON.parse(await readFile(resolve(root, reviewRoot, 'manifest.json'), 'utf8'))
const productText = await readFile(resolve(root, 'frontend/src/wallet/cardProducts.ts'), 'utf8')
const supported = new Set([...productText.matchAll(/^\s*\{\s*id:\s*'([a-z0-9-]+)'\s*,\s*issuer:/gm)].map((match) => match[1]))
const errors = []
// Quarantine only this exact historical blob. Production importer and artwork:validate
// retain their strict payment-number-like byte detection. A green archive check
// does NOT approve this asset for release.
const REVIEW_ONLY_PATTERN_BLOB = 'ac3f1f395918c184ae6dde32edf365ce34f4cc16'
const REVIEW_ONLY_PATTERN_ID = 'maya-visa-platinum'
const REVIEW_FLAG = 'review-required:payment-number-like-byte-sequence-in-vp8'
const warnings = []

function inspectQuarantinedVp8(bytes, entry) {
  // Determine the dimensions independently, without weakening inspectImageHeader.
  // This is limited to the immutable review-only VP8 file.
  if (bytes.length < 30
    || bytes.toString('ascii', 0, 4) !== 'RIFF'
    || bytes.toString('ascii', 8, 12) !== 'WEBP'
    || bytes.toString('ascii', 12, 16) !== 'VP8 '
    || bytes.readUInt32LE(4) + 8 !== bytes.length
    || bytes.readUInt32LE(16) + 20 > bytes.length) {
    throw new Error('Quarantined WebP container or VP8 chunk is malformed')
  }
  const width = bytes.readUInt16LE(26) & 0x3fff
  const height = bytes.readUInt16LE(28) & 0x3fff
  if (width < 200 || height < 126 || width > 4096 || height > 4096) throw new Error('Quarantined WebP has invalid dimensions')
  if (entry.historicalGitBlobSha !== REVIEW_ONLY_PATTERN_BLOB || entry.id !== REVIEW_ONLY_PATTERN_ID
    || entry.contentScan !== REVIEW_FLAG || entry.permissionStatus !== 'pending' || entry.releaseEligible !== false) {
    throw new Error('Quarantined WebP provenance or review status mismatch')
  }
  return { format: 'webp', width, height }
}

const ids = new Set()
const entries = file.assets ?? []
if (file.schemaVersion !== 1 || entries.length !== 19 || supported.size !== 18) errors.push('Expected 19 historical entries and 18 supported wallet products')
for (const entry of entries) {
  const expectedPath = `${reviewRoot}/generated/${entry.id}.webp`
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.id) || ids.has(entry.id)) {
    errors.push(`Invalid or duplicate card ID: ${entry.id}`)
    continue
  }
  ids.add(entry.id)
  if (entry.reviewAsset !== expectedPath || entry.historicalAsset !== `/card-art/generated/${entry.id}.webp`) {
    errors.push(`Unexpected asset path for ${entry.id}`)
    continue
  }
  if (entry.releaseEligible !== false || entry.permissionStatus !== 'pending') errors.push(`${entry.id} must remain blocked pending rights approval`)
  if (entry.supportedInCurrentWallet !== supported.has(entry.id)) errors.push(`Unexpected supported-product classification for ${entry.id}`)
  if (entry.id === 'atome-credit-black' && entry.supportedInCurrentWallet !== false) errors.push('Atome must remain excluded')
  if (entry.id === REVIEW_ONLY_PATTERN_ID && entry.contentScan !== REVIEW_FLAG) errors.push('Known historical VP8 byte-pattern finding must remain quarantined')
  if (entry.id !== REVIEW_ONLY_PATTERN_ID && entry.contentScan !== undefined) errors.push(`Unexpected contentScan override for ${entry.id}`)
  try {
    const bytes = await readFile(resolve(root, expectedPath))
    const blobSha = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
    if (blobSha !== entry.historicalGitBlobSha) errors.push(`Original Git blob changed: ${entry.id}`)
    if (bytes.length !== entry.bytes) errors.push(`Historical byte count changed: ${entry.id}`)
    let image
    try {
      image = inspectImageHeader(bytes, expectedPath)
      if (entry.id === REVIEW_ONLY_PATTERN_ID) errors.push('Quarantined historical image unexpectedly passed the strict content scanner; review the archived bytes and flag')
    } catch (error) {
      if (entry.id === REVIEW_ONLY_PATTERN_ID && entry.contentScan === REVIEW_FLAG
        && blobSha === REVIEW_ONLY_PATTERN_BLOB
        && error.message === 'Image bytes contain a payment-number-like sequence; inspect and provide a clean product artwork file') {
        image = inspectQuarantinedVp8(bytes, entry)
        warnings.push(`${entry.id}: byte-pattern alert in historical compressed VP8 data; quarantined for manual review and NOT releasable`)
      } else {
        throw error
      }
    }
    if (image.format !== 'webp' || image.width !== entry.width || image.height !== entry.height) errors.push(`Historical artwork format/dimensions changed: ${entry.id}`)
  } catch (error) {
    errors.push(`Invalid artwork for ${entry.id}: ${error.message}`)
  }
}
for (const id of supported) if (!ids.has(id)) errors.push(`Missing supported card artwork: ${id}`)
if (!ids.has('atome-credit-black')) errors.push('Missing historical Atome review-only image')
const folder = await readdir(resolve(root, reviewRoot, 'generated'))
if (folder.length !== 19 || folder.some((name) => !ids.has(name.replace(/\.webp$/, '')))) errors.push('Review directory has unexpected or missing assets')
try { await readFile(resolve(root, 'frontend/public/card-art/generated/manifest.json')); errors.push('Historical art must not be bundled in frontend/public') } catch(error) { if (error.code !== 'ENOENT') errors.push(`Unable to verify shipped-asset isolation: ${error.message}`) }
if (errors.length) {
  console.error(errors.join('\n'))
  process.exitCode = 1
} else {
  for (const warning of warnings) console.warn(`REVIEW REQUIRED: ${warning}`)
  console.log('19 historical artwork blobs verified for archival review; 1 historical file quarantined; 18 supported matches + Atome review-only; all release permissions pending; artwork stays out of production bundle.')
}
