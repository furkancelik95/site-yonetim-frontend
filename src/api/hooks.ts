import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, get, newIdempotencyKey } from "./client";
import { useSite } from "../site/SiteContext";
import { useToast } from "../components/toast";
import type { Written } from "./types";

type Query = Record<string, string | number | boolean | null | undefined>;

/** Sitenin altındaki bir kaynağı okur: useSiteGet<T>("/debtors", { page }) → /sites/{slug}/debtors */
export function useSiteGet<T>(path: string, query?: Query, opts?: { enabled?: boolean }) {
  const { site } = useSite();
  return useQuery({
    queryKey: ["site", site.slug, path, query ?? {}],
    queryFn: ({ signal }) => get<T>(`/sites/${site.slug}${path}`, query, signal),
    placeholderData: keepPreviousData,
    enabled: opts?.enabled,
  });
}

/**
 * Siteye yazan işlem. Başarıda backend'in Türkçe mesajı bildirim olarak gösterilir ve sitenin
 * önbelleği tazelenir (bakiye, pano, liste birlikte güncellensin). `money: true` → Idempotency-Key.
 */
export function useSiteMutation<TBody, TOut>(
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  path: string | ((vars: TBody) => string),
  opts?: { money?: boolean; form?: boolean; onSuccess?: (data: TOut) => void },
) {
  const { site } = useSite();
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: async (vars: TBody) => {
      const p = typeof path === "function" ? path(vars) : path;
      return api<Written<TOut>>(method, `/sites/${site.slug}${p}`, {
        // DELETE'te değişken yalnız adresi kurmak içindir, gövde gönderilmez
        body: opts?.form || method === "DELETE" ? undefined : vars,
        form: opts?.form ? (vars as unknown as FormData) : undefined,
        idempotencyKey: opts?.money ? newIdempotencyKey() : undefined,
      });
    },
    onSuccess: (res) => {
      if (res?.message) toast(res.message);
      qc.invalidateQueries({ queryKey: ["site", site.slug] });
      opts?.onSuccess?.(res?.data);
    },
  });
}
