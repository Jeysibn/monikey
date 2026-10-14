import { createContext, useContext } from 'react'
import type { QuickAddType } from './quickAddModel'

export interface QuickAddApi { open: (type?: QuickAddType) => void }
export const QuickAddContext = createContext<QuickAddApi | null>(null)
/** Opens V3 Quick Add from anywhere inside the V3 shell. Outside it, `open` is a no-op. */
export function useQuickAdd(): QuickAddApi { return useContext(QuickAddContext) ?? { open: () => undefined } }
