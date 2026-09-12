import type { PrismaClient } from '@prisma/client'

type Counter = { value: number; help: string }
const counters = new Map<string, Counter>([
  ['monikey_http_requests_total', { value: 0, help: 'Total HTTP requests handled by MoniKey.' }],
  ['monikey_http_errors_total', { value: 0, help: 'Total HTTP responses with status 400 or higher.' }],
  ['monikey_worker_jobs_succeeded_total', { value: 0, help: 'Durable worker jobs completed successfully.' }],
  ['monikey_worker_jobs_failed_total', { value: 0, help: 'Durable worker job attempts that failed.' }],
])
let requestDurationSeconds = 0

export function recordRequest(statusCode: number, durationSeconds: number): void {
  counters.get('monikey_http_requests_total')!.value += 1
  if (statusCode >= 400) counters.get('monikey_http_errors_total')!.value += 1
  requestDurationSeconds += durationSeconds
}

export function recordWorkerJob(result: 'succeeded' | 'failed'): void {
  counters.get(`monikey_worker_jobs_${result}_total`)!.value += 1
}

export function renderMetrics(): string {
  const lines: string[] = []
  for (const [name, counter] of counters) lines.push(`# HELP ${name} ${counter.help}`, `# TYPE ${name} counter`, `${name} ${counter.value}`)
  lines.push('# HELP monikey_http_request_duration_seconds_sum Cumulative HTTP request duration in seconds.', '# TYPE monikey_http_request_duration_seconds_sum counter', `monikey_http_request_duration_seconds_sum ${requestDurationSeconds}`)
  return `${lines.join('\n')}\n`
}

/** Database gauges answer operational questions without exposing user IDs. */
export async function renderDatabaseMetrics(prisma: PrismaClient): Promise<string> {
  const [pendingJobs, deadJobs, pendingOutbox, failedImports] = await Promise.all([
    prisma.workerJob.count({ where: { status: 'pending' } }),
    prisma.workerJob.count({ where: { status: 'dead' } }),
    prisma.notificationOutbox.count({ where: { status: 'pending' } }),
    prisma.importBatch.count({ where: { status: 'partially_committed' } }),
  ])
  return `${renderMetrics()}# HELP monikey_worker_jobs_pending Current pending durable jobs.\n# TYPE monikey_worker_jobs_pending gauge\nmonikey_worker_jobs_pending ${pendingJobs}\n# HELP monikey_worker_jobs_dead Current dead durable jobs.\n# TYPE monikey_worker_jobs_dead gauge\nmonikey_worker_jobs_dead ${deadJobs}\n# HELP monikey_notification_outbox_pending Current pending notification deliveries.\n# TYPE monikey_notification_outbox_pending gauge\nmonikey_notification_outbox_pending ${pendingOutbox}\n# HELP monikey_import_batches_partial Current partially committed import batches.\n# TYPE monikey_import_batches_partial gauge\nmonikey_import_batches_partial ${failedImports}\n`
}
