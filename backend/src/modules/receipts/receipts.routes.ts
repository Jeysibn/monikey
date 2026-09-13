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
const receiptStatuses = ['uploaded', 'processing', 'ready', 'failed', 'committed'] as const
const receiptIdParamsJson = { type: 'object', additionalProperties: false, required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } } as const
const receiptDraftJson = { type: 'object', additionalProperties: false, properties: { merchant: { type: 'string' }, date: { type: 'string', format: 'date' }, totalMinor: { type: 'string', pattern: '^\\d+$' }, category: { type: 'string' }, confidence: { type: 'number' } } } as const
const uploadBodyJson = { type: 'object', additionalProperties: false, required: ['filename', 'mimeType', 'data'], properties: { filename: { type: 'string', minLength: 1, maxLength: 255 }, mimeType: { type: 'string', minLength: 1 }, data: { type: 'string', minLength: 1 } } } as const
const commitBodyJson = { type: 'object', additionalProperties: false, required: ['title', 'fromAccountId', 'amountMinor', 'occurredOn'], properties: { title: { type: 'string', minLength: 1, maxLength: 255 }, categoryId: { anyOf: [{ type: 'string', format: 'uuid' }, { type: 'null' }] }, fromAccountId: { type: 'string', format: 'uuid' }, amountMinor: { type: 'string', pattern: '^\\d+$' }, currencyCode: { type: 'string', minLength: 3, maxLength: 3, default: 'PHP' }, occurredOn: { type: 'string', format: 'date' }, note: { anyOf: [{ type: 'string' }, { type: 'null' }] } } } as const
const uploadedReceiptJson = { type: 'object', additionalProperties: false, required: ['receipt'], properties: { receipt: { type: 'object', additionalProperties: false, required: ['id', 'status'], properties: { id: { type: 'string', format: 'uuid' }, status: { type: 'string', enum: receiptStatuses } } } } } as const
const receiptMetadataJson = { type: 'object', additionalProperties: false, required: ['receipt'], properties: { receipt: { type: 'object', additionalProperties: false, required: ['id', 'status', 'storageKey', 'originalFilename', 'mimeType', 'sizeBytes', 'sha256', 'ocrProvider', 'ocrText', 'parsedPayload', 'transactionId', 'createdAt', 'updatedAt'], properties: { id: { type: 'string', format: 'uuid' }, status: { type: 'string', enum: receiptStatuses }, storageKey: { type: 'string' }, originalFilename: { type: 'string' }, mimeType: { type: 'string' }, sizeBytes: { type: 'string', pattern: '^\\d+$' }, sha256: { type: 'string', pattern: '^[a-f0-9]{64}$' }, ocrProvider: { anyOf: [{ type: 'string' }, { type: 'null' }] }, ocrText: { anyOf: [{ type: 'string' }, { type: 'null' }] }, parsedPayload: { anyOf: [receiptDraftJson, { type: 'null' }] }, transactionId: { anyOf: [{ type: 'string', format: 'uuid' }, { type: 'null' }] }, createdAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' } } } } } as const
const processedReceiptJson = { type: 'object', additionalProperties: false, required: ['receipt'], properties: { receipt: { type: 'object', additionalProperties: false, required: ['id', 'status', 'draft', 'ocrText'], properties: { id: { type: 'string', format: 'uuid' }, status: { type: 'string', enum: receiptStatuses }, draft: receiptDraftJson, ocrText: { type: 'string' } } } } } as const
const committedReceiptJson = { type: 'object', additionalProperties: false, required: ['transaction', 'receipt'], properties: { transaction: { type: 'object', additionalProperties: false, required: ['id', 'status'], properties: { id: { type: 'string', format: 'uuid' }, status: { type: 'string' } } }, receipt: { type: 'object', additionalProperties: false, required: ['id', 'status'], properties: { id: { type: 'string', format: 'uuid' }, status: { const: 'committed' } } } } } as const

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

  app.post('/receipts', { preValidation: requireAuth, preHandler: requireOrigin, schema: { body: uploadBodyJson, response: { 201: uploadedReceiptJson } } }, async (request: FastifyRequest, reply: FastifyReply) => {
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
    { preValidation: requireAuth, schema: { params: receiptIdParamsJson, response: { 200: receiptMetadataJson } } },
    async (request: FastifyRequest<{ Params: { id: string } }>) => {
      const userId = request.user!.id
      // D8: Validate UUID path parameter
      const { id: receiptId } = receiptIdParamSchema.parse(request.params)

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
    { preValidation: requireAuth, preHandler: requireOrigin, schema: { params: receiptIdParamsJson, response: { 200: processedReceiptJson } } },
    async (request: FastifyRequest<{ Params: { id: string } }>) => {
      const userId = request.user!.id
      // D8: Validate UUID path parameter
      const { id: receiptId } = receiptIdParamSchema.parse(request.params)

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
    // Money crosses the JSON boundary as a decimal string. Accepting a
    // JavaScript number here would create an avoidable precision boundary
    // before the ledger receives its canonical bigint value.
    amountMinor: z.string().regex(/^\d+$/, 'amountMinor must be a non-negative integer string').transform((value) => BigInt(value)).pipe(z.bigint().positive()),
    currencyCode: z.string().length(3).default('PHP'),
    occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    note: z.string().nullable().optional(),
  })

  app.post<{ Params: { id: string } }>(
    '/receipts/:id/commit',
    { preValidation: requireAuth, preHandler: requireOrigin, schema: { params: receiptIdParamsJson, body: commitBodyJson, response: { 201: committedReceiptJson } } },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const userId = request.user!.id
      // D8: Validate UUID path parameter
      const { id: receiptId } = receiptIdParamSchema.parse(request.params)

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
          feeMinor: 0n,
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
    { preValidation: requireAuth, preHandler: requireOrigin, schema: { params: receiptIdParamsJson, response: { 204: { type: 'null' } } } },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const userId = request.user!.id
      // D8: Validate UUID path parameter
      const { id: receiptId } = receiptIdParamSchema.parse(request.params)

      await receiptsService.deleteReceipt(receiptId, userId)

      return reply.status(204).send()
    },
  )
}
