import { Tags } from 'lucide-react'

import { CATEGORY_ICON_OPTIONS, isCategoryIconKey } from '@/lib/categoryIconRegistry'

export function CategoryIcon({ iconKey, className = 'size-4' }: { iconKey?: string | null; className?: string }) {
  const Icon = isCategoryIconKey(iconKey) ? CATEGORY_ICON_OPTIONS[iconKey].Icon : Tags
  return <Icon aria-hidden="true" className={className} />
}
