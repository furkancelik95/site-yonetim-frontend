import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";

/** Arama kutusu her tuşta istek atmasın. */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * Sayfa ve filtre adreste durur: geri dönünce aynı sayfa/filtre gelir, bağlantı paylaşılabilir.
 * Boş değerler adresten silinir; filtre değişince sayfa 1'e döner.
 */
export function useUrlState<K extends string>(defaults: Record<K, string>) {
  const [params, setParams] = useSearchParams();
  const state = Object.fromEntries(Object.entries(defaults).map(([k, d]) => [k, params.get(k) ?? d])) as Record<K, string>;
  function set(patch: Partial<Record<K, string>>) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch) as [K, string | undefined][]) {
          if (v === undefined || v === "" || v === defaults[k]) next.delete(k);
          else next.set(k, v);
        }
        if (!("page" in patch)) next.delete("page");
        return next;
      },
      { replace: true },
    );
  }
  return [state, set] as const;
}
