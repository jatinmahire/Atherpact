/**
 * Shared resource-category -> icon/label mapping. Used everywhere a
 * listing's category needs a visual treatment, instead of each page
 * repeating its own emoji glyph.
 */
import { Landmark, ChefHat, Mic, Truck, Building2, Package, type LucideIcon } from 'lucide-react'

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  banquet_hall: Landmark,
  commercial_kitchen: ChefHat,
  av_equipment: Mic,
  transportation: Truck,
  event_space: Building2,
  other: Package,
}

export const CATEGORY_LABELS: Record<string, string> = {
  banquet_hall: 'Banquet Hall',
  commercial_kitchen: 'Commercial Kitchen',
  av_equipment: 'AV Equipment',
  transportation: 'Transportation',
  event_space: 'Event Space',
  other: 'Other',
}

export function CategoryIcon({ category, size = 12, className = '' }: { category: string; size?: number; className?: string }) {
  const Icon = CATEGORY_ICONS[category] ?? Package
  return <Icon size={size} className={className} />
}
