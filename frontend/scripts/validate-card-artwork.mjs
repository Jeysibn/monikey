import { access, readFile, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname, resolve as resolvePath } from 'node:path'
import { findUnapprovedArtwork, isSafeLocalAssetPath, inspectImageHeader, validateInventory } from './artworkResearch.mjs'

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

// Only exact user-supplied historical WebP Git blobs (not arbitrary issuer files) may ship.
// The historical Maya Visa Platinum WebP and unsupported Atome MUST NOT ship.
const recoveredBlobShas = {
  "bdo-debit-mastercard": "7ae05edf14e710d0dac314b2bdf42c78482e1a7e",
  "bpi-debit-mastercard": "5b1b14894842de06a6ecb7cd8010ceb28f81fe7a",
  "bpi-debit-cirrus-gold": "a75e01155277c589bda18f598dcfba918766bfad",
  "bpi-debit-cirrus-red": "0a30e46ae96c48d89b6b22f2bf6520e071bcc128",
  "gotyme-visa-debit": "e2b6f1261c5719b8477f915730309cfecff40fa9",
  "maribank-debit": "f5bf74385e5f96911d245aac50569e5bcbd8fcd6",
  "gcash-visa": "743e6c99142fa4ce246732f3e392e96ac3d0c9fe",
  "gcash-mastercard": "d894bfc84fa6a1f316fa6ea92626ad4efd53f365",
  "maya-visa": "5e426497a62760542afdea768dc91e684153c043",
  "maya-mastercard": "434b946d7d9b5a46a53945b6d5b887320694be46",
  "maya-virtual": "fc5f4478cad2aef87eb002cbb0bedc39d8cbe13b",
  "bdo-visa-classic": "c0986103638dbcf4bab2c53ced20aa3b4070aa57",
  "bdo-visa-gold": "53e459c44209245139edb8194cd8f6dc38d12502",
  "bdo-visa-platinum": "ce8c378e9f54995c880efa768b4c5db259e52268",
  "bdo-visa-signature": "486a518d1af33cf5d671e5a04f3ca67e5127e785",
  "bpi-platinum-rewards": "2ac5e72bbdefdb379b2f85253bbf96a59b1a4146",
  "unionbank-rewards-visa-platinum": "2e4ba4c6272ee50a82f3b09d53f2fe9e7083d062"
}
const recoveredPaths = productIds.map(id => id === 'maya-visa-platinum'
  ? '/card-art/recovered-maya-visa-platinum.svg'
  : `/card-art/recovered-${id}.webp`)
for (const id of productIds) {
  const file = id === 'maya-visa-platinum'
    ? '/card-art/recovered-maya-visa-platinum.svg'
    : `/card-art/recovered-${id}.webp`
  try {
    const bytes = await readFile(resolve(repoRoot, 'frontend/public', file.slice(1)))
    if (id === 'maya-visa-platinum') {
      const svg = bytes.toString('utf8')
      if (!/^<svg\\b/.test(svg) || /<(?:script|image|foreignObject)\\b|\\b(?:href|src)\\s*=/i.test(svg)
        || /(?:\\d[ -]?){13,19}/.test(svg)
        || !svg.includes('>maya</text>') || !svg.includes('>VISA</text>')) {
        errors.push('Regenerated Maya SVG must be local, self-contained and free of card numbers')
      }
    } else {
      const hash = createHash('sha1').update(`blob ${bytes.length}\\0`).update(bytes).digest('hex')
      if (hash !== recoveredBlobShas[id]) errors.push(`${id}: recovered image changed from verified historical Git blob`)
      inspectImageHeader(bytes, file)
    }
  } catch (error) { errors.push(`${id}: recovered artwork invalid or missing (${error.message})`) }
}
for (const file of recoveredPaths) {
  try { await access(resolve(repoRoot, 'frontend/dist', file.slice(1))) }
  catch { errors.push(`Production build missing ${file}; art would not deploy with Nginx`) }
}

const allowed = new Set([DEFAULT_ARTWORK, ...originalPaths, ...recoveredPaths, ...inventory.items.filter((item) => item.catalog_status === 'approved').map((item) => item.local_asset_path)])
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
