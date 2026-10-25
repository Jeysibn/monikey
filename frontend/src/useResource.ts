import { useEffect, useRef, useState } from 'react'

/*
 * One piece of server data (TLD section 4: useState + useEffect + AbortController, no data library).
 * `key` names what is wanted (for example "summary:2026-10"); a new key, or a new `version` after a write,
 * fetches again, and a reply for a key that is no longer wanted is ignored. While the new reply is on its
 * way the previous data stays on screen (`stale` is true) instead of blanking the screen.
 * A `null` key means "not needed right now": nothing is fetched and what was loaded is kept.
 * A failure belongs to the request that failed: it shows only while that same key and version are wanted, and is
 * forgotten as soon as a new request starts. Showing failures (with Retry) is the next step, S2.
 */
export interface Resource<T> {
  data: T | undefined // the latest data that arrived, for any key
  loading: boolean // nothing has arrived yet
  stale: boolean // a request is in flight and `data` may belong to an older key or version
  error: Error | null // the failure of the request that is wanted now, if it failed
}

export interface Loaded<T> {
  key: string
  version: number
  data: T
}
export interface Failure {
  key: string
  version: number
  error: Error
}

/** What a screen sees, given what has arrived and what has failed. Pure, so it can be tested without React. */
export function deriveResource<T>(loaded: Loaded<T> | null, failure: Failure | null, key: string | null, version: number): Resource<T> {
  const loadedNow = key !== null && loaded?.key === key && loaded.version === version
  const failedNow = key !== null && failure?.key === key && failure.version === version
  return {
    data: loaded?.data,
    loading: loaded === null,
    stale: key !== null && !loadedNow && !failedNow,
    error: failedNow ? failure.error : null,
  }
}

export function useResource<T>(key: string | null, load: (signal: AbortSignal) => Promise<T>, version = 0): Resource<T> {
  const [loaded, setLoaded] = useState<Loaded<T> | null>(null)
  const [failure, setFailure] = useState<Failure | null>(null)
  const loader = useRef(load)
  useEffect(() => {
    loader.current = load // runs before the fetch effect below, so it always calls the latest loader
  })

  // A new request starts whenever the key or the version changes: forget the previous request's failure.
  const request = `${key}|${version}`
  const [seen, setSeen] = useState(request)
  if (seen !== request) {
    setSeen(request)
    setFailure(null)
  }

  useEffect(() => {
    if (key === null) return
    const controller = new AbortController()
    loader
      .current(controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return
        setLoaded({ key, version, data })
        setFailure(null)
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        setFailure({ key, version, error: err instanceof Error ? err : new Error(String(err)) })
      })
    return () => controller.abort()
  }, [key, version])

  return deriveResource(loaded, failure, key, version)
}
