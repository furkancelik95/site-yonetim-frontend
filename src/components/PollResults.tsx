// Anket sonuç çubukları — yönetim ve sakin ekranı ortak (sakin paketi yönetim kodunu indirmesin).

import type { Schemas } from "../api/types";

/** Servis isteği 15. Sakin yanıtında sonuç oy vermeden önce null gelir. */
export type Poll = Schemas["PollOut"];

/**
 * Sonuç çubukları: değer çubuğun üstünde yazılı, renk tek başına anlam taşımaz; en çok oy alan
 * kalın ve koyu mavi, diğerleri pastel. Kullanıcının kendi oyu metinle işaretlenir.
 */
export function PollResults({ p, mine }: { p: Poll; mine?: string | null }) {
  const total = p.total_votes ?? 0;
  const max = Math.max(0, ...p.options.map((o) => o.votes ?? 0));
  return (
    <ul className="stack poll" style={{ gap: "var(--s-3)", listStyle: "none", padding: 0, margin: 0 }} aria-label={`${p.question} — sonuçlar`}>
      {p.options.map((o) => {
        const v = o.votes ?? 0;
        const pct = total ? Math.round((v / total) * 100) : 0;
        const lead = total > 0 && v === max;
        return (
          <li key={o.id}>
            <div className="poll__row">
              <span className={lead ? "strong" : undefined}>{o.label}{mine === o.id && <span className="muted"> · sizin oyunuz</span>}</span>
              <span className="poll__pct"><span className="muted" style={{ fontWeight: 500 }}>{v} oy · </span>%{pct}</span>
            </div>
            <div className="meter" aria-hidden="true"><div className={`meter__fill ${lead ? "meter__fill--accent" : "meter__fill--soft"}`} style={{ width: `${pct}%` }} /></div>
          </li>
        );
      })}
    </ul>
  );
}
