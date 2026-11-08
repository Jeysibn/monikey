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
  try {
    const bytes = await readFile(resolve(root, expectedPath))
    const blobSha = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
    if (blobSha !== entry.historicalGitBlobSha) errors.push(`Original Git blob changed: ${entry.id}`)
    if (bytes.length !== entry.bytes) errors.push(`Historical byte count changed: ${entry.id}`)
    const image = inspectImageHeader(bytes, expectedPath)
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
  console.log('19 historical artwork blobs verified; 18 supported matches + Atome review-only; all release permissions pending; artwork stays out of production bundle.')
}
