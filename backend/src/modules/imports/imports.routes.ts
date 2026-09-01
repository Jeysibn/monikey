/**
 * Imports module routes for Plaid Sandbox and manual CSV import.
 *
 * Routes:
 * POST   /imports/batches                     - Create import batch
 * GET    /imports/batches                     - List import batches
 * GET    /imports/batches/:batchId            - Get batch details
 * POST   /imports/batches/:batchId/commit     - Commit batch to ledger
 * POST   /imports/batches/:batchId/transactions - Add imported transaction
 * GET    /imports/batches/:batchId/transactions - List batch transactions
 *
 * Plaid integration (sandbox-only):
 * POST   /imports/plaid/link-token            - Create Plaid link token
 * POST   /imports/plaid/exchange-token        - Exchange Plaid public token
 * POST   /imports/plaid/webhook               - Handle Plaid webhooks
 * GET    /imports/plaid/items                 - List Plaid items
 *
 * Manual CSV:
 * POST   /imports/csv/upload                  - Upload CSV file
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { authGuard } from '../../common/auth/authGuard.js'
import { originCheckPreHandler } from '../../common/auth/originCheck.js'
import type { LedgerService } from '../ledger/ledger.service.js'
import { ImportsService } from './imports.service.js'
import type { BankAggregationProvider } from '../../integrations/interfaces/bankDataProvider.js'

const createImportBatchSchema = z.object({
  sourceType: z.enum(['plaid_sandbox', 'csv_manual']),
  plaidItemId: z.string().uuid().optional(),
})

const addImportedTransactionSchema = z.object({
  dedupKey: z.string().min(1),
  provider: z.string().min(1),
  providerTransactionId: z.string().optional(),
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  amountMinor: z.number().int().positive(),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  currencyCode: z.string().length(3).default('PHP'),
  merchantName: z.string().optional(),
})

const commitBatchSchema = z.object({
  matchedAccountId: z.string().uuid(),
})

const plaidExchangeTokenSchema = z.object({
  publicToken: z.string().min(1),
  linkToken: z.string().min(1),
})

export async function createImportsRoutes(
  app: FastifyInstance,
  options: {
    prisma: PrismaClient
    ledgerService: LedgerService
    bankProvider: BankAggregationProvider
    appOrigin: string
  }
) {
  const { prisma, ledgerService, bankProvider, appOrigin } = options
  const importsService = new ImportsService(prisma, ledgerService)

  const requireAuth = authGuard({ prisma })
  const requireOrigin = originCheckPreHandler({ APP_ORIGIN: appOrigin })

  app.addHook('preHandler', requireAuth)

  /**
   * POST /imports/batches
   * Create a new import batch
   */
  app.post<{ Body: z.infer<typeof createImportBatchSchema> }>(
    '/batches',
    { preHandler: requireOrigin },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const input = createImportBatchSchema.parse(request.body)
      const userId = request.user!.id

      const batch = await importsService.createImportBatch(
        userId,
        input.sourceType,
        input.plaidItemId
      )

      return reply.code(201).send(batch)
    }
  )

  /**
   * GET /imports/batches
   * List import batches for user
   */
  app.get<{ Querystring: { status?: string } }>(
    '/batches',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.id
      const status = (request.query as any).status as string | undefined

      const batches = await importsService.listImportBatches(userId, status)
      return reply.send(batches)
    }
  )

  /**
   * GET /imports/batches/:batchId
   * Get import batch details
   */
  app.get<{ Params: { batchId: string } }>(
    '/batches/:batchId',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.id
      const { batchId } = (request.params as any) as { batchId: string }

      const batch = await importsService.getImportBatch(batchId, userId)
      return reply.send(batch)
    }
  )

  /**
   * POST /imports/batches/:batchId/transactions
   * Add an imported transaction to batch
   */
  app.post<{
    Params: { batchId: string }
    Body: z.infer<typeof addImportedTransactionSchema>
  }>(
    '/batches/:batchId/transactions',
    { preHandler: requireOrigin },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.id
      const { batchId } = (request.params as any) as { batchId: string }
      const input = addImportedTransactionSchema.parse(request.body)

      const txn = await importsService.addImportedTransaction(batchId, userId, {
        dedupKey: input.dedupKey,
        provider: input.provider,
        providerTransactionId: input.providerTransactionId,
        title: input.title,
        description: input.description,
        amountMinor: BigInt(input.amountMinor),
        occurredOn: new Date(`${input.occurredOn}T00:00:00Z`),
        currencyCode: input.currencyCode,
        merchantName: input.merchantName,
      })

      return reply.code(201).send({
        ...txn,
        amountMinor: Number(txn.amountMinor),
      })
    }
  )

  /**
   * GET /imports/batches/:batchId/transactions
   * List imported transactions in batch
   */
  app.get<{ Params: { batchId: string }; Querystring: { status?: string; limit?: string; offset?: string } }>(
    '/batches/:batchId/transactions',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.id
      const { batchId } = (request.params as any) as { batchId: string }
      const status = ((request.query as any).status as string | undefined) || undefined
      const limit = Math.min(parseInt((request.query as any).limit as string) || 100, 1000)
      const offset = Math.max(0, parseInt((request.query as any).offset as string) || 0)

      const service = new ImportsService(prisma, ledgerService)
      const txns = await service.repo.listImportedTransactions(batchId, userId, { status, limit, offset })

      if (txns === null) {
        return reply.code(404).send({
          error: {
            code: 'NOT_FOUND',
            message: 'Batch not found or unauthorized',
          },
        })
      }

      return reply.send(
        txns.map((txn) => ({
          ...txn,
          amountMinor: Number(txn.amountMinor),
        }))
      )
    }
  )

  /**
   * POST /imports/batches/:batchId/commit
   * Commit import batch to ledger
   */
  app.post<{
    Params: { batchId: string }
    Body: z.infer<typeof commitBatchSchema>
  }>(
    '/batches/:batchId/commit',
    { preHandler: requireOrigin },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.id
      const { batchId } = (request.params as any) as { batchId: string }
      const input = commitBatchSchema.parse(request.body)

      const result = await importsService.commitImportBatch(batchId, userId, input)
      return reply.send(result)
    }
  )

  /**
   * POST /imports/plaid/link-token
   * Create a Plaid link token for the user
   */
  app.post(
    '/plaid/link-token',
    { preHandler: requireOrigin },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.id

      try {
        const session = await bankProvider.createLinkSession(userId)
        await importsService.createPlaidLinkToken(userId, session.linkToken, session.expiresIn || 600)

        return reply.code(201).send({
          linkToken: session.linkToken,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return reply.code(503).send({
          error: {
            code: 'PLAID_UNAVAILABLE',
            message: `Failed to create Plaid link: ${message}`,
          },
        })
      }
    }
  )

  /**
   * POST /imports/plaid/exchange-token
   * Exchange public token for access token (callback from Plaid Link)
   */
  app.post<{
    Body: z.infer<typeof plaidExchangeTokenSchema>
  }>(
    '/plaid/exchange-token',
    { preHandler: requireOrigin },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.id
      const input = plaidExchangeTokenSchema.parse(request.body)

      try {
        // Verify link token exists and is valid
        const linkToken = await importsService.getPlaidLinkToken(input.linkToken)

        // Exchange public token
        const result = await bankProvider.exchangePublicToken(userId, input.publicToken)

        // TODO: Encrypt access token before storage
        // For Phase 11, we'll store it as-is (future: use user_id + server key for encryption)
        await importsService.createPlaidItem(
          userId,
          result.itemId,
          result.accessToken, // TODO: encrypt this
          result.accountIds,
          result.institutionName
        )

        // Delete link token (one-time use)
        await importsService.deletePlaidLinkToken(input.linkToken)

        return reply.code(201).send({
          itemId: result.itemId,
          accountIds: result.accountIds,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return reply.code(400).send({
          error: {
            code: 'PLAID_EXCHANGE_FAILED',
            message: `Failed to exchange token: ${message}`,
          },
        })
      }
    }
  )

  /**
   * GET /imports/plaid/items
   * List Plaid items for user
   */
  app.get(
    '/plaid/items',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.id
      const items = await importsService.listPlaidItems(userId)

      return reply.send(
        items.map((item) => ({
          id: item.id,
          itemId: item.itemId,
          institutionName: item.institutionName,
          accountIds: item.accountIds,
          status: item.status,
          lastSyncedAt: item.lastSyncedAt,
          createdAt: item.createdAt,
        }))
      )
    }
  )

  /**
   * POST /imports/plaid/webhook
   * Handle Plaid webhook events
   * TODO: Implement webhook processing (sync transactions, update status, etc.)
   */
  app.post(
    '/plaid/webhook',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const signature = request.headers['plaid-verification'] as string

      // Verify webhook signature
      const isValid = bankProvider.verifyWebhookSignature(JSON.stringify(request.body), signature || '')
      if (!isValid) {
        return reply.code(401).send({
          error: {
            code: 'INVALID_SIGNATURE',
            message: 'Webhook signature verification failed',
          },
        })
      }

      // TODO: Process webhook (sync new transactions, handle item updates, etc.)
      return reply.code(200).send({ ok: true })
    }
  )
}

export async function registerImportsRoutes(app: FastifyInstance, options: any) {
  await createImportsRoutes(app, options)
}
