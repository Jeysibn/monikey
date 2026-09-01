/**
 * Live API test for D9 Security Defect Fix
 * Tests cross-user isolation in budget allocations
 */

import type { FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'
import { buildApp } from './src/app.js'
import { loadEnv } from './src/config/env.js'
import { randomUUID } from 'node:crypto'

const databaseUrl = process.env.DATABASE_URL || 'postgresql://monikey:test-password@db:5432/monikey'

async function runTest() {
  const env = loadEnv({
    DATABASE_URL: databaseUrl,
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    APP_ORIGIN: 'http://localhost:8080',
    SESSION_SECURE: 'false',
    OCR_PROVIDER: 'stub',
    OBJECT_STORE: 'filesystem',
    RECEIPT_STORAGE_PATH: '/tmp/qa-receipts',
  })

  const prisma = new PrismaClient({ datasourceUrl: databaseUrl })
  const app = await buildApp({ env, prisma })

  function extractSessionCookie(res: any): string | undefined {
    const cookie = res.cookies?.find((c: any) => c.name === 'monikey_session')
    return cookie ? `${cookie.name}=${cookie.value}` : undefined
  }

  try {
    console.log('D9 Security Test: Cross-user isolation in budget allocations\n')

    // Setup users
    const alice_email = `alice-d9-${randomUUID()}@test.local`
    const bob_email = `bob-d9-${randomUUID()}@test.local`

    console.log('1. Registering users...')
    const aliceReg = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { origin: env.APP_ORIGIN },
      payload: { email: alice_email, password: 'password-123', displayName: 'Alice' },
    })
    const alice_cookie = extractSessionCookie(aliceReg)
    const alice_id = aliceReg.json().user.id
    console.log(`   Alice registered: ${alice_id}`)

    const bobReg = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { origin: env.APP_ORIGIN },
      payload: { email: bob_email, password: 'password-123', displayName: 'Bob' },
    })
    const bob_cookie = extractSessionCookie(bobReg)
    const bob_id = bobReg.json().user.id
    console.log(`   Bob registered: ${bob_id}\n`)

    // Create Alice's private category
    console.log('2. Creating Alice\'s private category...')
    const aliceCreateCat = await app.inject({
      method: 'POST',
      url: '/api/v1/budget/categories',
      headers: { origin: env.APP_ORIGIN, cookie: alice_cookie },
      payload: { name: 'Alice Private Category', color: '#FF0000', budgetable: true, allowsExpense: true },
    })
    const alice_category_id = aliceCreateCat.json().id
    console.log(`   Alice's category: ${alice_category_id}`)
    console.log(`   Status: ${aliceCreateCat.statusCode}\n`)

    // Create Alice's budget period
    console.log('3. Creating Alice\'s budget period...')
    const aliceBudget = await app.inject({
      method: 'POST',
      url: '/api/v1/budget/budgets',
      headers: { origin: env.APP_ORIGIN, cookie: alice_cookie },
      payload: {
        periodStart: '2026-09-01',
        periodEnd: '2026-09-30',
        incomePoolMinor: 0,
      },
    })
    const alice_period_id = aliceBudget.json().id
    console.log(`   Alice's budget period: ${alice_period_id}`)
    console.log(`   Status: ${aliceBudget.statusCode}\n`)

    // Create Bob's budget period
    console.log('4. Creating Bob\'s budget period...')
    const bobBudget = await app.inject({
      method: 'POST',
      url: '/api/v1/budget/budgets',
      headers: { origin: env.APP_ORIGIN, cookie: bob_cookie },
      payload: {
        periodStart: '2026-09-01',
        periodEnd: '2026-09-30',
        incomePoolMinor: 0,
      },
    })
    const bob_period_id = bobBudget.json().id
    console.log(`   Bob's budget period: ${bob_period_id}`)
    console.log(`   Status: ${bobBudget.statusCode}\n`)

    // BEFORE FIX TEST: Bob attempts to allocate using Alice's private category
    console.log('5. [D9 SECURITY TEST] Bob attempts to allocate using Alice\'s private category...')
    const bobAllocateAliceCat = await app.inject({
      method: 'POST',
      url: `/api/v1/budget/budgets/${bob_period_id}/allocations`,
      headers: { origin: env.APP_ORIGIN, cookie: bob_cookie },
      payload: {
        categoryId: alice_category_id,
        allocatedMinor: 5000,
      },
    })

    console.log(`   Response status: ${bobAllocateAliceCat.statusCode}`)
    console.log(`   Response body:`, JSON.stringify(bobAllocateAliceCat.json(), null, 2))

    if (bobAllocateAliceCat.statusCode === 201) {
      console.log('\n   ❌ BUG STILL PRESENT: Bob was able to allocate using Alice\'s private category!')
      console.log('   Expected: 422 or 404, Got: 201')
      process.exitCode = 1
    } else if (bobAllocateAliceCat.statusCode === 422 || bobAllocateAliceCat.statusCode === 404) {
      console.log(`\n   ✅ FIX VERIFIED: Request correctly rejected with ${bobAllocateAliceCat.statusCode}`)
      const error = bobAllocateAliceCat.json().error
      if (error.code === 'UNKNOWN_CATEGORY') {
        console.log(`   Error code: ${error.code} (correct!)`)
      }
    } else {
      console.log(`\n   ⚠️  Unexpected status code: ${bobAllocateAliceCat.statusCode}`)
      process.exitCode = 1
    }

    console.log('\n6. [POSITIVE TEST] Bob can allocate using his own category...')
    // Create Bob's own category
    const bobCreateCat = await app.inject({
      method: 'POST',
      url: '/api/v1/budget/categories',
      headers: { origin: env.APP_ORIGIN, cookie: bob_cookie },
      payload: { name: 'Bob Private Category', color: '#00FF00', budgetable: true, allowsExpense: true },
    })
    const bob_category_id = bobCreateCat.json().id
    console.log(`   Bob's category: ${bob_category_id}`)

    // Bob allocates using his own category
    const bobAllocateOwnCat = await app.inject({
      method: 'POST',
      url: `/api/v1/budget/budgets/${bob_period_id}/allocations`,
      headers: { origin: env.APP_ORIGIN, cookie: bob_cookie },
      payload: {
        categoryId: bob_category_id,
        allocatedMinor: 5000,
      },
    })

    console.log(`   Response status: ${bobAllocateOwnCat.statusCode}`)
    if (bobAllocateOwnCat.statusCode === 201) {
      console.log('   ✅ Bob can allocate using his own category (correct!)')
    } else {
      console.log(`   ❌ Bob cannot allocate using his own category: ${bobAllocateOwnCat.statusCode}`)
      process.exitCode = 1
    }

    console.log('\n=== D9 FIX VERIFICATION COMPLETE ===')

  } finally {
    await app.close()
    await prisma.$disconnect()
  }
}

runTest().catch((err) => {
  console.error('Test error:', err)
  process.exit(1)
})
