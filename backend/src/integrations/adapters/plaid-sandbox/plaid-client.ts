/**
 * Plaid API client for sandbox environment.
 * Low-level HTTP client for communicating with Plaid's API.
 * Sandbox-only; production Philippine bank support is out of scope for Phase 11.
 */

export interface PlaidErrorResponse {
  error_type: string
  error_code: string
  error_message: string
  display_message?: string
  request_id?: string
}

export interface PlaidLinkTokenResponse {
  link_token: string
  expiration: string // ISO 8601 timestamp
  request_id: string
}

export interface PlaidExchangeTokenResponse {
  access_token: string
  item_id: string
  request_id: string
}

export interface PlaidAccount {
  account_id: string
  name: string
  mask: string
  type: string
  subtype?: string
  balances: {
    available?: number | null
    current: number
    iso_currency_code?: string
    limit?: number | null
  }
}

export interface PlaidTransaction {
  transaction_id: string
  account_id: string
  name: string
  merchant_name?: string
  amount: number
  currency_code?: string
  date: string // YYYY-MM-DD
  category?: string[]
  pending: boolean
}

export interface PlaidAccountsResponse {
  accounts: PlaidAccount[]
  item: {
    item_id: string
    institution_id: string
  }
  request_id: string
}

export interface PlaidTransactionsResponse {
  transactions: PlaidTransaction[]
  total_transactions: number
  request_id: string
}

export class PlaidClient {
  private readonly clientId: string
  private readonly secret: string
  private readonly baseUrl: string

  constructor(clientId: string, secret: string, environment: 'sandbox' | 'development' | 'production' = 'sandbox') {
    this.clientId = clientId
    this.secret = secret

    // Map environment to Plaid API endpoint
    switch (environment) {
      case 'sandbox':
        this.baseUrl = 'https://sandbox.plaid.com'
        break
      case 'development':
        this.baseUrl = 'https://development.plaid.com'
        break
      case 'production':
        this.baseUrl = 'https://production.plaid.com'
        break
      default:
        this.baseUrl = 'https://sandbox.plaid.com'
    }
  }

  async createLinkToken(userId: string): Promise<PlaidLinkTokenResponse> {
    return this.post('/link/token/create', {
      user: { client_user_id: userId },
      client_name: 'Monikey Finance',
      language: 'en',
      products: ['transactions'],
      country_codes: ['US'],
    })
  }

  async exchangePublicToken(publicToken: string): Promise<PlaidExchangeTokenResponse> {
    return this.post('/item/public_token/exchange', {
      public_token: publicToken,
    })
  }

  async getAccounts(accessToken: string): Promise<PlaidAccountsResponse> {
    return this.post('/accounts/get', {
      access_token: accessToken,
    })
  }

  async getTransactions(
    accessToken: string,
    startDate: string,
    endDate: string,
    options?: { cursor?: string }
  ): Promise<PlaidTransactionsResponse> {
    return this.post('/transactions/sync', {
      access_token: accessToken,
      cursor: options?.cursor,
    })
  }

  async revokeAccessToken(accessToken: string): Promise<{ request_id: string }> {
    return this.post('/item/remove', {
      access_token: accessToken,
    })
  }

  private async post<T>(path: string, body: Record<string, any>): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: this.clientId,
        secret: this.secret,
        ...body,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      const error = data as PlaidErrorResponse
      throw new Error(`Plaid API error: ${error.error_code} - ${error.error_message}`)
    }

    return data as T
  }
}
