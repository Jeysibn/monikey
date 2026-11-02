import { access, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname, resolve as resolvePath } from 'node:path'
import { isSafeLocalAssetPath, validateInventory } from './artworkResearch.mjs'

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

if (errors.length) {
  console.error(errors.map((error) => `ERROR: ${error}`).join('\n'))
  process.exitCode = 1
} else {
  const approved = inventory.items.filter((item) => item.catalog_status === 'approved').length
  console.log(`Artwork inventory valid: ${inventory.items.length} unique records, ${approved} approved local assets.`)
}
