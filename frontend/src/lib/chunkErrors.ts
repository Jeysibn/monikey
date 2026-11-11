/**
 * Whether an error is a lazy-loaded chunk that failed to download (a lost connection, or a new release replacing
 * the files the open page expects). Retrying a render cannot fix that: React caches the failed import, so the page
 * itself has to be reloaded to fetch the files again.
 */
export function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return error.name === 'ChunkLoadError' || /dynamically imported module|Importing a module script failed|Failed to fetch dynamically|error loading dynamically imported/i.test(error.message)
}
