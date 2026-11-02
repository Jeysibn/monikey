export function slug(value: string): string
export function mergeCandidates<T extends { id: string }>(existing: T[], discovered: Record<string, unknown>[]): Array<T & Record<string, unknown>>
export function validateInventory(items: Record<string, unknown>[]): string[]
export function isHttpsUrl(value: string): boolean
export function isSafeLocalAssetPath(value: unknown): value is string
export function isOfficialHost(url: string, hosts: string[]): boolean
export function validatePermissionEvidence(record: unknown, artworkId: string): string[]
export function inspectImageHeader(buffer: Buffer, filename: string): {
  format: 'png' | 'jpeg' | 'webp'
  width: number
  height: number
}
