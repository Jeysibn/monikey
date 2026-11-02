import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isOfficialHost, mergeCandidates, slug } from './artworkResearch.mjs'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, '../..')
const inventoryPath = resolve(repoRoot, 'docs/design/card-artwork-inventory.json')
const reportPath = resolve(repoRoot, 'docs/design/CARD_ARTWORK_RESEARCH.md')
const seeds = JSON.parse(await readFile(resolve(scriptDir, 'card-artwork-seeds.json'), 'utf8'))
const today = new Date().toISOString().slice(0, 10)
const issuerHosts = {
  BDO: ['www.bdo.com.ph'],
  BPI: ['www.bpi.com.ph'],
  Maya: ['www.maya.ph'],
  GCash: ['help.gcash.com'],
  Atome: ['www.atome.ph'],
  MariBank: ['www.maribank.ph'],
  GoTyme: ['www.gotyme.com.ph'],
}

async function request(url, method = 'GET', allowedHosts = [], redirects = 0) {
  if (!isOfficialHost(url, allowedHosts)) throw new Error(`refused non-official host: ${url}`)
  if (redirects > 3) throw new Error('too many same-issuer redirects')
  const response = await fetch(url, {
    method,
    redirect: 'manual',
    signal: AbortSignal.timeout(12000),
    headers: { 'user-agent': 'MoniKeyArtworkResearch/1.0 (+local, respectful rate limit)' },
  })
  if (response.status >= 300 && response.status < 400) {
    const target = new URL(response.headers.get('location') ?? '', url).href
    if (!isOfficialHost(target, allowedHosts)) throw new Error(`redirect left official host: ${target}`)
    return request(target, method, allowedHosts, redirects + 1)
  }
  return response
}

function decodeText(value) {
  return value.replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
}

function pageImages(html, baseUrl, allowedHosts) {
  const found = []
  const tags = html.match(/<img\b[^>]*>/gi) ?? []
  for (const tag of tags) {
    const attrs = Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g)].map((m) => [m[1].toLowerCase(), decodeText(m[2])]))
    const rawUrl = attrs.src ?? attrs['data-src'] ?? attrs['data-cmp-src']
    if (!rawUrl) continue
    try {
      const url = new URL(rawUrl, baseUrl).href
      found.push({ url, text: `${attrs.alt ?? ''} ${attrs.title ?? ''} ${url}`, width: Number(attrs.width) || null, height: Number(attrs.height) || null,
        classification: isOfficialHost(url, allowedHosts) ? 'official-issuer-cdn' : 'official-page-embedded-external' })
    } catch { /* malformed source URL; skip */ }
  }
  for (const tag of html.matchAll(/<meta\b[^>]*(?:property|name)=["'](?:og:image|twitter:image(?::src)?)["'][^>]*>/gi)) {
    const content = tag[0].match(/content=["']([^"']+)["']/i)?.[1]
    if (!content) continue
    try {
      const url = new URL(decodeText(content), baseUrl).href
      found.push({ url, text: url, width: null, height: null, classification: isOfficialHost(url, allowedHosts) ? 'official-issuer-cdn' : 'official-page-embedded-external' })
    } catch { /* malformed source URL; skip */ }
  }
  return found
}

function matchingImage(item, images) {
  const tokens = `${item.product} ${item.variant}`.toLowerCase().match(/[a-z0-9]+/g) ?? []
  const specific = [...new Set(tokens.filter((token) => token.length > 2
    && ![item.issuer.toLowerCase(), 'card', 'cards', 'current', 'exact', 'artwork', 'variant', 'design', 'confirmed', 'not'].includes(token)))]
  if (specific.length < 2) return null
  const ranked = images.map((image) => {
    const text = image.text.toLowerCase()
    return { image, score: specific.filter((token) => text.includes(token)).length }
  }).filter((entry) => entry.score >= 2).sort((a, b) => b.score - a.score)
  return ranked[0]?.image ?? null
}

function discoverLinks(issuer, html, baseUrl, hosts) {
  const entries = []
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = match[1].match(/href=["']([^"']+)["']/i)?.[1]
    const label = decodeText(match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).trim()
    const hasNamedNetwork = /\b(visa|mastercard|cirrus)\b/i.test(label)
      && /\b(classic|gold|platinum|signature|standard|rewards|shopmore|blue|edge|cashback|cirrus|red)\b/i.test(label)
    const hasDebitNetworkProduct = /\bdebit\s+(?:visa|mastercard)\b/i.test(label)
    const hasNamedCoBrand = /\bklook\b/i.test(label) && /\bcard\b/i.test(label)
    if (!href || label.length < 6 || label.length > 90 || /terms|conditions|fees|rates|\bcards\b/i.test(label)
      || (!hasNamedNetwork && !hasDebitNetworkProduct && !hasNamedCoBrand)) continue
    try {
      const url = new URL(decodeText(href), baseUrl).href
      if (!isOfficialHost(url, hosts)) continue
      const productLabel = label.replace(new RegExp(`^${issuer}\\s*`, 'i'), '')
      const id = `${slug(issuer)}-${slug(productLabel)}`
      if (/\/(?:cards?|credit-cards|debit-cards|activate-virtual-card)\/?(?:#.*)?$/i.test(new URL(url).pathname)) continue
      entries.push({ id, issuer, product: label, variant: 'Discovered from official issuer page; manual variant review required',
        card_network: /visa/i.test(label) ? 'Visa' : /mastercard/i.test(label) ? 'Mastercard' : /cirrus/i.test(label) ? 'Cirrus' : null,
        card_type: /credit/i.test(label) ? 'credit' : /debit/i.test(label) ? 'debit' : /virtual/i.test(label) ? 'virtual' : /prepaid/i.test(label) ? 'prepaid' : 'unknown',
        account_types: [], official_product_url: url, candidate_image_url: null, image_format: null, image_width: null, image_height: null,
        source_verified: true, verified_on: today, permission_status: 'pending', permission_evidence: null, local_asset_path: null,
        artwork_verified: false, image_source_classification: 'not-found', catalog_status: 'candidate', notes: ['Discovered as an exact link label on an official issuer page; review account type and exact design before use.'] })
    } catch { /* malformed source URL; skip */ }
  }
  return [...new Map(entries.map((entry) => [entry.id, entry])).values()]
}

const prior = await readFile(inventoryPath, 'utf8').then((value) => JSON.parse(value)).catch(() => ({ items: [] }))
const normalizedSeeds = seeds.map((item) => ({
  artwork_verified: false,
  image_source_classification: item.candidate_image_url ? 'unknown' : 'not-found',
  ...item,
}))
const items = mergeCandidates(prior.items ?? [], normalizedSeeds)
const pageUrls = [...new Set(items.map((item) => item.official_product_url))]
const attempts = []
const discovered = []
const extractedImages = new Map()

for (const url of pageUrls) {
  const item = items.find((entry) => entry.official_product_url === url)
  const hosts = issuerHosts[item?.issuer] ?? []
  if (attempts.length) await new Promise((done) => setTimeout(done, 700))
  try {
    const response = await request(url, 'GET', hosts)
    if (!response.ok) {
      attempts.push({ url, status: 'failed', http_status: response.status, checked_on: today, note: `HTTP ${response.status}; access was not retried or bypassed.` })
      continue
    }
    const type = response.headers.get('content-type') ?? ''
    if (!/text\/html/i.test(type)) {
      attempts.push({ url, status: 'failed', http_status: response.status, checked_on: today, note: `Unexpected content type: ${type}` })
      continue
    }
    const html = await response.text()
    if (html.length > 4_000_000) {
      attempts.push({ url, status: 'failed', http_status: response.status, checked_on: today, note: 'HTML exceeded 4 MiB safety limit.' })
      continue
    }
    const images = pageImages(html, response.url, hosts)
    extractedImages.set(url, images)
    const pageDiscoveries = discoverLinks(item?.issuer ?? 'Issuer', html, response.url, hosts)
    for (const candidate of pageDiscoveries) {
      const match = matchingImage(candidate, images)
      if (match) {
        candidate.candidate_image_url = match.url
        candidate.image_source_classification = match.classification
        candidate.image_width = match.width
        candidate.image_height = match.height
      }
    }
    discovered.push(...pageDiscoveries)
    attempts.push({ url, status: 'read', http_status: response.status, checked_on: today, note: `${images.length} image references; same-host product links scanned.` })
  } catch (error) {
    attempts.push({ url, status: 'failed', http_status: null, checked_on: today, note: error.name === 'TimeoutError' ? 'Timed out; no alternate route or bot bypass attempted.' : error.message })
  }
}

const knownIds = new Set(items.map((item) => item.id))
const providerCounts = new Map()
for (const item of items) providerCounts.set(item.issuer, (providerCounts.get(item.issuer) ?? 0) + 1)
const cappedDiscoveries = [...new Map(discovered.map((item) => [item.id, item])).values()].filter((item) => {
  if (knownIds.has(item.id) || (providerCounts.get(item.issuer) ?? 0) >= 5) return false
  providerCounts.set(item.issuer, (providerCounts.get(item.issuer) ?? 0) + 1)
  return true
})
let inventory = mergeCandidates(items, cappedDiscoveries)
const imageChecks = new Map()
for (const item of inventory) {
  if (!item.candidate_image_url) {
    const match = matchingImage(item, extractedImages.get(item.official_product_url) ?? [])
    if (match) {
      item.candidate_image_url = match.url
      item.image_source_classification = match.classification
      item.image_width = match.width ?? item.image_width
      item.image_height = match.height ?? item.image_height
    }
  }
  if (!item.candidate_image_url) continue
  const hosts = issuerHosts[item.issuer] ?? []
  const pageFound = (extractedImages.get(item.official_product_url) ?? []).find((image) => image.url === item.candidate_image_url)
  if (pageFound) {
    item.image_source_classification = pageFound.classification
    item.image_width = pageFound.width ?? item.image_width
    item.image_height = pageFound.height ?? item.image_height
  }
  if (!isOfficialHost(item.candidate_image_url, hosts) && item.image_source_classification !== 'official-page-embedded-external') {
    item.image_source_classification = 'third-party-or-unofficial'
    item.image_check = { status: 'not-requested', note: 'Candidate image host is not on the issuer allowlist.' }
    continue
  }
  if (item.image_source_classification === 'official-page-embedded-external') {
    item.image_check = { status: 'not-requested', note: 'Image URL is embedded by an official page but hosted externally; ownership/authorization of the asset host needs manual confirmation.' }
    continue
  }
  if (!imageChecks.has(item.candidate_image_url)) {
    if (imageChecks.size) await new Promise((done) => setTimeout(done, 700))
    try {
      const response = await request(item.candidate_image_url, 'HEAD', hosts)
      const contentType = response.headers.get('content-type') ?? ''
      const imageFormat = contentType.match(/^image\/([^;]+)/i)?.[1] ?? null
      imageChecks.set(item.candidate_image_url, {
        status: response.ok && imageFormat ? 'accessible' : 'failed', http_status: response.status,
        image_format: imageFormat,
        content_length: Number(response.headers.get('content-length')) || null,
        note: imageFormat ? 'HEAD only; image bytes were not downloaded. Dimensions are read only from issuer-page img attributes.' : `No image content type reported (${contentType || 'missing'}); no image bytes were downloaded.`,
      })
    } catch (error) {
      imageChecks.set(item.candidate_image_url, { status: 'failed', http_status: null, image_format: null, content_length: null, note: error.message })
    }
  }
  item.image_source_classification = 'official-issuer-cdn'
  item.image_check = imageChecks.get(item.candidate_image_url)
  item.image_format = item.image_check.status === 'accessible' ? item.image_check.image_format ?? item.image_format : null
}

for (const item of inventory) {
  const sourceAttempt = attempts.find((attempt) => attempt.url === item.official_product_url)
  item.source_check = sourceAttempt?.status ?? 'not-checked'
  item.last_checked_on = today
}

const output = { schema_version: 1, generated_on: today, items: inventory, source_attempts: attempts }
await writeFile(inventoryPath, `${JSON.stringify(output, null, 2)}\n`)

const count = (predicate) => inventory.filter(predicate).length
const table = inventory.map((item) => `| ${item.issuer} | ${item.product} | ${item.card_network ?? 'Unknown'} | ${item.official_product_url} | ${item.candidate_image_url ?? 'Not found'} | ${item.image_source_classification ?? 'not-found'} | ${item.image_check?.status ?? 'not checked'} | ${item.image_check?.image_format ?? item.image_format ?? 'Unknown'} | ${item.image_width ?? 'Unknown'} × ${item.image_height ?? 'Unknown'} | ${item.source_verified ? 'Product confirmed' : 'Unverified'} | ${item.artwork_verified ? 'Verified' : 'Unverified'} | ${item.permission_status} | ${item.permission_evidence ?? 'None'} | ${item.local_asset_path ?? 'None'} | ${item.catalog_status} |`).join('\n')
const failedPages = attempts.filter((attempt) => attempt.status !== 'read').map((attempt) => `- ${attempt.url}: ${attempt.note}`)
const failedImages = inventory.filter((item) => item.image_check?.status === 'failed').map((item) => `- ${item.id} image ${item.candidate_image_url}: ${item.image_check.note}`)
const failures = [...failedPages, ...failedImages].join('\n') || '- None during this run.'
const report = `# Card Artwork Research\n\nLast discovery run: ${today}. This report is generated by \`npm run artwork:discover\`; issuer product pages are the authority for product identity. Image availability does not establish reuse rights.\n\n## Summary\n\n- Products discovered: ${inventory.length}\n- Official product sources verified: ${count((item) => item.source_verified)}\n- Official designs verified: ${count((item) => item.artwork_verified)}\n- Approved assets: ${count((item) => item.catalog_status === 'approved')}\n- Pending permission: ${count((item) => item.permission_status === 'pending')}\n- Rejected candidates: ${count((item) => item.catalog_status === 'rejected')}\n- Assets imported: ${count((item) => item.local_asset_path !== null)}\n- Selectable issuer artwork: ${count((item) => item.catalog_status === 'approved' && item.local_asset_path !== null)}\n\n## Priority 1 providers\n\n| Provider | Product | Network | Official product page | Candidate image source | Image source class | Image access | Format | Dimensions | Product authenticity | Exact design | Permission status | Permission evidence | Local asset | Catalog status |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|\n${table}\n\n## Discovery results and unresolved questions\n\n${failures}\n\n- For products without a candidate image URL, the run found no variant-specific image reference it could safely associate; no URL was fabricated.\n- Every current candidate remains unavailable to the production selector until permission evidence is documented, a clean local file is imported, and the catalog validation passes.\n- Issuer access failures are retained as research limitations. The script does not retry through alternate hosts, log in, or bypass access controls.\n- Dimension values remain unknown unless they are exposed in the official page markup; this discovery mode uses HEAD for image checks and does not download image bytes.\n- Image rights and the exact current face design still need manual review for every candidate.\n\n## Running and extending discovery\n\nRun from \`frontend/\`: \`npm run artwork:discover\`, then \`npm run artwork:validate\`. Discovery reads only the official product URLs in \`scripts/card-artwork-seeds.json\`, and merges by stable ID so reruns do not duplicate records. Add a product only after confirming its exact name and official page.\n\nTo import artwork later, add a repository-local rights JSON record with \`artwork_id\`, \`status: approved\`, HTTPS \`permission_source_url\`, explicit redistribution/application-bundle scope, \`evidence_summary\`, \`reviewed_on\`, and \`reviewer\`. Then run: \`npm run artwork:import -- --id <id> --file <local-authorized-image> --source-url <candidate-image-url> --rights <rights-record.json> --privacy-reviewed\`. The importer does not fetch remote artwork; it requires a manually reviewed local source file and copies it without altering the design.\n\n## Priority 2 providers\n\nUnionBank, MariBank, CIMB, Landbank, RCBC, Atome, and Wise are not researched in this first run.\n\nSee [card-artwork-inventory.json](./card-artwork-inventory.json) for the structured inventory.\n`
const reportWithLimits = report.replace('\n## Running and extending discovery', '\n- The importer requires an explicit visual privacy review and scans accessible image bytes for long number-like strings; it does not run OCR over compressed raster images, so a human must inspect the face before import.\n\n## Running and extending discovery')
await writeFile(reportPath, reportWithLimits)
console.log(`Wrote ${inventory.length} deduplicated candidate records; ${attempts.filter((attempt) => attempt.status === 'read').length}/${attempts.length} official pages readable.`)
