import { PrismaClient } from '@prisma/client'
import type { GoalView, CreateGoalInput, UpdateGoalInput } from './goals.schemas.js'
import { AppError } from '../../common/errors/appError.js'

type PrismaTx = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>

export class GoalsRepository {
  constructor(private prisma: PrismaClient) {}

  async getGoal(userId: string, id: string): Promise<GoalView | null> {
    const goal = await this.prisma.goal.findFirst({
      where: { id, userId },
    })
    return goal ? this.mapGoal(goal) : null
  }

  async createGoal(tx: PrismaTx, userId: string, input: CreateGoalInput): Promise<GoalView> {
    const goal = await tx.goal.create({
      data: {
        userId,
        name: input.name,
        targetMinor: BigInt(input.targetMinor),
        currencyCode: input.currencyCode,
        targetDate: new Date(`${input.targetDate}T00:00:00Z`),
        monthlyContributionMinor: input.monthlyContributionMinor == null ? null : BigInt(input.monthlyContributionMinor),
        status: 'just_started',
        active: true,
      },
    })
    return this.mapGoal(goal)
  }

  async updateGoal(tx: PrismaTx, userId: string, id: string, input: UpdateGoalInput): Promise<GoalView> {
    const goal = await tx.goal.findFirst({ where: { id, userId } })
    if (!goal) throw new AppError('UNKNOWN_GOAL', 'Goal not found.', { field: 'id' })

    const updated = await tx.goal.update({
      where: { id },
      data: {
        name: input.name,
        targetMinor: input.targetMinor == null ? undefined : BigInt(input.targetMinor),
        targetDate: input.targetDate == null ? undefined : new Date(`${input.targetDate}T00:00:00Z`),
        monthlyContributionMinor: input.monthlyContributionMinor === undefined ? undefined : (input.monthlyContributionMinor == null ? null : BigInt(input.monthlyContributionMinor)),
      },
    })

    return this.mapGoal(updated)
  }

  async deleteGoal(tx: PrismaTx, userId: string, id: string): Promise<void> {
    const goal = await tx.goal.findFirst({ where: { id, userId } })
    if (!goal) throw new AppError('UNKNOWN_GOAL', 'Goal not found.', { field: 'id' })

    await tx.goal.delete({
      where: { id },
    })
  }

  private mapGoal(goal: any): GoalView {
    return {
      id: goal.id,
      userId: goal.userId,
      name: goal.name,
      targetMinor: Number(goal.targetMinor),
      currentMinor: Number(goal.currentMinor),
      currencyCode: goal.currencyCode,
      targetDate: goal.targetDate.toISOString().slice(0, 10),
      completedDate: goal.completedDate ? goal.completedDate.toISOString().slice(0, 10) : null,
      monthlyContributionMinor: goal.monthlyContributionMinor == null ? null : Number(goal.monthlyContributionMinor),
      status: goal.status,
      active: goal.active,
      createdAt: goal.createdAt.toISOString(),
      updatedAt: goal.updatedAt.toISOString(),
    }
  }
}
