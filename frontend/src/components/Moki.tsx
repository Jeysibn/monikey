import { useState } from 'react'
import { cn } from 'cn'

import { MOKI_ASSETS as ASSETS, type MokiPose } from '@/lib/mokiAssets'

export type { MokiPose }
export type MokiSize = 'tip' | 'small' | 'medium' | 'large'

const SIZE_CLASSES: Record<MokiSize, string> = {
  tip: 'size-14 sm:size-20', // compact on phones so a tip never pushes the page far down
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
  serverError: 'Moki holding a laptop that shows a cloud with an error',
  presenting: 'Moki presenting with an open hand',
}

export function Moki({
  pose,
  size = 'medium',
  decorative = true,
  alt,
  loading = 'lazy',
  fetchPriority = 'auto',
  float = false,
  className,
}: {
  pose: MokiPose
  size?: MokiSize
  decorative?: boolean
  alt?: string
  loading?: 'eager' | 'lazy'
  fetchPriority?: 'high' | 'low' | 'auto'
  /** A slow, small bob for a first-use welcome only; never animates for people who ask for less motion. */
  float?: boolean
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
      className={cn('block shrink-0 object-contain', SIZE_CLASSES[size], float && 'moki-float', className)}
    />
  )
}
