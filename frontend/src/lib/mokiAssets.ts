/*
 * Moki's poses and the optimized file that serves each one (frontend/public/moki). A pose appears here only
 * when approved artwork exists for it; see docs/design/MOKI_ASSET_GUIDE.md for where each may be used.
 */
export type MokiPose = 'welcome' | 'emptyWallet' | 'resting' | 'searching' | 'planning' | 'thumbsUp' | 'serverError' | 'presenting'

export const MOKI_ASSETS: Record<MokiPose, string> = {
  welcome: '/moki/moki-wave.webp',
  emptyWallet: '/moki/moki-empty-wallet.webp',
  resting: '/moki/moki-sleeping.webp',
  searching: '/moki/moki-search.webp',
  planning: '/moki/moki-checklist-thinking.webp',
  thumbsUp: '/moki/moki-thumbs-up.webp',
  serverError: '/moki/moki-server-error.webp',
  presenting: '/moki/moki-presenting.webp',
}
