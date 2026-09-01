/**
 * Direct test of AI insights service with stub adapter
 * Verifies that stub responses conform to Zod schemas
 */

import { PrismaClient } from '@prisma/client'
import { StubAiAdapter } from './src/integrations/adapters/gemini/stub.adapter.js'
import { InsightsService } from './src/modules/insights/insights.service.js'
import {
  monthSummaryInsightSchema,
  budgetAnalysisSchema,
  transactionCategorizationSchema,
} from './src/modules/insights/schemas.js'
import pino from 'pino'

const prisma = new PrismaClient()
const logger = pino()

async function runTests() {
  try {
    const aiAdapter = new StubAiAdapter()
    const service = new InsightsService({
      aiProvider: aiAdapter,
      prisma,
      logger,
      maxCallsPerDay: 10,
      maxCallsPerMonth: 100,
    })

    // Get or create test user
    const userId = '00000000-0000-4000-8000-000000000010'
    let user = await prisma.user.findUnique({ where: { id: userId } })

    if (!user) {
      console.log('Creating test user...')
      user = await prisma.user.create({
        data: {
          id: userId,
          email: 'test@stub-adapter.local',
          passwordHash: 'test',
          displayName: 'Stub Adapter Test',
        },
      })
    }

    const prefs = await prisma.userPreferences.findUnique({ where: { userId } })
    if (!prefs) {
      await prisma.userPreferences.create({
        data: { userId, externalAiEnabled: true },
      })
    } else if (!prefs.externalAiEnabled) {
      await prisma.userPreferences.update({
        where: { userId },
        data: { externalAiEnabled: true },
      })
    }

    console.log('\n=== Testing AI Insights with Stub Adapter ===\n')

    // Test 1: Monthly Summary
    console.log('Test 1: generateMonthlySummary')
    console.log('---------------------------------------')
    try {
      const summary = await service.generateMonthlySummary(
        userId,
        { externalAiEnabled: true, detailedAiContextEnabled: false },
        new Date('2026-08-01'),
        new Date('2026-08-31'),
      )

      // Validate against schema
      const validated = monthSummaryInsightSchema.parse(summary)
      console.log('✓ Response conforms to schema')
      console.log('  Summary:', validated.summary)
      console.log('  Income:', validated.income)
      console.log('  Expenses:', validated.expenses)
      console.log('  NetCashFlow:', validated.netCashFlow)
      console.log('  Recommendations:', validated.recommendations)
    } catch (error) {
      console.error('✗ Test failed:', error instanceof Error ? error.message : error)
    }

    // Test 2: Budget Analysis
    console.log('\nTest 2: analyzeBudget')
    console.log('---------------------------------------')
    try {
      const analysis = await service.analyzeBudget(
        userId,
        { externalAiEnabled: true, detailedAiContextEnabled: false },
        new Date('2026-08-01'),
        new Date('2026-08-31'),
      )

      // Validate against schema
      const validated = budgetAnalysisSchema.parse(analysis)
      console.log('✓ Response conforms to schema')
      console.log('  Summary:', validated.summary)
      console.log('  PercentageUsed:', validated.percentageUsed)
      console.log('  OnTrack:', validated.onTrack)
      console.log('  Recommendations:', validated.recommendations)
    } catch (error) {
      console.error('✗ Test failed:', error instanceof Error ? error.message : error)
    }

    // Test 3: Transaction Categorization
    console.log('\nTest 3: categorizeDraftTransaction')
    console.log('---------------------------------------')
    try {
      // Create a test category
      let category = await prisma.category.findFirst({
        where: { userId },
      })

      if (!category) {
        category = await prisma.category.create({
          data: {
            userId,
            name: 'Food & Dining',
            color: '#FF0000',
            budgetable: true,
            allowsExpense: true,
            allowsIncome: false,
          },
        })
      }

      const categorization = await service.categorizeDraftTransaction(
        userId,
        { externalAiEnabled: true },
        'Lunch at Pizza Place',
        [category],
      )

      // Validate against schema
      const validated = transactionCategorizationSchema.parse(categorization)
      console.log('✓ Response conforms to schema')
      console.log('  SuggestedCategory:', validated.suggestedCategory)
      console.log('  Confidence:', validated.confidence)
      console.log('  Reasoning:', validated.reasoning)
      console.log('  Alternatives:', validated.alternativeCategories)
    } catch (error) {
      console.error('✗ Test failed:', error instanceof Error ? error.message : error)
    }

    console.log('\n=== All Tests Complete ===\n')
  } finally {
    await prisma.$disconnect()
  }
}

runTests().catch(console.error)
