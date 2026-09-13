export type ServerConnectionState = 'connected' | 'unreachable' | 'checking'

export async function probeMonikeyServer(fetcher: typeof fetch = fetch, timeoutMs = 2500): Promise<ServerConnectionState> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetcher('/api/v1/health/live', { method: 'GET', cache: 'no-store', signal: controller.signal })
    return response.ok ? 'connected' : 'unreachable'
  } catch { return 'unreachable' } finally { clearTimeout(timer) }
}
