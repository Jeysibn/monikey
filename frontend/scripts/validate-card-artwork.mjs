import { access, readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname, resolve as resolvePath } from 'node:path'
import { findUnapprovedArtwork, isSafeLocalAssetPath, validateInventory } from './artworkResearch.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const inventory = JSON.parse(await readFile(resolvePath(repoRoot, 'docs/design/card-artwork-inventory.json'), 'utf8'))
const errors = validateInventory(inventory.items)
const generated = await readFile(resolve(repoRoot, 'frontend/src/wallet/approvedArtwork.generated.ts'), 'utf8')
const generatedIds = [...generated.matchAll(/\bid:\s*"([a-z0-9-]+)"/g)].map((match) => match[1])
const approvedIds = inventory.items.filter((item) => item.catalog_status === 'approved').map((item) => item.id).sort()
if (JSON.stringify([...generatedIds].sort()) !== JSON.stringify(approvedIds)) errors.push('generated approved catalog does not match approved inventory IDs')

for (const item of inventory.items) {
  if (item.catalog_status === 'approved' && isSafeLocalAssetPath(item.local_asset_path)) {
    try { await access(resolve(repoRoot, 'frontend/public', item.local_asset_path.slice(1))) }
    catch { errors.push(`${item.id}: approved local asset is missing (${item.local_asset_path})`) }
  }
}

// Release gate: only the original MoniKey default and catalog-approved local assets may ship, in the source tree
// and in a production build (dist) if one exists. Unverified issuer-style images must never come back.
const DEFAULT_ARTWORK = '/card-art/monikey-default.svg'
// Exact first-party concept allowlist is derived from supported product IDs, not from arbitrary files in public/.
// Unsupported Atome is intentionally absent from CARD_PRODUCTS.
const productsText = await readFile(resolve(repoRoot, 'frontend/src/wallet/cardProducts.ts'), 'utf8')
const productIds = [...productsText.matchAll(/^\s*\{\s*id:\s*'([a-z0-9-]+)'\s*,\s*issuer:/gm)].map((match) => match[1])
if (productIds.length !== 18 || new Set(productIds).size !== 18) errors.push('Expected exactly 18 unique supported card product IDs')
const originalPaths = productIds.map((id) => `/card-art/monikey-${id}.svg`)
for (const path of originalPaths) {
  try {
    const svg = await readFile(resolve(repoRoot, 'frontend/public', path.slice(1)), 'utf8')
    if (!/^<svg\b/.test(svg) || /<(?:text|image|script|foreignObject)\b|\b(?:href|src)\s*=/i.test(svg)) {
      errors.push(`${path}: original concept must be self-contained, graphical SVG without text, embedded images, scripts or links`)
    }
  } catch { errors.push(`${path}: missing original MoniKey card artwork`) }
}
const allowed = new Set([DEFAULT_ARTWORK, ...originalPaths, ...inventory.items.filter((item) => item.catalog_status === 'approved').map((item) => item.local_asset_path)])
async function listFiles(dir, prefix) {
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    const nested = await Promise.all(entries.map((entry) => entry.isDirectory() ? listFiles(resolve(dir, entry.name), `${prefix}/${entry.name}`) : [`${prefix}/${entry.name}`]))
    return nested.flat()
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
}
async function listSources(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = resolve(dir, entry.name)
    if (entry.isDirectory()) return listSources(path)
    return /\.(tsx?|css|html)$/.test(entry.name) ? [{ path: path.slice(repoRoot.length + 1), text: await readFile(path, 'utf8') }] : []
  }))
  return nested.flat()
}
const shipped = [
  ...await listFiles(resolve(repoRoot, 'frontend/public/card-art'), '/card-art'),
  ...await listFiles(resolve(repoRoot, 'frontend/dist/card-art'), '/card-art'),
]
errors.push(...findUnapprovedArtwork({ files: shipped, allowed, sources: await listSources(resolve(repoRoot, 'frontend/src')) }))

if (errors.length) {
  console.error(errors.map((error) => `ERROR: ${error}`).join('\n'))
  process.exitCode = 1
} else {
  const approved = inventory.items.filter((item) => item.catalog_status === 'approved').length
  console.log(`Artwork inventory valid: ${inventory.items.length} unique records, ${approved} approved local assets; ${originalPaths.length} first-party concepts and ${new Set(shipped).size} card-art file(s) bundled, all approved.`)
}
