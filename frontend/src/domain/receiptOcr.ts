export type OcrStatus = 'idle' | 'loading' | 'recognizing' | 'complete' | 'error' | 'cancelled'

export interface ReceiptOcrResult {
  status: OcrStatus
  progress: number
  rawText: string
  confidence: number | null
  suggestedMerchant: string | null
  suggestedDate: string | null
  suggestedTotalMinor: string | null
  suggestedCurrency: string | null
  warnings: string[]
}

export interface ReceiptOcrOptions {
  language?: 'eng' | 'chi_sim'
  signal?: AbortSignal
  onProgress?: (progress: number, status: OcrStatus) => void
}

export interface ReceiptOcrService {
  recognizeReceipt(file: Blob, options?: ReceiptOcrOptions): Promise<ReceiptOcrResult>
  terminate(): void
}
