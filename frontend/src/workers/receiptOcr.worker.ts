import { createWorker } from 'tesseract.js'

type RequestMessage = { id: number; file: Blob; language: 'eng' | 'chi_sim' }
type ResponseMessage = { id: number; type: 'progress' | 'complete' | 'error'; progress?: number; text?: string; confidence?: number; error?: string }

let activeWorker: Awaited<ReturnType<typeof createWorker>> | null = null
self.onmessage = async (event: MessageEvent<RequestMessage>) => {
  // Dedicated workers normally receive an empty origin, but keep an explicit
  // origin guard so this handler never processes a cross-origin message if the
  // runtime provides one.
  if (event.origin !== '' && event.origin !== self.location.origin) return

  const { id, file, language } = event.data
  try {
    activeWorker ??= await createWorker(language, 1, {
      workerPath: '/tesseract/worker.min.js',
      corePath: '/tesseract/core/tesseract-core.wasm.js',
      langPath: '/tesseract/lang',
      logger: (message) => self.postMessage({ id, type: 'progress', progress: message.progress } satisfies ResponseMessage),
    })
    const result = await activeWorker.recognize(file)
    self.postMessage({ id, type: 'complete', text: result.data.text, confidence: result.data.confidence } satisfies ResponseMessage)
  } catch (error) {
    self.postMessage({ id, type: 'error', error: error instanceof Error ? error.message : 'OCR failed' } satisfies ResponseMessage)
  }
}
