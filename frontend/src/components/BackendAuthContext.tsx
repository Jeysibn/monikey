import { createContext, useContext } from 'react'

export type BackendAuthContextValue = {
  logout: () => Promise<void>
}

export const BackendAuthContext = createContext<BackendAuthContextValue | null>(null)

export function useBackendAuthOptional() {
  return useContext(BackendAuthContext)
}
