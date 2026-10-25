import type { AddState } from '../types.ts'

/** The Add transaction control is off until it can work. Only "no accounts" has a reason to read out. */
export const addBlocked = (state: AddState): boolean => state !== 'ready'
export const addLabel = (state: AddState): string => (state === 'no-accounts' ? 'Add an account first' : 'Add transaction')
