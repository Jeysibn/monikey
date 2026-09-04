import { PrismaClient } from '@prisma/client'
import { GoalsRepository } from './goals.repository.js'
import type { GoalView, CreateGoalInput, UpdateGoalInput } from './goals.schemas.js'

export class GoalsService {
  constructor(private prisma: PrismaClient, private repo: GoalsRepository) {}

  async getGoal(userId: string, id: string): Promise<GoalView | null> {
    return this.repo.getGoal(userId, id)
  }

  async createGoal(userId: string, input: CreateGoalInput): Promise<GoalView> {
    return this.prisma.$transaction(async (tx) => {
      return this.repo.createGoal(tx as any, userId, input)
    })
  }

  async updateGoal(userId: string, id: string, input: UpdateGoalInput): Promise<GoalView> {
    return this.prisma.$transaction(async (tx) => {
      return this.repo.updateGoal(tx as any, userId, id, input)
    })
  }

  async deleteGoal(userId: string, id: string): Promise<void> {
    return this.prisma.$transaction(async (tx) => {
      return this.repo.deleteGoal(tx as any, userId, id)
    })
  }
}
