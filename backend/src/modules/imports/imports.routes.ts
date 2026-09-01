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
import { createReadStream } from 'fs'
import { pipeline } from 'stream/promises'
import { authGuard } from '../../common/auth/authGuard.js'
import { originCheckPreHandler } from '../../common/auth/originCheck.js'
import type { LedgerService } from '../ledger/ledger.service.js'
import { ImportsService } from './imports.service.js'
import type { Env } from '../../config/env.js'
import type { BankAggregationProvider } from '../../integrations/interfaces/bankDataProvider.js'
import { AppError } from '../../common/errors/appError.js'
import { createHash } from 'crypto'

/**
 * Convert a decimal amount (e.g., 19.99) to minor units (1999) using safe string parsing
 * to avoid floating-point precision errors. This handles cases like:
 * - 19.99 * 100 = 1998.9999... which would floor to 1998 (wrong)
 * - Using string parsing gives exactly 1999 (correct)
 */
function decimalToMinorUnits(amount: number): bigint {
  if (amount <= 0 || isNaN(amount)) return 0n

  // Convert to string and split on decimal point
  const parts = amount.toString().split('.')
  const wholePart = parts[0] || '0'
  const decimalPart = parts[1] || '00'

  // Pad or truncate decimal part to exactly 2 digits
  const centsPart = (decimalPart + '00').substring(0, 2)

  return BigInt(wholePart + centsPart)
}

const createImportBatchSchema = z.object({
  sourceType: z.enum(['plaid_sandbox', 'csv_manual']),
  plaidItemId: z.string().uuid().optional(),
})

// UUID validation for path parameters (D8: malformed UUID handling)
const batchIdParamSchema = z.object({ batchId: z.string().uuid('Invalid batch ID format') })

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
    env: Env
    appOrigin: string
  }
) {
  const { prisma, ledgerService, bankProvider, env, appOrigin } = options
  const importsService = new ImportsService(prisma, ledgerService, env)

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
      // D8: Validate UUID path parameter
      const { batchId } = batchIdParamSchema.parse((request.params as any) as { batchId: string })

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
      // D8: Validate UUID path parameter
      const { batchId } = batchIdParamSchema.parse((request.params as any) as { batchId: string })
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
      // D8: Validate UUID path parameter
      const { batchId } = batchIdParamSchema.parse((request.params as any) as { batchId: string })
      const status = ((request.query as any).status as string | undefined) || undefined
      const limit = Math.min(parseInt((request.query as any).limit as string) || 100, 1000)
      const offset = Math.max(0, parseInt((request.query as any).offset as string) || 0)

      const txns = await importsService.repo.listImportedTransactions(batchId, userId, { status, limit, offset })

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
      // D8: Validate UUID path parameter
      const { batchId } = batchIdParamSchema.parse((request.params as any) as { batchId: string })
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
   * Processes TRANSACTIONS_UPDATED and ITEM_ERROR webhooks
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

      try {
        const payload = request.body as any
        const webhookType = payload.webhook_type as string | undefined
        const itemId = payload.item_id as string | undefined

        if (!itemId) {
          return reply.code(400).send({
            error: {
              code: 'INVALID_PAYLOAD',
              message: 'Missing item_id in webhook payload',
            },
          })
        }

        // Handle TRANSACTIONS_UPDATED webhook
        if (webhookType === 'TRANSACTIONS_UPDATED') {
          try {
            // Get the Plaid item to find the user and access token
            const plaidItem = await importsService.repo.getPlaidItemByItemId(itemId)
            if (!plaidItem) {
              // Item not found in our database; silently succeed (best practice for webhooks)
              return reply.code(200).send({ ok: true })
            }

            // Decrypt access token
            const accessToken = await importsService.getDecryptedAccessToken(plaidItem.id, plaidItem.userId)

            // Sync transactions from provider
            const syncResult = await bankProvider.sync(plaidItem.userId, accessToken)

            // Create import batch for this sync
            const batch = await importsService.createImportBatch(
              plaidItem.userId,
              'plaid_sandbox',
              plaidItem.id
            )

            // Add each synced transaction to the batch
            for (const txn of syncResult.transactions || []) {
              try {
                await importsService.addImportedTransaction(batch.id, plaidItem.userId, {
                  dedupKey: txn.plaidTransactionId || `${txn.date}-${txn.name}-${txn.amount}`,
                  provider: 'plaid_sandbox',
                  providerTransactionId: txn.plaidTransactionId,
                  title: txn.name || 'Transaction',
                  description: txn.merchantName ? `${txn.merchantName}` : undefined,
                  amountMinor: decimalToMinorUnits(Math.abs(txn.amount || 0)),
                  occurredOn: new Date(`${txn.date}T00:00:00Z`),
                  currencyCode: 'PHP', // Plaid Sandbox is PHP-only for Phase 11
                  merchantName: txn.merchantName,
                })
              } catch (e) {
                // Log error but continue processing other transactions
                app.log.warn(`Failed to add transaction from webhook: ${e instanceof Error ? e.message : String(e)}`)
              }
            }

            // Update Plaid item sync timestamp
            await importsService.repo.updatePlaidItem(plaidItem.id, {
              lastSyncedAt: new Date(),
            })

            return reply.code(200).send({ ok: true })
          } catch (error) {
            app.log.error(`Webhook processing failed for TRANSACTIONS_UPDATED: ${error instanceof Error ? error.message : String(error)}`)
            // Still return 200 to prevent Plaid from retrying indefinitely
            return reply.code(200).send({ ok: true })
          }
        }

        // Handle ITEM_ERROR webhook
        if (webhookType === 'ITEM_ERROR') {
          try {
            const errorCode = payload.error?.error_code as string | undefined
            const errorMessage = payload.error?.error_message as string | undefined

            const plaidItem = await importsService.repo.getPlaidItemByItemId(itemId)
            if (plaidItem) {
              await importsService.repo.updatePlaidItem(plaidItem.id, {
                status: 'error',
                errorMessage: errorMessage || errorCode || 'Unknown error',
              })
            }

            return reply.code(200).send({ ok: true })
          } catch (error) {
            app.log.error(`Webhook processing failed for ITEM_ERROR: ${error instanceof Error ? error.message : String(error)}`)
            return reply.code(200).send({ ok: true })
          }
        }

        // Unknown webhook type; silently succeed
        return reply.code(200).send({ ok: true })
      } catch (error) {
        // Always return 200 for webhook success to prevent retries
        app.log.error(`Webhook handler exception: ${error instanceof Error ? error.message : String(error)}`)
        return reply.code(200).send({ ok: true })
      }
    }
  )

  /**
   * POST /imports/csv/upload
   * Upload and parse a CSV file for manual transaction import
   * Accepts multipart/form-data with a 'file' field
   * Creates an import batch and adds imported transactions for each row
   */
  app.post(
    '/csv/upload',
    { preHandler: requireOrigin },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.id

      try {
        // Use @fastify/multipart to extract file
        const data = await request.file()

        if (!data) {
          return reply.code(400).send({
            error: {
              code: 'MISSING_FILE',
              message: 'No file uploaded',
            },
          })
        }

        // Read file content
        const fileBuffer = await data.toBuffer()
        const fileName = data.filename

        if (fileBuffer.length > env.IMPORT_MAX_CSV_FILESIZE_BYTES) {
          return reply.code(413).send({
            error: {
              code: 'FILE_TOO_LARGE',
              message: `File exceeds maximum size of ${env.IMPORT_MAX_CSV_FILESIZE_BYTES} bytes`,
            },
          })
        }

        // Parse CSV content
        const csvContent = fileBuffer.toString('utf8')
        const lines = csvContent.trim().split('\n')

        if (lines.length < 2) {
          return reply.code(400).send({
            error: {
              code: 'INVALID_CSV',
              message: 'CSV must contain at least a header row and one data row',
            },
          })
        }

        // Parse header (first line)
        const headerLine = lines[0]!
        const headers = parseCSVLine(headerLine)
        const headerMap = new Map(headers.map((h, i) => [h.toLowerCase(), i]))

        // Validate required columns
        const requiredColumns = ['date', 'amount', 'description']
        for (const col of requiredColumns) {
          if (!headerMap.has(col)) {
            return reply.code(400).send({
              error: {
                code: 'MISSING_COLUMNS',
                message: `CSV must contain columns: ${requiredColumns.join(', ')}`,
              },
            })
          }
        }

        // Create import batch
        const batch = await importsService.createImportBatch(userId, 'csv_manual')

        const errors: Array<{ row: number; error: string }> = []
        let addedCount = 0
        let duplicateCount = 0

        // Process data rows
        for (let i = 1; i < lines.length; i++) {
          if (lines[i]!.trim().length === 0) continue // Skip empty lines

          try {
            const fields = parseCSVLine(lines[i]!)
            const date = fields[headerMap.get('date') || 0] || ''
            const amountStr = fields[headerMap.get('amount') || 0] || ''
            const description = fields[headerMap.get('description') || 0] || ''
            const merchant = fields[headerMap.get('merchant') || 0]

            // Validate date
            const dateObj = parseDate(date)
            if (isNaN(dateObj.getTime())) {
              errors.push({ row: i + 1, error: 'Invalid date format' })
              continue
            }

            // Validate amount
            const amountMinor = parseAmount(amountStr)
            if (amountMinor <= 0) {
              errors.push({ row: i + 1, error: 'Amount must be positive' })
              continue
            }

            if (!description || description.trim().length === 0) {
              errors.push({ row: i + 1, error: 'Description is required' })
              continue
            }

            // Create dedup key based on content
            const dedupKey = createHash('sha256')
              .update(`${date}|${amountStr}|${description}`)
              .digest('hex')

            // Add transaction to batch
            await importsService.addImportedTransaction(batch.id, userId, {
              dedupKey,
              provider: 'csv_manual',
              title: description.substring(0, 255),
              amountMinor,
              occurredOn: dateObj,
              currencyCode: 'PHP',
              merchantName: merchant,
            })

            addedCount++
          } catch (error) {
            if (error instanceof AppError && error.code === 'DUPLICATE_IMPORT') {
              // The global `(provider, dedup_key)` constraint deliberately
              // suppresses a replay. Do not claim that an unstaged row was
              // added; expose it separately so callers can distinguish a
              // successful new import from an idempotent duplicate upload.
              duplicateCount++
            } else {
              const msg = error instanceof Error ? error.message : String(error)
              errors.push({ row: i + 1, error: msg })
            }
          }
        }

        const allRowsWereDuplicates = addedCount === 0 && duplicateCount > 0 && errors.length === 0
        return reply.code(allRowsWereDuplicates ? 200 : 201).send({
          batchId: batch.id,
          fileName,
          totalRows: lines.length - 1, // Exclude header
          addedCount,
          duplicateCount,
          errors: errors.length > 0 ? errors : undefined,
          status: allRowsWereDuplicates ? 'duplicate' : 'reviewing',
          message: allRowsWereDuplicates
            ? 'CSV upload contained only transactions that were already imported.'
            : `CSV import created with ${addedCount} transactions${duplicateCount > 0 ? `; ${duplicateCount} duplicates skipped` : ''}. Please review and commit.`,
        })
      } catch (error) {
        app.log.error(`CSV upload error: ${error instanceof Error ? error.message : String(error)}`)
        return reply.code(500).send({
          error: {
            code: 'UPLOAD_FAILED',
            message: 'Failed to process CSV upload',
          },
        })
      }
    }
  )
}

/**
 * Parse a single CSV line, respecting quoted fields and escaped quotes.
 * Simple implementation: handles "field" and field, doesn't handle escaped quotes edge cases.
 */
function parseCSVLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      fields.push(current.trim().replace(/^"|"$/g, ''))
      current = ''
    } else {
      current += char
    }
  }

  fields.push(current.trim().replace(/^"|"$/g, ''))
  return fields
}

/**
 * Parse a date string in formats: YYYY-MM-DD, MM/DD/YYYY, or DD/MM/YYYY (inferred).
 */
function parseDate(dateStr: string): Date {
  const cleaned = dateStr.trim()

  // Try YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    return new Date(`${cleaned}T00:00:00Z`)
  }

  // Try MM/DD/YYYY or DD/MM/YYYY
  const parts = cleaned.split('/')
  if (parts.length === 3) {
    const [p0, p1, p2] = parts
    if (parseInt(p0!) > 12) {
      // Assume DD/MM/YYYY
      return new Date(`${p2!}-${p1!}-${p0!}T00:00:00Z`)
    } else {
      // Assume MM/DD/YYYY
      return new Date(`${p2!}-${p0!}-${p1!}T00:00:00Z`)
    }
  }

  // Invalid format
  return new Date(NaN)
}

/**
 * Parse an amount string (e.g., "123.45" or "123,45") into minor units (cents).
 * Handles various currency formats and uses safe conversion.
 * Returns 0 if parsing fails.
 */
function parseAmount(amountStr: string): bigint {
  if (!amountStr) return 0n

  // Remove whitespace and common currency symbols
  let cleaned = amountStr.trim().replace(/[$€¥₱\s]/g, '')

  // Handle comma as decimal separator (e.g., European format)
  if (cleaned.includes(',') && !cleaned.includes('.')) {
    cleaned = cleaned.replace(',', '.')
  }

  // Remove any remaining commas (thousands separator)
  cleaned = cleaned.replace(/,/g, '')

  try {
    const num = parseFloat(cleaned)
    if (isNaN(num) || num <= 0) return 0n
    return decimalToMinorUnits(num)
  } catch {
    return 0n
  }
}

export async function registerImportsRoutes(app: FastifyInstance, options: any) {
  await createImportsRoutes(app, options)
}
