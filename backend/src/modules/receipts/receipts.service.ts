/**
 * Receipt processing service.
 * Handles upload validation, OCR processing, draft parsing, and transaction commit.
 * Never directly posts transactions — only LedgerModule can do that.
 */

import type { PrismaClient } from '@prisma/client'
import { AppError } from '../../common/errors/appError.js'
import { tryConsumeApiQuota, dailyPeriod } from '../../integrations/quota/quota.js'
import type { ObjectStore } from '../../integrations/interfaces/objectStore.js'
import type { OcrProvider } from '../../integrations/interfaces/ocrProvider.js'
import { ReceiptsRepository } from './receipts.repository.js'
import { parseReceiptOcr } from './receipt-parser.js'

export interface UploadReceiptInput {
  filename: string
  mimeType: string
  buffer: Buffer
}

export interface ProcessReceiptInput {
  receiptId: string
  userId: string
  /** Compressed buffer for OCR upload (optional). */
  compressedBuffer?: Buffer
}

export interface ReceiptDraft {
  merchant?: string
  date?: string
  totalMinor?: number
  category?: string
  confidence?: number
}

export interface CommitReceiptInput {
  receiptId: string
  userId: string
  /** User-confirmed/edited draft fields. */
  draft: ReceiptDraft
  /** Transaction command for posting (e.g., title, category, etc.). */
  transactionData: Record<string, unknown>
}

// List of allowed MIME types for receipt uploads.
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]

// Magic bytes for common image formats to validate file content.
const MAGIC_BYTES: Record<string, Buffer> = {
  'image/jpeg': Buffer.from([0xff, 0xd8, 0xff]),
  'image/png': Buffer.from([0x89, 0x50, 0x4e, 0x47]),
  'image/webp': Buffer.from([0x52, 0x49, 0x46, 0x46]),
  'image/gif': Buffer.from([0x47, 0x49, 0x46]),
}

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB

export class ReceiptsService {
  private repository: ReceiptsRepository

  constructor(
    private prisma: PrismaClient,
    private objectStore: ObjectStore,
    private ocrProvider: OcrProvider,
  ) {
    this.repository = new ReceiptsRepository(prisma)
  }

  /**
   * Uploads a receipt file with validation.
   * - Validates MIME type AND magic bytes
   * - Checks file size
   * - Stores with randomized key (never trust filename)
   * - Computes SHA256 hash
   * Returns receipt metadata
   */
  async uploadReceipt(userId: string, input: UploadReceiptInput) {
    // Validate MIME type
    if (!ALLOWED_MIME_TYPES.includes(input.mimeType)) {
      throw new AppError(
        'INVALID_RECEIPT_TYPE',
        `Unsupported file type. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`,
        { statusCode: 400 },
      )
    }

    // Validate file size
    if (input.buffer.length > MAX_FILE_SIZE_BYTES) {
      throw new AppError(
        'RECEIPT_TOO_LARGE',
        `File exceeds maximum size of ${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB`,
        { statusCode: 413 },
      )
    }

    // Validate magic bytes (do NOT trust client Content-Type)
    const expectedMagic = MAGIC_BYTES[input.mimeType]
    if (expectedMagic) {
      const actualHeader = input.buffer.slice(0, expectedMagic.length)
      if (!actualHeader.equals(expectedMagic)) {
        throw new AppError(
          'INVALID_RECEIPT_FORMAT',
          'File content does not match the declared MIME type (magic bytes mismatch)',
          { statusCode: 400 },
        )
      }
    }

    // Store the file (randomized key generated internally)
    const stored = await this.objectStore.store({
      buffer: input.buffer,
      originalFilename: input.filename,
      mimeType: input.mimeType,
    })

    // Create receipt record in database
    const receipt = await this.repository.create({
      userId,
      storageKey: stored.key,
      originalFilename: input.filename,
      mimeType: input.mimeType,
      sizeBytes: BigInt(stored.sizeBytes),
      sha256: stored.sha256,
    })

    return {
      id: receipt.id,
      status: receipt.status,
      storageKey: receipt.storageKey,
    }
  }

  /**
   * Processes a receipt through the OCR provider.
   * - Checks if user has opted in to external OCR via settings
   * - Enforces quota atomically
   * - Updates receipt with OCR text and parsed draft
   * - Never posts transaction automatically
   */
  async processReceipt(input: ProcessReceiptInput) {
    const receipt = await this.repository.findById(input.receiptId, input.userId)
    if (!receipt) {
      throw new AppError(
        'RECEIPT_NOT_FOUND',
        'Receipt not found',
        { statusCode: 404 },
      )
    }

    if (receipt.userId !== input.userId) {
      throw new AppError(
        'FORBIDDEN',
        'You do not have access to this receipt',
        { statusCode: 403 },
      )
    }

    if (receipt.status === 'committed') {
      throw new AppError(
        'RECEIPT_ALREADY_COMMITTED',
        'Receipt has already been committed to a transaction',
        { statusCode: 400 },
      )
    }

    // Check user's external_ocr_enabled preference
    const preferences = await this.prisma.userPreferences.findUnique({
      where: { userId: input.userId },
    })

    if (!preferences?.externalOcrEnabled) {
      throw new AppError(
        'EXTERNAL_OCR_DISABLED',
        'External OCR is disabled. Enable it in settings to use this feature.',
        { statusCode: 403 },
      )
    }

    // Mark receipt as processing
    await this.repository.update(input.receiptId, input.userId, {
      status: 'processing',
    })

    try {
      // Retrieve the stored image from object store
      const imageBuffer = await this.objectStore.retrieve(receipt.storageKey)

      // Enforce quota atomically
      const quotaAllowed = await tryConsumeApiQuota(
        this.prisma,
        'ocrspace',
        dailyPeriod(),
        'extract',
        450, // OCRSPACE_MAX_CALLS_PER_DAY
      )

      if (!quotaAllowed) {
        throw new AppError(
          'EXTERNAL_PROVIDER_QUOTA_REACHED',
          'OCR.Space daily quota reached. Please try again tomorrow.',
          { statusCode: 429 },
        )
      }

      // Call OCR provider
      const ocrResult = await this.ocrProvider.extract({
        filename: receipt.originalFilename,
        mimeType: receipt.mimeType,
        buffer: imageBuffer,
        compressedBuffer: input.compressedBuffer,
      })

      // Parse OCR text into a structured draft
      const draft = parseReceiptOcr(ocrResult.text)

      // Update receipt with OCR results
      await this.repository.update(input.receiptId, input.userId, {
        status: 'ready',
        ocrProvider: ocrResult.provider,
        ocrText: ocrResult.text,
        parsedPayload: draft as Record<string, unknown>,
      })

      return {
        id: receipt.id,
        status: 'ready',
        draft,
        ocrText: ocrResult.text,
      }
    } catch (error) {
      // Leave receipt in recoverable state on failure
      await this.repository.update(input.receiptId, input.userId, {
        status: 'failed',
      })

      if (error instanceof AppError) {
        throw error
      }

      throw new AppError(
        'OCR_PROCESSING_FAILED',
        `Failed to process receipt: ${error instanceof Error ? error.message : String(error)}`,
        { statusCode: 500 },
      )
    }
  }

  /**
   * Commits a receipt draft as a real transaction through LedgerModule.
   * - Requires user confirmation (not auto-posted)
   * - Links receipt.transaction_id after successful post
   * - Caller must invoke LedgerModule.postTransaction separately
   */
  async commitReceipt(input: CommitReceiptInput) {
    const receipt = await this.repository.findById(input.receiptId, input.userId)
    if (!receipt) {
      throw new AppError(
        'RECEIPT_NOT_FOUND',
        'Receipt not found',
        { statusCode: 404 },
      )
    }

    if (receipt.userId !== input.userId) {
      throw new AppError(
        'FORBIDDEN',
        'You do not have access to this receipt',
        { statusCode: 403 },
      )
    }

    if (receipt.status === 'committed') {
      throw new AppError(
        'RECEIPT_ALREADY_COMMITTED',
        'Receipt has already been committed',
        { statusCode: 400 },
      )
    }

    if (!receipt.parsedPayload) {
      throw new AppError(
        'RECEIPT_NOT_READY',
        'Receipt has not been processed yet',
        { statusCode: 400 },
      )
    }

    // Return draft for caller to use in LedgerModule.postTransaction()
    // Caller is responsible for calling linkTransaction() after successful post
    return {
      id: receipt.id,
      draft: receipt.parsedPayload as ReceiptDraft,
    }
  }

  /**
   * Links a transaction to a receipt after successful post.
   * Internal use only — called after LedgerModule.postTransaction() succeeds.
   */
  async linkTransaction(receiptId: string, userId: string, transactionId: string) {
    const receipt = await this.repository.findById(receiptId, userId)
    if (!receipt) {
      throw new AppError(
        'RECEIPT_NOT_FOUND',
        'Receipt not found',
        { statusCode: 404 },
      )
    }

    if (receipt.status === 'committed') {
      // Idempotent — if already committed, return success
      return receipt
    }

    return this.repository.update(receiptId, userId, {
      status: 'committed',
      transactionId,
    })
  }

  /**
   * Deletes a receipt if it has not been committed.
   * Once a receipt is linked to a transaction, it becomes part of the ledger
   * and cannot be deleted via this endpoint.
   */
  async deleteReceipt(receiptId: string, userId: string) {
    const receipt = await this.repository.findById(receiptId, userId)
    if (!receipt) {
      throw new AppError(
        'RECEIPT_NOT_FOUND',
        'Receipt not found',
        { statusCode: 404 },
      )
    }

    if (receipt.transactionId) {
      throw new AppError(
        'RECEIPT_LINKED_TO_TRANSACTION',
        'Cannot delete a receipt that has been committed to a transaction',
        { statusCode: 400, field: 'receiptId' },
      )
    }

    // Delete from object store
    await this.objectStore.delete(receipt.storageKey)

    // Delete from database
    await this.repository.delete(receiptId, userId)

    return true
  }

  /**
   * Retrieves receipt metadata by ID (user-scoped).
   */
  async getReceipt(receiptId: string, userId: string) {
    const receipt = await this.repository.findById(receiptId, userId)
    if (!receipt) {
      throw new AppError(
        'RECEIPT_NOT_FOUND',
        'Receipt not found',
        { statusCode: 404 },
      )
    }

    return receipt
  }
}
