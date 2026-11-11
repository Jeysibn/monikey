import { useState } from 'react'
import { cn } from 'cn'

export type MokiPose = 'welcome' | 'emptyWallet' | 'resting' | 'searching' | 'planning' | 'thumbsUp'
export type MokiSize = 'small' | 'medium' | 'large'

const ASSETS: Record<MokiPose, string> = {
  welcome: '/moki/moki-wave.webp',
  emptyWallet: '/moki/moki-empty-wallet.webp',
  resting: '/moki/moki-sleeping.webp',
  searching: '/moki/moki-search.webp',
  planning: '/moki/moki-checklist-thinking.webp',
  thumbsUp: '/moki/moki-thumbs-up.webp',
}

const SIZE_CLASSES: Record<MokiSize, string> = {
  small: 'size-20',
  medium: 'size-28',
  large: 'size-36',
}

const POSE_DESCRIPTIONS: Record<MokiPose, string> = {
  welcome: 'Moki waving hello',
  emptyWallet: 'Moki holding an empty wallet',
  resting: 'Moki resting on a notebook',
  searching: 'Moki looking through a magnifying glass',
  planning: 'Moki thinking while holding a checklist',
  thumbsUp: 'Moki giving a thumbs-up',
}

export function Moki({
  pose,
  size = 'medium',
  decorative = true,
  alt,
  loading = 'lazy',
  fetchPriority = 'auto',
  className,
}: {
  pose: MokiPose
  size?: MokiSize
  decorative?: boolean
  alt?: string
  loading?: 'eager' | 'lazy'
  fetchPriority?: 'high' | 'low' | 'auto'
  className?: string
}) {
  const src = ASSETS[pose]
  const [failedSource, setFailedSource] = useState<string | null>(null)

  if (failedSource === src) return null

  return (
    <img
      src={src}
      width={480}
      height={480}
      alt={decorative ? '' : (alt ?? POSE_DESCRIPTIONS[pose])}
      aria-hidden={decorative || undefined}
      loading={loading}
      fetchPriority={fetchPriority}
      decoding="async"
      onError={() => setFailedSource(src)}
      className={cn('block shrink-0 object-contain', SIZE_CLASSES[size], className)}
    />
  )
}
