/**
 * Receipt repository for database access.
 * All queries are user-scoped and require explicit user_id.
 */

import type { PrismaClient, Receipt } from '@prisma/client'

export interface CreateReceiptInput {
  userId: string
  storageKey: string
  originalFilename: string
  mimeType: string
  sizeBytes: bigint
  sha256: string
}

export interface UpdateReceiptInput {
  status?: string
  ocrProvider?: string
  ocrText?: string
  parsedPayload?: Record<string, unknown> | null
  transactionId?: string | null
}

export class ReceiptsRepository {
  constructor(private prisma: PrismaClient) {}

  async create(input: CreateReceiptInput) {
    return this.prisma.receipt.create({
      data: {
        userId: input.userId,
        storageKey: input.storageKey,
        originalFilename: input.originalFilename,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        sha256: input.sha256,
        status: 'uploaded',
      },
    })
  }

  async findById(id: string, userId: string): Promise<Receipt | null> {
    const receipt = await this.prisma.receipt.findUnique({
      where: { id },
    })

    // Explicitly verify user ownership
    if (receipt && receipt.userId !== userId) {
      return null
    }
    return receipt
  }

  async listByUserId(userId: string, limit = 50, offset = 0) {
    return this.prisma.receipt.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    })
  }

  async update(id: string, userId: string, input: UpdateReceiptInput): Promise<Receipt | null> {
    const receipt = await this.findById(id, userId)
    if (!receipt) {
      return null
    }

    const data: Record<string, unknown> = {}
    if (input.status !== undefined) data.status = input.status
    if (input.ocrProvider !== undefined) data.ocrProvider = input.ocrProvider
    if (input.ocrText !== undefined) data.ocrText = input.ocrText
    if (input.parsedPayload !== undefined) data.parsedPayload = input.parsedPayload
    if (input.transactionId !== undefined) data.transactionId = input.transactionId

    return this.prisma.receipt.update({
      where: { id },
      data: data as any,
    })
  }

  async delete(id: string, userId: string): Promise<boolean> {
    const receipt = await this.findById(id, userId)
    if (!receipt) {
      return false
    }

    await this.prisma.receipt.delete({ where: { id } })
    return true
  }

  async findByTransactionId(transactionId: string): Promise<Receipt | null> {
    return this.prisma.receipt.findUnique({
      where: { transactionId },
    })
  }
}
