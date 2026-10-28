import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, get, newIdempotencyKey } from "./client";
import { useSite } from "../site/SiteContext";
import { useToast } from "../components/toast";
import type { Written } from "./types";

type Query = Record<string, string | number | boolean | null | undefined | readonly string[]>;

/** Sitenin altındaki bir kaynağı okur: useSiteGet<T>("/debtors", { page }) → /sites/{slug}/debtors */
export function useSiteGet<T>(path: string, query?: Query, opts?: { enabled?: boolean; refetchInterval?: number }) {
  const { site } = useSite();
  return useQuery({
    queryKey: ["site", site.slug, path, query ?? {}],
    queryFn: ({ signal }) => get<T>(`/sites/${site.slug}${path}`, query, signal),
    placeholderData: keepPreviousData,
    enabled: opts?.enabled,
    refetchInterval: opts?.refetchInterval,
  });
}

/** Kişinin kendi hesabına ait kaynak (site dışı): useMeGet<T>("/sessions") → /me/sessions */
export function useMeGet<T>(path: string, query?: Query) {
  return useQuery({
    queryKey: ["me", path, query ?? {}],
    queryFn: ({ signal }) => get<T>(`/me${path}`, query, signal),
  });
}

/** Kişinin kendi hesabına yazan işlem; başarıda mesaj gösterilir ve hesap önbelleği tazelenir. */
export function useMeMutation<TBody, TOut>(method: "POST" | "PUT" | "DELETE", path: string | ((vars: TBody) => string)) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (vars: TBody) => {
      const p = typeof path === "function" ? path(vars) : path;
      return api<Written<TOut> | undefined>(method, `/me${p}`, { body: method === "DELETE" ? undefined : vars });
    },
    onSuccess: (res) => {
      if (res?.message) toast(res.message);
      qc.invalidateQueries({ queryKey: ["me"] });
    },
  });
}

/**
 * Onay kuralına takılan yazma işlemi (K21, docs/12): backend 202 ve
 * `{ status: "approval_pending", approval_request_id }` döner; işlem henüz yapılmamıştır.
 */
export interface ApprovalPending { status: "approval_pending"; approval_request_id: string | null; [k: string]: unknown }
export function isApprovalPending(data: unknown): data is ApprovalPending {
  return !!data && typeof data === "object" && (data as { status?: unknown }).status === "approval_pending";
}

/**
 * Siteye yazan işlem. Başarıda backend'in Türkçe mesajı bildirim olarak gösterilir ve sitenin
 * önbelleği tazelenir (bakiye, pano, liste birlikte güncellensin). `money: true` → Idempotency-Key.
 *
 * İşlem onaya düşerse (202 `approval_pending`) "onaya gönderildi" bildirimi gösterilir ve
 * `onPending` çağrılır; verilmemişse `onSuccess` veri olmadan (`undefined`) çağrılır — form kapanır,
 * ama kaydedilmiş bir nesne varmış gibi davranılmaz.
 */
export function useSiteMutation<TBody, TOut>(
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  path: string | ((vars: TBody) => string),
  opts?: { money?: boolean; form?: boolean; onSuccess?: (data: TOut) => void; onPending?: (data: ApprovalPending) => void },
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
      qc.invalidateQueries({ queryKey: ["site", site.slug] });
      const data: unknown = res?.data;
      if (isApprovalPending(data)) {
        toast(`${res?.message || "İşlem onaya gönderildi."} Durumunu Onaylar ekranından izleyebilirsiniz.`, "info");
        if (opts?.onPending) opts.onPending(data);
        else opts?.onSuccess?.(undefined as TOut);
        return;
      }
      if (res?.message) toast(res.message);
      opts?.onSuccess?.(res?.data);
    },
  });
}
