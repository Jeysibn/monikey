/**
 * Receipt HTTP routes.
 * POST /receipts — upload receipt (accepts base64-encoded file in request body)
 * GET /receipts/:id — get receipt metadata and status
 * POST /receipts/:id/process — invoke OCR (user must have opted in)
 * POST /receipts/:id/commit — confirm draft and post through LedgerModule
 * DELETE /receipts/:id — delete receipt (only before commit)
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { originCheckPreHandler } from '../../common/auth/originCheck.js'
import { authGuard } from '../../common/auth/authGuard.js'
import type { ObjectStore } from '../../integrations/interfaces/objectStore.js'
import type { OcrProvider } from '../../integrations/interfaces/ocrProvider.js'
import type { LedgerService } from '../ledger/ledger.service.js'
import { ReceiptsService } from './receipts.service.js'

// UUID validation for path parameters (D8: malformed UUID handling)
const receiptIdParamSchema = z.object({ id: z.string().uuid('Invalid receipt ID format') })

export interface ReceiptsRoutesOptions {
  prisma: PrismaClient
  objectStore: ObjectStore
  ocrProvider: OcrProvider
  ledgerService: LedgerService
  appOrigin: string
}

export async function receiptsRoutes(
  app: FastifyInstance,
  opts: ReceiptsRoutesOptions,
) {
  const { prisma, objectStore, ocrProvider, ledgerService, appOrigin } = opts
  const receiptsService = new ReceiptsService(prisma, objectStore, ocrProvider)

  const requireAuth = authGuard({ prisma })
  const requireOrigin = originCheckPreHandler({ APP_ORIGIN: appOrigin })

  app.addHook('preHandler', requireAuth)

  /**
   * POST /receipts — upload receipt file
   * Accepts base64-encoded file in JSON body
   */
  const uploadSchema = z.object({
    filename: z.string().min(1).max(255),
    mimeType: z.string().min(1), // Full validation happens in service
    data: z.string().min(1), // base64-encoded file content
  })

  app.post('/receipts', { preHandler: requireOrigin }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.id

    const body = uploadSchema.parse(request.body)
    const buffer = Buffer.from(body.data, 'base64')

    const receipt = await receiptsService.uploadReceipt(userId, {
      filename: body.filename,
      mimeType: body.mimeType,
      buffer,
    })

    return reply.status(201).send({
      receipt: {
        id: receipt.id,
        status: receipt.status,
      },
    })
  })

  /**
   * GET /receipts/:id — get receipt metadata
   */
  app.get<{ Params: { id: string } }>(
    '/receipts/:id',
    { schema: { params: receiptIdParamSchema } },
    async (request: FastifyRequest<{ Params: { id: string } }>) => {
      const userId = request.user!.id
      const receiptId = request.params.id

      const receipt = await receiptsService.getReceipt(receiptId, userId)

      return {
        receipt: {
          id: receipt.id,
          status: receipt.status,
          storageKey: receipt.storageKey,
          originalFilename: receipt.originalFilename,
          mimeType: receipt.mimeType,
          sizeBytes: receipt.sizeBytes.toString(),
          sha256: receipt.sha256,
          ocrProvider: receipt.ocrProvider,
          ocrText: receipt.ocrText,
          parsedPayload: receipt.parsedPayload,
          transactionId: receipt.transactionId,
          createdAt: receipt.createdAt.toISOString(),
          updatedAt: receipt.updatedAt.toISOString(),
        },
      }
    },
  )

  /**
   * POST /receipts/:id/process — invoke OCR on receipt
   */
  app.post<{ Params: { id: string } }>(
    '/receipts/:id/process',
    { schema: { params: receiptIdParamSchema }, preHandler: requireOrigin },
    async (request: FastifyRequest<{ Params: { id: string } }>) => {
      const userId = request.user!.id
      const receiptId = request.params.id

      const result = await receiptsService.processReceipt({
        receiptId,
        userId,
      })

      return {
        receipt: {
          id: result.id,
          status: result.status,
          draft: result.draft,
          ocrText: result.ocrText,
        },
      }
    },
  )

  /**
   * POST /receipts/:id/commit — confirm and post receipt as transaction
   */
  const commitSchema = z.object({
    title: z.string().min(1).max(255),
    categoryId: z.string().uuid().nullable().optional(),
    fromAccountId: z.string().uuid(),
    amountMinor: z.number().int().positive(),
    currencyCode: z.string().length(3).default('PHP'),
    occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    note: z.string().nullable().optional(),
  })

  app.post<{ Params: { id: string } }>(
    '/receipts/:id/commit',
    { schema: { params: receiptIdParamSchema }, preHandler: requireOrigin },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const userId = request.user!.id
      const receiptId = request.params.id

      const body = commitSchema.parse(request.body)

      // Get receipt and verify readiness
      const receiptData = await receiptsService.commitReceipt({
        receiptId,
        userId,
        draft: {},
        transactionData: body,
      })

      // Post the transaction through LedgerModule
      const result = await ledgerService.postTransaction(
        userId,
        {
          type: 'expense',
          title: body.title,
          categoryId: body.categoryId ?? null,
          fromAccountId: body.fromAccountId,
          amountMinor: body.amountMinor,
          feeMinor: 0,
          currencyCode: body.currencyCode,
          occurredOn: body.occurredOn,
          source: 'ocr',
          status: 'cleared',
          note: body.note ?? null,
        },
      )

      // Link receipt to transaction
      await receiptsService.linkTransaction(receiptId, userId, result.transaction.id)

      return reply.status(201).send({
        transaction: {
          id: result.transaction.id,
          status: result.transaction.status,
        },
        receipt: {
          id: receiptData.id,
          status: 'committed',
        },
      })
    },
  )

  /**
   * DELETE /receipts/:id — delete receipt
   * Only allowed if not yet committed to a transaction
   */
  app.delete<{ Params: { id: string } }>(
    '/receipts/:id',
    { schema: { params: receiptIdParamSchema }, preHandler: requireOrigin },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const userId = request.user!.id
      const receiptId = request.params.id

      await receiptsService.deleteReceipt(receiptId, userId)

      return reply.status(204).send()
    },
  )
}
