// Anket sonuç çubukları — yönetim ve sakin ekranı ortak (sakin paketi yönetim kodunu indirmesin).

/** Servis isteği 15'teki şekiller. Sakin yanıtında sonuç oy vermeden önce null gelir. */
export interface Poll {
  id: string; question: string; description: string | null; options: { id: string; label: string; votes: number | null }[];
  audience: "all" | "owners" | "tenants"; ends_on: string; status: "open" | "closed"; total_votes: number | null; created_by: string; created_at: string;
}

/** Sonuç çubukları: değer çubuğun üstünde yazılı, renk tek başına anlam taşımaz; en çok oy alan kalın. */
export function PollResults({ p, mine }: { p: Poll; mine?: string | null }) {
  const total = p.total_votes ?? 0;
  const max = Math.max(0, ...p.options.map((o) => o.votes ?? 0));
  return (
    <ul className="stack" style={{ gap: "var(--s-2)", listStyle: "none", padding: 0, margin: 0 }} aria-label={`${p.question} — sonuçlar`}>
      {p.options.map((o) => {
        const v = o.votes ?? 0;
        const pct = total ? Math.round((v / total) * 100) : 0;
        const lead = total > 0 && v === max;
        return (
          <li key={o.id}>
            <div className="row row--between small" style={{ gap: "var(--s-2)" }}>
              <span className={lead ? "strong" : undefined}>{o.label}{mine === o.id && <span className="muted"> · sizin oyunuz</span>}</span>
              <span className="nowrap" style={{ fontVariantNumeric: "tabular-nums" }}>{v} oy · %{pct}</span>
            </div>
            <div className="meter" aria-hidden="true"><div className={`meter__fill ${lead ? "meter__fill--ok" : ""}`} style={{ width: `${pct}%`, background: lead ? undefined : "var(--accent)" }} /></div>
          </li>
        );
      })}
    </ul>
  );
}

