import { useEffect, useRef, useState } from 'react'

/*
 * One piece of server data (TLD section 4: useState + useEffect + AbortController, no data library).
 * `key` names what is wanted (for example "summary:2026-10"); a new key, a new `version` after a write, or
 * `retry()` fetches again, and a reply for a request that is no longer wanted is ignored. While the new reply
 * is on its way the previous data stays on screen (`stale` is true) instead of blanking the screen.
 * A `null` key means "not needed right now": nothing is fetched and what was loaded is kept.
 * A failure belongs to the request that failed: it shows only while that same request is wanted, and is
 * forgotten as soon as a new request starts. `updatedAt` is when the data on screen last arrived, for
 * "Last updated 09:14" next to a failure.
 */
export interface Resource<T> {
  data: T | undefined // the latest data that arrived, for any key
  loading: boolean // nothing has arrived yet
  stale: boolean // a request is in flight and `data` may belong to an older request
  error: Error | null // the failure of the request that is wanted now, if it failed
  updatedAt: Date | null // when `data` arrived
  retry: () => void // ask again (after a failure)
}

export interface Loaded<T> {
  key: string
  token: string // identifies the request: the version and the retry count
  data: T
  at: number // when it arrived (epoch milliseconds)
}
export interface Failure {
  key: string
  token: string
  error: Error
}

/** What a screen sees, given what has arrived and what has failed. Pure, so it can be tested without React. */
export function deriveResource<T>(
  loaded: Loaded<T> | null,
  failure: Failure | null,
  key: string | null,
  token: string,
  retry: () => void = () => undefined,
): Resource<T> {
  const loadedNow = key !== null && loaded?.key === key && loaded.token === token
  const failedNow = key !== null && failure?.key === key && failure.token === token
  return {
    data: loaded?.data,
    loading: loaded === null,
    stale: key !== null && !loadedNow && !failedNow,
    error: failedNow ? failure.error : null,
    updatedAt: loaded ? new Date(loaded.at) : null,
    retry,
  }
}

export function useResource<T>(key: string | null, load: (signal: AbortSignal) => Promise<T>, version = 0): Resource<T> {
  const [loaded, setLoaded] = useState<Loaded<T> | null>(null)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [attempt, setAttempt] = useState(0)
  const loader = useRef(load)
  useEffect(() => {
    loader.current = load // runs before the fetch effect below, so it always calls the latest loader
  })

  // A new request starts whenever the key, the version or the attempt changes: forget the previous failure.
  const token = `${version}:${attempt}`
  const request = `${key}|${token}`
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
        setLoaded({ key, token, data, at: Date.now() })
        setFailure(null)
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        setFailure({ key, token, error: err instanceof Error ? err : new Error(String(err)) })
      })
    return () => controller.abort()
  }, [key, token])

  return deriveResource(loaded, failure, key, token, () => setAttempt((n) => n + 1))
}
