import { describe, expect, it } from 'vitest'
import { recordRequest, recordWorkerJob, renderMetrics } from '../../src/modules/health/metrics.js'

describe('application metrics', () => {
  it('records low-cardinality request counters and duration', () => {
    recordRequest(200, 0.25)
    recordRequest(500, 0.5)
    const output = renderMetrics()
    expect(output).toContain('monikey_http_requests_total 2')
    expect(output).toContain('monikey_http_errors_total 1')
    expect(output).toContain('monikey_http_request_duration_seconds_sum 0.75')
  })
  it('records worker outcomes without user labels', () => {
    recordWorkerJob('succeeded')
    recordWorkerJob('failed')
    const output = renderMetrics()
    expect(output).toContain('monikey_worker_jobs_succeeded_total')
    expect(output).toContain('monikey_worker_jobs_failed_total')
    expect(output).not.toMatch(/user_id|userId/)
  })
})
