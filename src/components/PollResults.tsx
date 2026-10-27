// Anket sonuçları — yönetim ve sakin ekranı ortak (sakin paketi yönetim kodunu indirmesin).

import type { Schemas } from "../api/types";

/** Servis isteği 15 + ILT-03 (K31). Sakin yanıtında sonuç, yanıt vermeden önce null gelir. */
export type Poll = Schemas["PollOut"];
type Question = Schemas["PollQuestionOut"];

export const QUESTION_KIND: Record<string, string> = { single: "Tek seçim", multiple: "Çoklu seçim", rating: "1–5 puan", text: "Serbest metin" };

/** Gizlilik satırı (K31): anonim / isimli, bölüm başına / kişi başına. */
export function pollPrivacy(p: Pick<Poll, "is_anonymous" | "one_per_unit">): string {
  return `${p.is_anonymous ? "Anonim — kimin yanıtladığı tutulmaz" : "İsimli — yanıt verenin adı kaydedilir, yönetim görür"} · ${p.one_per_unit ? "bölüm başına bir yanıt" : "kişi başına bir yanıt"}`;
}

/** Seçim çubukları: değer çubuğun üstünde yazılı, renk tek başına anlam taşımaz; en çok oy alan kalın. */
function Bars({ q, total, mine, label }: { q: Question; total: number; mine?: string | null; label: string }) {
  const max = Math.max(0, ...q.options.map((o) => o.votes ?? 0));
  return (
    <ul className="stack" style={{ gap: "var(--s-2)", listStyle: "none", padding: 0, margin: 0 }} aria-label={`${label} — sonuçlar`}>
      {q.options.map((o) => {
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

function QuestionResult({ q, poll, mine, titled }: { q: Question; poll: Poll; mine?: string | null; titled: boolean }) {
  const answered = q.answered ?? poll.total_votes ?? 0;
  return (
    <div className="stack" style={{ gap: "var(--s-2)" }}>
      {titled && <div className="small strong">{q.order}. {q.text} <span className="xs muted">({QUESTION_KIND[q.kind]})</span></div>}
      {(q.kind === "single" || q.kind === "multiple") && <Bars q={q} total={q.kind === "single" ? answered : poll.total_votes ?? 0} mine={mine} label={q.text} />}
      {q.kind === "rating" && q.rating && (
        <div className="small">Ortalama <strong>{q.rating.average ? q.rating.average.replace(".", ",") : "—"}</strong> / 5 · {q.rating.counts.map((c, i) => `${i + 1}★ ${c}`).join(" · ")}</div>
      )}
      {q.kind === "text" && (
        <div className="small">
          {answered} yanıt
          {q.texts && q.texts.length > 0 && <ul className="small" style={{ margin: "4px 0 0", paddingLeft: "1.2em" }}>{q.texts.map((t, i) => <li key={i}>{t}</li>)}</ul>}
        </div>
      )}
    </div>
  );
}

export function PollResults({ p, mine }: { p: Poll; mine?: string | null }) {
  const many = p.questions.length > 1;
  return (
    <div className="stack" style={{ gap: "var(--s-3)" }}>
      {p.questions.map((q, i) => <QuestionResult key={q.id} q={q} poll={p} mine={i === 0 ? mine : null} titled={many || q.kind !== "single"} />)}
    </div>
  );
}
