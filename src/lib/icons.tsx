import type { ComponentType, SVGProps } from "react";
import {
  ArrowUpDown,
  Building2,
  Droplets,
  Flame,
  ShieldCheck,
  Sparkles,
  Trees,
  Wrench,
  Zap,
} from "lucide-react";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

/** Talep kategorisi → ikon (lib/labels CATEGORIES ile aynı anahtarlar). Dekoratif; metin yanında yazılır. */
const CATEGORY_ICON: Record<string, Icon> = {
  plumbing: Droplets,
  electrical: Zap,
  elevator: ArrowUpDown,
  heating: Flame,
  cleaning: Sparkles,
  security: ShieldCheck,
  garden: Trees,
  common_area: Building2,
  other: Wrench,
};

export function categoryIcon(category: string | null | undefined): Icon {
  return (category && CATEGORY_ICON[category]) || Wrench;
}
