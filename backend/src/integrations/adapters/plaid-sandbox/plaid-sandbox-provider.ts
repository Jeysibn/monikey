/**
 * Plaid Sandbox adapter for bank data integration.
 * Sandbox-only; production Philippine bank support is out of scope for Phase 11.
 *
 * Handles:
 * - Creating Plaid Link sessions
 * - Exchanging public tokens for access tokens
 * - Syncing transactions from linked accounts
 * - Webhook signature verification
 * - Access token revocation
 *
 * Access tokens are encrypted before storage via caller responsibility.
 */

import { createHmac } from 'crypto'
import type { BankAggregationProvider, LinkSession, ExchangeTokenResult, SyncResult } from '../../interfaces/bankDataProvider.js'
import { PlaidClient } from './plaid-client.js'

export class PlaidSandboxProvider implements BankAggregationProvider {
  private readonly client: PlaidClient
  private readonly webhookSecret?: string

  constructor(clientId: string, secret: string, webhookSecret?: string) {
    this.client = new PlaidClient(clientId, secret, 'sandbox')
    this.webhookSecret = webhookSecret
  }

  async createLinkSession(userId: string): Promise<LinkSession> {
    try {
      const response = await this.client.createLinkToken(userId)
      return {
        linkToken: response.link_token,
        expiresIn: Math.floor(new Date(response.expiration).getTime() / 1000),
      }
    } catch (error) {
      throw new Error(`Failed to create Plaid link session: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async exchangePublicToken(userId: string, publicToken: string): Promise<ExchangeTokenResult> {
    try {
      const response = await this.client.exchangePublicToken(publicToken)

      // Fetch accounts to get account IDs and institution info
      const accountsResponse = await this.client.getAccounts(response.access_token)

      return {
        itemId: response.item_id,
        accessToken: response.access_token, // Caller must encrypt this before storage
        institutionName: accountsResponse.item.institution_id || undefined,
        accountIds: accountsResponse.accounts.map((a) => a.account_id),
      }
    } catch (error) {
      throw new Error(`Failed to exchange Plaid public token: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async sync(userId: string, accessToken: string, cursor?: string): Promise<SyncResult> {
    try {
      // Get accounts
      const accountsResponse = await this.client.getAccounts(accessToken)

      // Get transactions using sync endpoint
      const endDate = new Date().toISOString().split('T')[0] || '2000-01-01'
      const opts = cursor ? { cursor } : undefined
      const transactionsResponse = await this.client.getTransactions(
        accessToken,
        '2000-01-01',
        endDate,
        opts
      )

      return {
        accounts: accountsResponse.accounts.map((account) => ({
          plaidAccountId: account.account_id,
          name: account.name,
          type: account.type,
          subtype: account.subtype,
          balanceMinor:
            account.balances.current != null ? BigInt(Math.round(account.balances.current * 100)) : undefined,
          currencyCode: account.balances.iso_currency_code || 'USD',
        })),
        transactions: transactionsResponse.transactions.map((txn) => ({
          plaidTransactionId: txn.transaction_id,
          name: txn.name,
          amount: txn.amount,
          date: txn.date,
          merchantName: txn.merchant_name,
          category: txn.category,
          accountId: txn.account_id,
          pending: txn.pending,
        })),
      }
    } catch (error) {
      throw new Error(`Failed to sync Plaid transactions: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  verifyWebhookSignature(payload: string | Buffer, signature: string): boolean {
    if (!this.webhookSecret) {
      // No secret configured; webhook verification is disabled
      return true
    }

    const payloadStr = typeof payload === 'string' ? payload : payload.toString('utf-8')
    const expectedSignature = createHmac('sha256', this.webhookSecret)
      .update(payloadStr)
      .digest('hex')

    return expectedSignature === signature
  }

  async revokeAccessToken(userId: string, accessToken: string): Promise<void> {
    try {
      await this.client.revokeAccessToken(accessToken)
    } catch (error) {
      throw new Error(`Failed to revoke Plaid access token: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

export function createPlaidSandboxProvider(
  clientId: string,
  secret: string,
  webhookSecret?: string
): BankAggregationProvider {
  return new PlaidSandboxProvider(clientId, secret, webhookSecret)
}
