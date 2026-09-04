/**
 * BankAggregationProvider interface.
 *
 * Defines the contract for bank/financial-data integrations.
 * Implementations can be:
 * - PlaidSandboxAdapter: Plaid's sandbox environment for testing
 * - StubBankAdapter: Deterministic stub for CI/testing (zero network calls)
 * - Future: Production-grade regional aggregators (not Phase 11 scope)
 *
 * Phase 11 scope: Sandbox-only Plaid + manual CSV import foundation.
 * No claim is made that Philippine banks/e-wallets are supported through Plaid.
 */

export interface LinkSession {
  linkToken: string
  expiresIn?: number
}

export interface ExchangeTokenResult {
  itemId: string
  accessToken: string // Must be encrypted at rest by caller
  institutionName?: string
  accountIds: string[] // Plaid account IDs linked to this item
}

export interface PlaidWebhookEvent {
  webhookCode: string
  itemId: string
  userId?: string
  transactionIds?: string[]
  newTransactions?: number
  removedTransactions?: string[]
  modifiedTransactions?: string[]
  error?: {
    errorCode: string
    errorMessage: string
  }
}

export interface ImportedAccount {
  plaidAccountId: string
  name: string
  type: string // e.g., "checking", "savings", "credit_card"
  subtype?: string
  balanceMinor?: bigint
  currencyCode?: string
}

export interface ImportedTransactionData {
  plaidTransactionId: string
  name: string // Merchant/description
  amount: number // Major units (e.g., 100.50 for PHP 100.50)
  date: string // ISO date YYYY-MM-DD
  merchantName?: string
  category?: string[]
  accountId: string // Which Plaid account this txn belongs to
  pending?: boolean
}

export interface SyncResult {
  accounts: ImportedAccount[]
  transactions: ImportedTransactionData[]
  removed?: string[] // Plaid transaction IDs that were removed
  modified?: string[] // Plaid transaction IDs that were updated
}

/**
 * BankAggregationProvider interface.
 * Implementations must be entirely user-scoped — never use cached access tokens or account IDs across users.
 */
export interface BankAggregationProvider {
  /**
   * Create a Plaid Link session for the user to connect their bank.
   * Returns a link token that can be exchanged for an access token on the frontend.
   *
   * @param userId - The authenticated user's ID (for audit/scope only; never stored in the token)
   * @returns LinkSession with link token and expiry
   * @throws Error on network failure or provider unavailable
   */
  createLinkSession(userId: string): Promise<LinkSession>

  /**
   * Exchange a public token from Plaid Link for an access token.
   * Returns encrypted access token + account metadata.
   * Access token storage and encryption is the responsibility of the caller.
   *
   * @param userId - The authenticated user's ID
   * @param publicToken - Token returned by Plaid Link flow on the client
   * @returns ExchangeTokenResult with access token (must be encrypted before storage)
   * @throws Error on network failure or invalid public token
   */
  exchangePublicToken(userId: string, publicToken: string): Promise<ExchangeTokenResult>

  /**
   * Sync latest transactions from a connected account.
   * Fetches accounts and transactions since the last sync.
   * For Plaid, uses the access token to fetch the latest state.
   *
   * @param userId - The authenticated user's ID
   * @param accessToken - The (previously encrypted) access token for this connection
   * @param cursor - Optional cursor for delta sync (Plaid transaction cursor)
   * @returns SyncResult with accounts and transactions
   * @throws Error on network failure, invalid token, or provider error
   */
  sync(userId: string, accessToken: string, cursor?: string): Promise<SyncResult>

  /**
   * Verify a webhook signature from the provider (e.g., Plaid webhook).
   * Used to ensure webhook events are authentic.
   *
   * @param payload - Raw request body as string/buffer
   * @param signature - The signature header value from the provider
   * @returns true if signature is valid, false otherwise
   */
  verifyWebhookSignature(payload: string | Buffer, signature: string): boolean

  /**
   * Revoke an access token (when user disconnects a linked account).
   * Optional for stubbed implementations.
   *
   * @param userId - The authenticated user's ID
   * @param accessToken - The access token to revoke
   * @throws Error on network failure or already-revoked token
   */
  revokeAccessToken(userId: string, accessToken: string): Promise<void>
}
