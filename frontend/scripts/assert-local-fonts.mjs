import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

const dist = new URL('../dist/', import.meta.url)
const forbidden = [/fonts\.googleapis\.com/i, /fonts\.gstatic\.com/i]
const files = []

async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) await collect(path)
    else if (/\.(?:html|css|js|webmanifest)$/.test(entry.name)) files.push(path)
  }
}

await collect(dist.pathname)
const violations = []
for (const path of files) {
  const contents = await readFile(path, 'utf8')
  for (const pattern of forbidden) {
    if (pattern.test(contents)) violations.push(`${path}: ${pattern}`)
  }
}

if (violations.length > 0) {
  console.error('External font-provider origins found in production assets:')
  console.error(violations.join('\n'))
  process.exit(1)
}

console.log(`Local-font privacy check passed across ${files.length} production assets.`)
