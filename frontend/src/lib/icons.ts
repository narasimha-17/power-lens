import { DollarSign, Package, TrendingUp, type LucideIcon } from 'lucide-react'

const CURRENCY_KEYWORDS = ['revenue', 'price', 'cost', 'amount', 'sales', 'profit', 'income', 'value']
const COUNT_KEYWORDS = ['unit', 'qty', 'quantity', 'count', 'orders']

export function pickKpiIcon(field: string): LucideIcon {
  const lower = field.toLowerCase()
  if (CURRENCY_KEYWORDS.some((k) => lower.includes(k))) return DollarSign
  if (COUNT_KEYWORDS.some((k) => lower.includes(k))) return Package
  return TrendingUp
}
