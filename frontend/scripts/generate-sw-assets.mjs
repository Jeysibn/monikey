import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const root = new URL('../dist/', import.meta.url)
const assetNames = (await readdir(new URL('assets/', root))).map((name) => `/assets/${name}`)
const swPath = new URL('sw.js', root)
const source = await readFile(swPath, 'utf8')
if (!source.includes('__MONIKEY_BUILD_ASSETS__')) throw new Error('Service worker precache placeholder is missing')
await writeFile(swPath, source.replace('__MONIKEY_BUILD_ASSETS__', JSON.stringify(assetNames)))
console.log(`Service worker precache: ${assetNames.length} build assets`)
