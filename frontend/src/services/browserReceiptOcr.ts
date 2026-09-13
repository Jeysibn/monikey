import type { ReceiptOcrOptions, ReceiptOcrResult, ReceiptOcrService } from '../domain/receiptOcr'

const emptyResult = (status: ReceiptOcrResult['status']): ReceiptOcrResult => ({ status, progress: 0, rawText: '', confidence: null, suggestedMerchant: null, suggestedDate: null, suggestedTotalMinor: null, suggestedCurrency: null, warnings: [] })

function parseSuggestions(text: string): Pick<ReceiptOcrResult, 'suggestedMerchant' | 'suggestedDate' | 'suggestedTotalMinor' | 'suggestedCurrency' | 'warnings'> {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const amount = [...text.matchAll(/(?:₱|PHP|P)\s*([0-9][0-9,]*(?:\.\d{1,2})?)/gi)].pop()?.[1]?.replaceAll(',', '')
  const date = text.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/)?.slice(1).map((part) => part.padStart(2, '0')).join('-') ?? null
  return { suggestedMerchant: lines[0] ?? null, suggestedDate: date, suggestedTotalMinor: amount ? String(Math.round(Number(amount) * 100)) : null, suggestedCurrency: amount ? 'PHP' : null, warnings: amount ? [] : ['No currency amount was confidently detected. Review before recording.'] }
}

export function createBrowserReceiptOcr(): ReceiptOcrService {
  let nextId = 1
  let worker: Worker | null = null
  const service: ReceiptOcrService = {
    recognizeReceipt(file: Blob, options: ReceiptOcrOptions = {}) {
      worker ??= new Worker(new URL('../workers/receiptOcr.worker.ts', import.meta.url), { type: 'module' })
      const id = nextId++
      return new Promise<ReceiptOcrResult>((resolve) => {
        const initial = emptyResult('recognizing')
        const onAbort = () => { worker?.postMessage({ type: 'cancel', id }); resolve({ ...initial, status: 'cancelled' }) }
        options.signal?.addEventListener('abort', onAbort, { once: true })
        worker!.onmessage = (event: MessageEvent<{ id: number; type: string; progress?: number; text?: string; confidence?: number; error?: string }>) => {
          if (event.data.id !== id) return
          if (event.data.type === 'progress') options.onProgress?.(event.data.progress ?? 0, 'recognizing')
          if (event.data.type === 'complete') {
            const rawText = event.data.text ?? ''
            resolve({ ...initial, status: 'complete', progress: 1, rawText, confidence: event.data.confidence ?? null, ...parseSuggestions(rawText) })
          }
          if (event.data.type === 'error') resolve({ ...initial, status: 'error', warnings: [event.data.error ?? 'OCR failed'] })
        }
        worker!.postMessage({ id, file, language: options.language ?? 'eng' })
      })
    },
    terminate() { worker?.terminate(); worker = null },
  }
  return service
}
