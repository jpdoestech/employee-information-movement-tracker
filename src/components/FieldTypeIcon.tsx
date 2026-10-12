import {
  Type,
  AlignLeft,
  Hash,
  Calculator,
  CalendarDays,
  SquareCheck,
  List,
  Mail,
  Phone,
  Settings2,
  type LucideIcon,
} from "lucide-react";

export const fieldTypeIcons: Record<string, LucideIcon> = {
  short_text: Type,
  long_text: AlignLeft,
  integer: Hash,
  decimal: Calculator,
  date: CalendarDays,
  checkbox: SquareCheck,
  select: List,
  email: Mail,
  phone: Phone,
  system: Settings2,
};
export function FieldTypeIcon({
  type,
  size = 15,
}: {
  type: string;
  size?: number;
}) {
  const Icon = fieldTypeIcons[type] ?? Type;
  return <Icon size={size} aria-hidden="true" className="field-type-icon" />;
}
