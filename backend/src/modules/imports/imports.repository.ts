/**
 * ImportsRepository - data access layer for import batches and imported transactions.
 * Handles all database operations for Phase 11 import staging.
 */

import type { PrismaClient } from '@prisma/client'

export interface CreateImportBatchInput {
  userId: string
  importSourceId?: string | null
  importSourceType: 'plaid_sandbox' | 'csv_manual'
  matchedAccountId?: string | null
}

export interface CreateImportedTransactionInput {
  importBatchId: string
  dedupKey: string
  provider: string
  providerTransactionId?: string | null
  occurredOn: Date
  title: string
  description?: string | null
  amountMinor: bigint
  currencyCode: string
  merchantName?: string | null
  validationErrors?: string[]
}

export interface UpdateImportBatchInput {
  status?: 'reviewing' | 'committed' | 'archived' | 'failed'
  matchedAccountId?: string | null
  totalCount?: number
  committedCount?: number
  errorCount?: number
  errorMessage?: string | null
  committedAt?: Date | null
}

export class ImportsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Create a new import batch.
   */
  async createImportBatch(input: CreateImportBatchInput) {
    return this.prisma.importBatch.create({
      data: {
        userId: input.userId,
        importSourceId: input.importSourceId || null,
        importSourceType: input.importSourceType,
        matchedAccountId: input.matchedAccountId || null,
        status: 'reviewing',
      },
    })
  }

  /**
   * Get an import batch by ID with user scope.
   */
  async getImportBatch(batchId: string, userId: string) {
    return this.prisma.importBatch.findFirst({
      where: {
        id: batchId,
        userId,
      },
      include: {
        importedTransactions: true,
        plaidItem: true,
      },
    })
  }

  /**
   * List import batches for a user.
   */
  async listImportBatches(userId: string, options?: { status?: string; limit?: number; offset?: number }) {
    const where: any = { userId }
    if (options?.status) {
      where.status = options.status
    }

    return this.prisma.importBatch.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: options?.limit || 50,
      skip: options?.offset || 0,
      include: {
        importedTransactions: {
          select: { id: true, status: true },
        },
      },
    })
  }

  /**
   * Update an import batch.
   */
  async updateImportBatch(batchId: string, userId: string, input: UpdateImportBatchInput) {
    return this.prisma.importBatch.update({
      where: {
        id: batchId,
      },
      data: {
        ...input,
      },
    })
  }

  /**
   * Create an imported transaction.
   */
  async createImportedTransaction(input: CreateImportedTransactionInput) {
    return this.prisma.importedTransaction.create({
      data: {
        importBatchId: input.importBatchId,
        dedupKey: input.dedupKey,
        provider: input.provider,
        providerTransactionId: input.providerTransactionId || null,
        occurredOn: input.occurredOn,
        title: input.title,
        description: input.description || null,
        amountMinor: input.amountMinor,
        currencyCode: input.currencyCode,
        merchantName: input.merchantName || null,
        validationErrors: input.validationErrors || [],
        status: 'pending_review',
      },
    })
  }

  /**
   * Get an imported transaction with user scope.
   */
  async getImportedTransaction(transactionId: string, userId: string) {
    return this.prisma.importedTransaction.findFirst({
      where: {
        id: transactionId,
        importBatch: {
          userId,
        },
      },
    })
  }

  /**
   * List imported transactions in a batch.
   */
  async listImportedTransactions(
    batchId: string,
    userId: string,
    options?: { status?: string; limit?: number; offset?: number }
  ) {
    // Verify batch belongs to user
    const batch = await this.prisma.importBatch.findFirst({
      where: { id: batchId, userId },
    })

    if (!batch) {
      return null // Unauthorized or not found
    }

    const where: any = { importBatchId: batchId }
    if (options?.status) {
      where.status = options.status
    }

    return this.prisma.importedTransaction.findMany({
      where,
      orderBy: { occurredOn: 'desc' },
      take: options?.limit || 100,
      skip: options?.offset || 0,
    })
  }

  /**
   * Update an imported transaction status.
   */
  async updateImportedTransactionStatus(transactionId: string, userId: string, status: string) {
    // Verify ownership
    const txn = await this.getImportedTransaction(transactionId, userId)
    if (!txn) {
      throw new Error('Imported transaction not found or unauthorized')
    }

    return this.prisma.importedTransaction.update({
      where: { id: transactionId },
      data: { status },
    })
  }

  /**
   * Check for duplicate imported transaction using dedup key and provider.
   * Returns the existing imported transaction if found.
   */
  async checkDuplicate(provider: string, dedupKey: string) {
    return this.prisma.importedTransaction.findFirst({
      where: {
        provider,
        dedupKey,
      },
    })
  }

  /**
   * Create a posting (link between imported transaction and real ledger transaction).
   */
  async createPosting(importedTransactionId: string, transactionId: string) {
    return this.prisma.posting.create({
      data: {
        importedTransactionId,
        transactionId,
      },
    })
  }

  /**
   * Get a posting by imported transaction ID.
   */
  async getPostingByImportedTransaction(importedTransactionId: string) {
    return this.prisma.posting.findUnique({
      where: {
        importedTransactionId,
      },
    })
  }

  /**
   * Create or retrieve a Plaid item for a user.
   */
  async createOrUpdatePlaidItem(
    userId: string,
    itemId: string,
    encryptedAccessToken: string,
    accountIds: string[],
    institutionName?: string
  ) {
    return this.prisma.plaidItem.upsert({
      where: {
        userId_itemId: {
          userId,
          itemId,
        },
      },
      create: {
        userId,
        itemId,
        encryptedAccessToken,
        accountIds,
        institutionName: institutionName || null,
      },
      update: {
        encryptedAccessToken,
        accountIds,
        institutionName: institutionName || null,
        status: 'active',
      },
    })
  }

  /**
   * Get a Plaid item by database ID with user scope.
   */
  async getPlaidItem(itemId: string, userId: string) {
    return this.prisma.plaidItem.findFirst({
      where: {
        id: itemId,
        userId,
      },
    })
  }

  /**
   * Get a Plaid item by the Plaid item_id (from Plaid API).
   */
  async getPlaidItemByItemId(itemId: string) {
    return this.prisma.plaidItem.findFirst({
      where: {
        itemId,
      },
    })
  }

  /**
   * List Plaid items for a user.
   */
  async listPlaidItems(userId: string) {
    return this.prisma.plaidItem.findMany({
      where: { userId, status: 'active' },
      orderBy: { createdAt: 'desc' },
    })
  }

  /**
   * Update Plaid item status and error info.
   */
  async updatePlaidItemStatus(itemId: string, userId: string, status: string, errorMessage?: string) {
    return this.prisma.plaidItem.update({
      where: { id: itemId },
      data: {
        status,
        errorMessage: errorMessage || null,
      },
    })
  }

  /**
   * Update a Plaid item with arbitrary data.
   */
  async updatePlaidItem(itemId: string, data: any) {
    return this.prisma.plaidItem.update({
      where: { id: itemId },
      data,
    })
  }

  /**
   * Create a Plaid link token.
   */
  async createPlaidLinkToken(userId: string, linkToken: string, expiresAt: Date) {
    return this.prisma.plaidLinkToken.create({
      data: {
        userId,
        linkToken,
        expiresAt,
      },
    })
  }

  /**
   * Get a Plaid link token (and verify it's not expired).
   */
  async getPlaidLinkToken(linkToken: string) {
    const token = await this.prisma.plaidLinkToken.findUnique({
      where: { linkToken },
    })

    if (token && token.expiresAt > new Date()) {
      return token
    }

    return null
  }

  /**
   * Delete a Plaid link token after exchange.
   */
  async deletePlaidLinkToken(linkToken: string) {
    return this.prisma.plaidLinkToken.delete({
      where: { linkToken },
    })
  }
}
