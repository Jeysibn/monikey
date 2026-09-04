// A tiny module-level pub/sub — deliberately not a dependency, not a
// context: any component can call `showToast(...)` (including from inside
// an event handler that doesn't have access to a provider) and the single
// <Toast /> mounted once in App.tsx will display it.
type Listener = (message: string) => void
const listeners = new Set<Listener>()

export function showToast(message: string): void {
  listeners.forEach((l) => l(message))
}

export function subscribeToast(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
