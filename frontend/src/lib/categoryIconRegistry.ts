import {
  BookOpen,
  BriefcaseBusiness,
  CarFront,
  Gamepad2,
  Gift,
  GraduationCap,
  HeartPulse,
  House,
  PiggyBank,
  ShoppingBag,
  ShoppingBasket,
  Utensils,
  type LucideIcon,
} from 'lucide-react'

export const CATEGORY_ICON_OPTIONS = {
  'shopping-basket': { label: 'Groceries', Icon: ShoppingBasket },
  utensils: { label: 'Dining', Icon: Utensils },
  'car-front': { label: 'Car', Icon: CarFront },
  house: { label: 'Housing', Icon: House },
  'briefcase-business': { label: 'Work', Icon: BriefcaseBusiness },
  'graduation-cap': { label: 'Education', Icon: GraduationCap },
  'heart-pulse': { label: 'Healthcare', Icon: HeartPulse },
  'gamepad-2': { label: 'Entertainment', Icon: Gamepad2 },
  'book-open': { label: 'Books', Icon: BookOpen },
  'shopping-bag': { label: 'Shopping', Icon: ShoppingBag },
  gift: { label: 'Gifts', Icon: Gift },
  'piggy-bank': { label: 'Savings', Icon: PiggyBank },
} as const satisfies Record<string, { label: string; Icon: LucideIcon }>

export type CategoryIconKey = keyof typeof CATEGORY_ICON_OPTIONS

export function isCategoryIconKey(value: unknown): value is CategoryIconKey {
  return typeof value === 'string' && Object.hasOwn(CATEGORY_ICON_OPTIONS, value)
}
