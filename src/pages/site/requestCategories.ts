import { useSiteGet } from "../../api/hooks";
import type { Schemas } from "../../api/types";
import { requestCategory } from "../../lib/labels";

export type RequestCategory = Schemas["RequestCategoryOut"];

/** Site tanımlı talep kategorileri (HIZ-03, D-26): GET /request-categories. `active` → yalnız kullanımdakiler. */
export function useRequestCategories(active = false): RequestCategory[] {
  const q = useSiteGet<RequestCategory[]>("/request-categories", active ? { active: true } : undefined);
  return q.data ?? [];
}

/** Anahtar → ad (kategori listesi yüklenmediyse varsayılan adlar). */
export function categoryName(list: RequestCategory[], key: string): string {
  return list.find((c) => c.key === key)?.name ?? requestCategory(key);
}
