import { copyFile, lstat, readFile, realpath, rename, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { basename, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { ACCOUNT_TYPES, inspectImageHeader, isOfficialHost, isSafeLocalAssetPath, slug, validatePermissionEvidence } from './artworkResearch.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const inventoryPath = resolve(repoRoot, 'docs/design/card-artwork-inventory.json')
const generatedPath = resolve(repoRoot, 'frontend/src/wallet/approvedArtwork.generated.ts')
const issuerHosts = { BDO: ['www.bdo.com.ph'], BPI: ['www.bpi.com.ph'], Maya: ['www.maya.ph'], GCash: ['help.gcash.com'] }
const issuerImageHosts = { ...issuerHosts, BPI: ['www.bpi.com.ph', 's7ap1.scene7.com'] }

function args(argv) {
  const parsed = {}
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--privacy-reviewed') { parsed.privacyReviewed = true; continue }
    if (argv[index].startsWith('--')) parsed[argv[index].slice(2)] = argv[++index]
  }
  return parsed
}

function assertInsideRepo(path) {
  const rel = relative(repoRoot, path)
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error('Rights evidence file must be inside this repository')
}

async function atomicWrite(path, contents) {
  const temporary = `${path}.${process.pid}.tmp`
  await writeFile(temporary, contents, { flag: 'wx' })
  await rename(temporary, path)
}

const options = args(process.argv.slice(2))
if (!options.id || !options.file || !options.rights || !options['source-url'] || !options.privacyReviewed) {
  console.error('Usage: npm run artwork:import -- --id <candidate-id> --file <authorized-local-image> --source-url <official-image-url> --rights <repo-relative-rights-record.json> --privacy-reviewed')
  process.exit(2)
}

const inventory = JSON.parse(await readFile(inventoryPath, 'utf8'))
const item = inventory.items.find((candidate) => candidate.id === options.id)
if (!item) throw new Error(`Unknown candidate: ${options.id}`)
if (!item.source_verified || !['candidate', 'verified'].includes(item.catalog_status)) throw new Error('Candidate product source must be verified and not rejected or retired')
if (!Array.isArray(item.account_types) || item.account_types.length === 0 || item.account_types.some((type) => !ACCOUNT_TYPES.has(type))
  || !['credit', 'debit', 'prepaid', 'virtual'].includes(item.card_type)) {
  throw new Error('Candidate needs a reviewed card type and at least one supported MoniKey account type')
}
const hosts = issuerHosts[item.issuer] ?? []
if (!isOfficialHost(options['source-url'], issuerImageHosts[item.issuer] ?? hosts) || item.candidate_image_url !== options['source-url']) {
  throw new Error('Source image URL must exactly match this candidate’s issuer-hosted or official-page-embedded image URL')
}
if (!['official-issuer-cdn', 'official-page-embedded-external'].includes(item.image_source_classification)) {
  throw new Error('Candidate image must be linked from an official issuer page and classified for review')
}

const rightsPath = resolve(repoRoot, options.rights)
assertInsideRepo(rightsPath)
assertInsideRepo(await realpath(rightsPath))
const rightsFile = await lstat(rightsPath)
if (!rightsFile.isFile() || rightsFile.isSymbolicLink()) throw new Error('Rights evidence must be a regular repository file')
const rightsRecord = JSON.parse(await readFile(rightsPath, 'utf8'))
const permissionErrors = validatePermissionEvidence(rightsRecord, item.id)
if (permissionErrors.length) throw new Error(permissionErrors.join('; '))

const sourcePath = resolve(options.file)
const sourceStat = await lstat(sourcePath)
if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) throw new Error('Source artwork must be a regular local file, not a symlink or directory')
if (sourceStat.size > 12 * 1024 * 1024) throw new Error('Source artwork must be no larger than 12 MiB')
const imageBuffer = await readFile(sourcePath)
const image = inspectImageHeader(imageBuffer, basename(sourcePath))
const hash = createHash('sha256').update(imageBuffer).digest('hex')
const extension = { jpeg: '.jpg', png: '.png', webp: '.webp' }[image.format]
const filename = `${slug(item.id)}-${hash.slice(0, 8)}${extension}`
const localAssetPath = `/card-art/${filename}`
if (!isSafeLocalAssetPath(localAssetPath)) throw new Error('Generated asset path failed local path validation')
if (item.local_asset_path && item.local_asset_path !== localAssetPath) throw new Error('Candidate already references a different local asset; review it manually first')

const publicDir = resolve(repoRoot, 'frontend/public/card-art')
const destination = resolve(publicDir, filename)
const permissionEvidence = `${relative(repoRoot, rightsPath)} — ${rightsRecord.permission_source_url}; scope: ${rightsRecord.permission_scope}`
item.permission_status = 'approved'
item.permission_evidence = permissionEvidence
item.permission_reviewed_on = rightsRecord.reviewed_on
item.permission_reviewer = rightsRecord.reviewer
item.local_asset_path = localAssetPath
item.image_format = image.format
item.image_width = image.width
item.image_height = image.height
item.source_sha256 = hash
item.catalog_status = 'approved'

const approved = inventory.items.filter((entry) => entry.catalog_status === 'approved').map((entry) => ({
  id: entry.id,
  issuer: entry.issuer,
  product: entry.product,
  variant: entry.variant,
  accountTypes: entry.account_types,
  kind: entry.card_type === 'virtual' ? 'virtual' : 'physical',
  sourcePageUrl: entry.official_product_url,
  localAssetPath: entry.local_asset_path,
  status: 'approved',
  verifiedOn: entry.verified_on,
  permissionEvidence: entry.permission_evidence,
}))
const generated = `import type { WalletArtwork } from './artworkCatalog.ts'\n\n// Maintained by scripts/import-approved-card-artwork.mjs after rights approval.\nexport const APPROVED_ISSUER_ARTWORK: readonly WalletArtwork[] = ${JSON.stringify(approved, null, 2)}\n`

await copyFile(sourcePath, destination, 1)
try {
  await atomicWrite(inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`)
  await atomicWrite(generatedPath, generated)
} catch (error) {
  // The copied file is harmless until catalog metadata points to it; leave it for manual cleanup.
  throw new Error(`Asset copy succeeded but metadata update failed: ${error.message}`)
}
console.log(`Imported ${item.id} to ${localAssetPath} (${image.format}, ${image.width}x${image.height}); no conversion was performed.`)
