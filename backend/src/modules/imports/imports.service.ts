/**
 * ImportsService - business logic for import batches and transactions.
 * Handles:
 * - Import batch lifecycle management
 * - Imported transaction validation and deduplication
 * - Commit logic (posting to ledger through LedgerModule)
 * - Plaid token encryption/decryption
 */

import type { PrismaClient, ImportBatch, ImportedTransaction } from '@prisma/client'
import { ImportsRepository } from './imports.repository.js'
import type { LedgerService } from '../ledger/ledger.service.js'
import type { PostTransactionInput } from '../ledger/ledger.schemas.js'
import type { Env } from '../../config/env.js'
import { AppError } from '../../common/errors/appError.js'
import { encryptForUser, decryptForUser } from '../../common/crypto/encryption.js'

export interface ImportBatchSummary {
  id: string
  status: string
  totalCount: number
  committedCount: number
  errorCount: number
  createdAt: Date
  updatedAt: Date
}

export interface ImportedTransactionRow {
  id: string
  title: string
  amountMinor: bigint
  occurredOn: Date
  status: string
  validationErrors: string[]
}

export interface CommitImportBatchInput {
  matchedAccountId: string // Which account to post these transactions to
}

export class ImportsService {
  readonly repo: ImportsRepository

  constructor(private prisma: PrismaClient, private ledgerService: LedgerService, private env: Env) {
    this.repo = new ImportsRepository(prisma)
  }

  /**
   * Create a new import batch.
   * importSourceType: 'plaid_sandbox' or 'csv_manual'
   * importSourceId: PlaidItem ID if from Plaid, null if manual CSV
   */
  async createImportBatch(
    userId: string,
    importSourceType: 'plaid_sandbox' | 'csv_manual',
    importSourceId?: string
  ): Promise<ImportBatch> {
    return this.repo.createImportBatch({
      userId,
      importSourceType,
      importSourceId: importSourceId || null,
    })
  }

  /**
   * Get import batch with full details.
   */
  async getImportBatch(batchId: string, userId: string) {
    const batch = await this.repo.getImportBatch(batchId, userId)
    if (!batch) {
      throw new AppError('NOT_FOUND', 'Import batch not found', { statusCode: 404 })
    }
    return batch
  }

  /**
   * List import batches for a user.
   */
  async listImportBatches(userId: string, status?: string) {
    return this.repo.listImportBatches(userId, {
      status,
      limit: 50,
    })
  }

  /**
   * Add an imported transaction to a batch.
   * Validates deduplication key and returns validation errors if present.
   */
  async addImportedTransaction(
    batchId: string,
    userId: string,
    input: {
      dedupKey: string
      provider: string
      providerTransactionId?: string
      title: string
      description?: string
      amountMinor: bigint
      occurredOn: Date
      currencyCode?: string
      merchantName?: string
    }
  ): Promise<ImportedTransaction> {
    // Verify batch belongs to user
    const batch = await this.getImportBatch(batchId, userId)

    // Check if already committed
    if (batch.status === 'committed') {
      throw new AppError('INVALID_STATE', 'Cannot add transactions to committed batch', { statusCode: 400 })
    }

    // Create the imported transaction
    // May fail with unique constraint violation if this exact (provider, dedupKey) already exists
    try {
      const txn = await this.repo.createImportedTransaction({
        importBatchId: batchId,
        dedupKey: input.dedupKey,
        provider: input.provider,
        providerTransactionId: input.providerTransactionId,
        title: input.title,
        description: input.description,
        amountMinor: input.amountMinor,
        occurredOn: input.occurredOn,
        currencyCode: input.currencyCode || 'PHP',
        merchantName: input.merchantName,
        validationErrors: this.validateTransaction(input),
      })

      // Increment batch transaction count
      await this.repo.updateImportBatch(batchId, userId, {
        totalCount: batch.totalCount + 1,
        errorCount:
          txn.validationErrors && txn.validationErrors.length > 0 ? (batch.errorCount || 0) + 1 : batch.errorCount,
      })

      return txn
    } catch (error: any) {
      // Check if this is a unique constraint violation on (provider, dedup_key)
      if (
        error?.code === 'P2002' &&
        error?.meta?.target &&
        Array.isArray(error.meta.target) &&
        error.meta.target.length === 2 &&
        error.meta.target.includes('provider') &&
        error.meta.target.includes('dedup_key')
      ) {
        throw new AppError('DUPLICATE_IMPORT', 'This transaction was already imported', { statusCode: 409 })
      }
      throw error
    }
  }

  /**
   * Validate an imported transaction.
   * Returns array of validation error strings (empty if valid).
   */
  private validateTransaction(input: {
    amountMinor: bigint
    occurredOn: Date
    title: string
  }): string[] {
    const errors: string[] = []

    if (input.amountMinor <= 0n) {
      errors.push('Amount must be positive')
    }

    if (!input.title || input.title.trim().length === 0) {
      errors.push('Title is required')
    }

    if (isNaN(input.occurredOn.getTime())) {
      errors.push('Invalid date')
    }

    return errors
  }

  /**
   * Update the status of an imported transaction.
   */
  async updateImportedTransactionStatus(transactionId: string, userId: string, status: 'validated' | 'rejected') {
    return this.repo.updateImportedTransactionStatus(transactionId, userId, status)
  }

  /**
   * Commit an import batch to the ledger.
   * Posts all validated transactions through LedgerModule.
   * Uses dedup keys as idempotency keys to prevent duplicate posts on retry.
   * Creates Posting records to link imported -> ledger transactions.
   */
  async commitImportBatch(
    batchId: string,
    userId: string,
    input: CommitImportBatchInput
  ): Promise<{ committedCount: number; errors: Array<{ txnId: string; error: string }> }> {
    const batch = await this.getImportBatch(batchId, userId)

    if (batch.status === 'committed') {
      throw new AppError('INVALID_STATE', 'Batch already committed', { statusCode: 400 })
    }

    if (!batch.matchedAccountId && !input.matchedAccountId) {
      throw new AppError('INVALID_REQUEST', 'No matched account provided', { statusCode: 400 })
    }

    const matchedAccountId = input.matchedAccountId || batch.matchedAccountId!

    // Verify user owns the target account
    const account = await this.prisma.financialAccount.findFirst({
      where: {
        id: matchedAccountId,
        userId,
      },
    })

    if (!account) {
      throw new AppError('UNKNOWN_ACCOUNT', 'Target account not found or unauthorized', { statusCode: 404 })
    }

    // Get all pending/validated transactions in the batch
    const transactionsToCommit = await this.prisma.importedTransaction.findMany({
      where: {
        importBatchId: batchId,
        status: {
          in: ['pending_review', 'validated'],
        },
      },
    })

    let committedCount = 0
    const errors: Array<{ txnId: string; error: string }> = []

    // Post each transaction through LedgerModule
    for (const importedTxn of transactionsToCommit) {
      try {
        // Skip if already has a posting
        const existing = await this.repo.getPostingByImportedTransaction(importedTxn.id)
        if (existing) {
          committedCount++
          continue
        }

        // Determine transaction type based on amount sign and merchant
        const type: 'income' | 'expense' | 'transfer' = this.determineTransactionType(importedTxn)

        // Post through LedgerModule
        const occurredOnStr = importedTxn.occurredOn.toISOString().split('T')[0]
        // FIXME: Phase 11 Defect 6 - amountMinor conversion from bigint to Number
        // LedgerService.postTransaction() accepts number (not bigint) per its schema.
        // The ledger repository internally converts to BigInt for storage.
        // Converting imported amounts (bigint) to Number is safe for PHP currency because:
        // - MAX_SAFE_INTEGER = 9007199254740991 = PHP 90,071,992,547,409.91
        // - Personal finance amounts never reach this (production corporate mode is out of scope)
        // - If amounts ever exceed this, silent precision loss is a hard error and must be fixed
        // Ideal fix: refactor ledger schema to accept bigint directly for consistency.
        const postInput: PostTransactionInput = {
          type,
          title: importedTxn.title,
          categoryId: null, // User can categorize manually later
          goalId: null,
          fromAccountId: type === 'expense' || type === 'transfer' ? matchedAccountId : null,
          toAccountId: type === 'income' || type === 'transfer' ? matchedAccountId : null,
          occurredOn: occurredOnStr || new Date().toISOString().split('T')[0]!,
          occurredTime: null,
          amountMinor: Number(importedTxn.amountMinor), // Safe for PHP; see comment above
          feeMinor: 0,
          currencyCode: importedTxn.currencyCode,
          source: 'import',
          status: 'cleared',
          note: importedTxn.description ? importedTxn.description : undefined,
          idempotencyKey: importedTxn.dedupKey, // Use dedup key as idempotency key
        }

        const result = await this.ledgerService.postTransaction(userId, postInput)

        // Create posting to link imported transaction to real transaction
        await this.repo.createPosting(importedTxn.id, result.transaction.id)

        // Update imported transaction status to validated (already confirmed by user)
        await this.repo.updateImportedTransactionStatus(importedTxn.id, userId, 'validated')

        committedCount++
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        errors.push({ txnId: importedTxn.id, error: message })
      }
    }

    // Update batch status
    await this.repo.updateImportBatch(batchId, userId, {
      status: 'committed',
      committedCount,
      committedAt: new Date(),
      errorMessage: errors.length > 0 ? `${errors.length} transactions failed to post` : null,
    })

    return { committedCount, errors }
  }

  /**
   * Determine transaction type based on amount and merchant.
   * In a real implementation, this might use ML/heuristics.
   * For Phase 11, we use a simple rule:
   * - If positive and common income patterns (salary, payment, etc): income
   * - Otherwise: expense
   */
  private determineTransactionType(txn: ImportedTransaction): 'income' | 'expense' | 'transfer' {
    const incomeKeywords = ['salary', 'income', 'deposit', 'refund', 'payment received', 'transfer in']

    if (incomeKeywords.some((keyword) => txn.title.toLowerCase().includes(keyword))) {
      return 'income'
    }

    // Default to expense
    return 'expense'
  }

  /**
   * Create or update a Plaid item with plaintext access token.
   * Automatically encrypts the token before storage using user-specific encryption.
   * Requires ENCRYPTION_SECRET to be configured.
   */
  async createPlaidItem(
    userId: string,
    itemId: string,
    plainAccessToken: string,
    accountIds: string[],
    institutionName?: string
  ) {
    if (!this.env.ENCRYPTION_SECRET) {
      throw new AppError(
        'ENCRYPTION_NOT_CONFIGURED',
        'ENCRYPTION_SECRET environment variable is required for Plaid integration',
        { statusCode: 500 }
      )
    }

    // Encrypt access token before storage
    const encryptedAccessToken = encryptForUser(plainAccessToken, userId, this.env.ENCRYPTION_SECRET)
    return this.repo.createOrUpdatePlaidItem(userId, itemId, encryptedAccessToken, accountIds, institutionName)
  }

  /**
   * Get Plaid item (returns encrypted token; use getDecryptedAccessToken to access it).
   */
  async getPlaidItem(itemId: string, userId: string) {
    return this.repo.getPlaidItem(itemId, userId)
  }

  /**
   * Get and decrypt the access token for a Plaid item.
   * Required for calling sync() or other operations that need the actual token.
   */
  async getDecryptedAccessToken(itemId: string, userId: string): Promise<string> {
    if (!this.env.ENCRYPTION_SECRET) {
      throw new AppError(
        'ENCRYPTION_NOT_CONFIGURED',
        'ENCRYPTION_SECRET environment variable is required for Plaid integration',
        { statusCode: 500 }
      )
    }

    const item = await this.repo.getPlaidItem(itemId, userId)
    if (!item) {
      throw new AppError('NOT_FOUND', 'Plaid item not found', { statusCode: 404 })
    }

    try {
      return decryptForUser(item.encryptedAccessToken, userId, this.env.ENCRYPTION_SECRET)
    } catch (error) {
      throw new AppError(
        'DECRYPTION_FAILED',
        'Failed to decrypt access token (possible corruption or wrong encryption key)',
        { statusCode: 500, cause: error }
      )
    }
  }

  /**
   * List Plaid items for user.
   */
  async listPlaidItems(userId: string) {
    return this.repo.listPlaidItems(userId)
  }

  /**
   * Create a Plaid link token.
   */
  async createPlaidLinkToken(userId: string, linkToken: string, expiresIn: number) {
    const expiresAt = new Date(Date.now() + expiresIn * 1000)
    return this.repo.createPlaidLinkToken(userId, linkToken, expiresAt)
  }

  /**
   * Get and validate a Plaid link token.
   */
  async getPlaidLinkToken(linkToken: string) {
    const token = await this.repo.getPlaidLinkToken(linkToken)
    if (!token) {
      throw new AppError('INVALID_TOKEN', 'Link token not found or expired', { statusCode: 400 })
    }
    return token
  }

  /**
   * Delete link token after exchange (one-time use).
   */
  async deletePlaidLinkToken(linkToken: string) {
    return this.repo.deletePlaidLinkToken(linkToken)
  }
}
