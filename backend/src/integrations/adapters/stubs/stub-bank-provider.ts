/**
 * Stub bank aggregation provider for testing and CI.
 * Deterministic, zero network calls, no API keys required.
 * Implements consistent test data for import flow validation.
 */

import type {
  BankAggregationProvider,
  LinkSession,
  ExchangeTokenResult,
  PlaidWebhookEvent,
  SyncResult,
  ImportedTransactionData,
} from '../../interfaces/bankDataProvider.js'

const STUB_LINK_TOKEN_PREFIX = 'link_test_'
const STUB_ACCESS_TOKEN_PREFIX = 'access_test_'
const STUB_ACCOUNT_ID = 'acct_test_123456'

export class StubBankProvider implements BankAggregationProvider {
  constructor() {
    // No-op constructor
  }

  async createLinkSession(userId: string): Promise<LinkSession> {
    const linkToken = `${STUB_LINK_TOKEN_PREFIX}${userId.substring(0, 8)}_${Date.now()}`
    return {
      linkToken,
      expiresIn: 600, // 10 minutes
    }
  }

  async exchangePublicToken(userId: string, publicToken: string): Promise<ExchangeTokenResult> {
    // In stub mode, any public token is valid
    const accessToken = `${STUB_ACCESS_TOKEN_PREFIX}${userId.substring(0, 8)}_${Date.now()}`

    return {
      itemId: `item_stub_${userId.substring(0, 8)}`,
      accessToken,
      institutionName: 'Stub Bank',
      accountIds: [STUB_ACCOUNT_ID],
    }
  }

  async sync(userId: string, accessToken: string, cursor?: string): Promise<SyncResult> {
    // Return deterministic test data
    return {
      accounts: [
        {
          plaidAccountId: STUB_ACCOUNT_ID,
          name: 'Stub Checking Account',
          type: 'checking',
          balanceMinor: 500000n, // PHP 5,000 in minor units
          currencyCode: 'PHP',
        },
      ],
      transactions: [
        {
          plaidTransactionId: `txn_stub_${Date.now()}_1`,
          name: 'Stub Coffee Shop',
          amount: 150.5,
          date: new Date().toISOString().split('T')[0],
          merchantName: 'Stub Coffee',
          category: ['Food and Drink'],
          accountId: STUB_ACCOUNT_ID,
          pending: false,
        },
        {
          plaidTransactionId: `txn_stub_${Date.now()}_2`,
          name: 'Stub Salary',
          amount: 50000,
          date: new Date().toISOString().split('T')[0],
          merchantName: 'Employer',
          category: ['Transfer'],
          accountId: STUB_ACCOUNT_ID,
          pending: false,
        },
      ] as ImportedTransactionData[],
    }
  }

  verifyWebhookSignature(payload: string | Buffer, signature: string): boolean {
    // Stub always verifies signatures as valid (for testing)
    return true
  }

  async revokeAccessToken(userId: string, accessToken: string): Promise<void> {
    // Stub no-op
    return
  }
}

export function createStubBankProvider(): BankAggregationProvider {
  return new StubBankProvider()
}
