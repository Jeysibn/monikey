import { useState } from 'react'
import { cn } from 'cn'

import { MOKI_ASSETS as ASSETS, type MokiPose } from '@/lib/mokiAssets'

export type { MokiPose }
export type MokiSize = 'toast' | 'header' | 'tip' | 'small' | 'medium' | 'large'

const SIZE_CLASSES: Record<MokiSize, string> = {
  toast: 'size-12 sm:size-14',
  header: 'size-16 sm:size-24', // beside a page title
  tip: 'size-20 sm:size-28', // compact on phones so a tip never pushes the page far down
  small: 'size-28 sm:size-32',
  medium: 'size-36 sm:size-44',
  large: 'size-44 sm:size-56',
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
