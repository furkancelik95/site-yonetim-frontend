import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LifeBuoy, ThumbsDown, ThumbsUp } from "lucide-react";
import { useLocation } from "react-router";
import { api, get } from "../../api/client";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import { Alert, Badge, ConfirmButton, Empty, ErrorState, Field, FormError, Loading, PageHead, SubmitButton, fieldError } from "../../components/ui";
import { formatDateTime } from "../../lib/format";
import { useUrlState } from "../../lib/hooks";
import { P, useSite } from "../../site/SiteContext";

/** Servis isteği 82–84'teki şekiller. */
export interface Ticket { id: string; number: string; site_slug: string; site_name: string; category: string; priority: string; title: string; context: { path: string; app_version: string; user_agent: string; correlation_id: string }; status: string; messages: { by: string; side: string; body: string; at: string }[]; created_by: string; created_at: string; first_response_at: string | null; resolved_at: string | null; sla: { first_due: string; resolve_due: string; first_breached: boolean; resolve_breached: boolean } }
export interface Article { id: string; title: string; body: string; audience: string; screens: string[]; helpful: number; not_helpful: number; updated_at: string; updated_by: string }
export interface Session { id: string; site_slug: string; site_name: string; reason: string; hours: number; requested_by: string; requested_at: string; status: string; decided_by: string | null; decided_at: string | null; ends_at: string | null; reject_reason: string | null }

export const T_CAT: Record<string, string> = { login: "Giriş", payment: "Ödeme", finance: "Finans hesabı", import: "Veri aktarımı", security: "Güvenlik modu", other: "Diğer" };
export const T_PRI: Record<string, [string, "danger" | "warn" | "muted"]> = { critical: ["Kritik", "danger"], high: ["Yüksek", "warn"], normal: ["Normal", "muted"] };
export const T_ST: Record<string, [string, "info" | "warn" | "ok" | "muted"]> = { open: ["Açık", "info"], answered: ["Yanıtlandı", "warn"], waiting_customer: ["Yanıtınız bekleniyor", "warn"], resolved: ["Çözüldü", "ok"], closed: ["Kapandı", "muted"] };
export const S_ST: Record<string, [string, "warn" | "danger" | "muted" | "info"]> = { pending: ["Onay bekliyor", "warn"], active: ["Aktif", "danger"], rejected: ["Reddedildi", "muted"], expired: ["Sona erdi", "muted"] };
const tabs = (items: [string, string][], v: string, set: (k: string) => void, label: string) => (
  <div className="row" role="tablist" aria-label={label} style={{ gap: "var(--s-2)", flexWrap: "wrap" }}>{items.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={v === k} className={`btn btn--sm${v === k ? " btn--primary" : ""}`} onClick={() => set(k)}>{l}</button>)}</div>
);

/** Destek (PYN-06 müşteri, PYN-04 onay): destek biletleri ve destek oturumu talepleri. */
export function SupportPage() {
  const { can } = useSite();
  const [s, set] = useUrlState({ sekme: "bilet" });
  const sess = useSiteGet<Session[]>("/support-sessions");
  const pending = (sess.data ?? []).filter((x) => x.status === "pending").length;
  return (
    <div className="stack">
      <PageHead title="Destek" subtitle="Platform desteğine ekran bağlamıyla bilet açın. Destek ekibi verinize yalnız sizin onayınızla, süreli ve salt okunur erişir." />
      {tabs([["bilet", "Destek biletleri"], ["oturum", `Destek oturumları${pending ? ` (${pending})` : ""}`]], s.sekme, (k) => set({ sekme: k }), "Destek")}
      {s.sekme === "oturum" ? <Sessions canDecide={can(P.membersManage)} /> : <Tickets />}
    </div>
  );
}

function Tickets() {
  const location = useLocation();
  const [s] = useUrlState({ ekran: "" });
  const q = useSiteGet<Ticket[]>("/support-tickets");
  const [f, setF] = useState({ title: "", body: "", category: "other", priority: "normal" });
  const m = useSiteMutation<Record<string, unknown>, Ticket>("POST", "/support-tickets", { onSuccess: () => setF({ title: "", body: "", category: "other", priority: "normal" }) });
  const ctx = { path: s.ekran || location.pathname, app_version: "web", user_agent: navigator.userAgent };
  return (
    <div className="stack">
      <form className="card" noValidate onSubmit={(e) => { e.preventDefault(); m.mutate({ ...f, context: ctx }); }}>
        <div className="card__head"><span className="card__icon"><LifeBuoy aria-hidden="true" /></span><span className="card__title">Yeni destek bileti</span></div>
        <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
          <FormError error={m.error} />
          <div className="grid grid--2">
            <Field label="Kategori" error={fieldError(m.error, "category")}>{(p) => <select {...p} className="field__input" value={f.category} onChange={(e) => setF((x) => ({ ...x, category: e.target.value }))}>{Object.entries(T_CAT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>}</Field>
            <Field label="Öncelik" hint="Kritik: tahsilat/giriş tamamen duruyor" error={fieldError(m.error, "priority")}>{(p) => <select {...p} className="field__input" value={f.priority} onChange={(e) => setF((x) => ({ ...x, priority: e.target.value }))}>{Object.entries(T_PRI).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select>}</Field>
          </div>
          <Field label="Konu" required error={fieldError(m.error, "title")}>{(p) => <input {...p} className="field__input" maxLength={120} value={f.title} onChange={(e) => setF((x) => ({ ...x, title: e.target.value }))} />}</Field>
          <Field label="Açıklama" required error={fieldError(m.error, "body")}>{(p) => <textarea {...p} className="field__input" rows={4} maxLength={4000} value={f.body} onChange={(e) => setF((x) => ({ ...x, body: e.target.value }))} />}</Field>
          <p className="xs muted mb-0">Otomatik eklenir: ekran ({ctx.path}), tesis, uygulama sürümü, tarayıcı ve izleme kimliği. Ek dosya belge deposuyla.</p>
        </div>
        <div className="card__foot"><SubmitButton busy={m.isPending}>Bileti aç</SubmitButton></div>
      </form>
      {q.isPending ? <Loading /> : q.isError ? <ErrorState error={q.error} /> : q.data.length === 0 ? <Empty title="Bilet yok" /> : q.data.map((t) => <TicketCard key={t.id} t={t} />)}
    </div>
  );
}

function TicketCard({ t }: { t: Ticket }) {
  const [msg, setMsg] = useState("");
  const reply = useSiteMutation<{ body: string }, Ticket>("POST", `/support-tickets/${t.id}/messages`, { onSuccess: () => setMsg("") });
  const close = useSiteMutation<Record<string, never>, Ticket>("POST", `/support-tickets/${t.id}/close`);
  return (
    <details className="card" open={t.status === "waiting_customer" || t.status === "resolved"}>
      <summary className="card__head" style={{ cursor: "pointer" }}><span className="card__title">{t.number} · {t.title}</span><span className="card__meta">{T_CAT[t.category]}</span><span className="ml-auto row" style={{ gap: 4 }}><Badge tone={T_PRI[t.priority]![1]}>{T_PRI[t.priority]![0]}</Badge><Badge tone={T_ST[t.status]![1]}>{T_ST[t.status]![0]}</Badge></span></summary>
      <div className="card__body stack" style={{ gap: "var(--s-2)" }}>
        {t.messages.map((x, i) => <div key={i} className="small" style={{ background: x.side === "support" ? "var(--info-bg)" : "var(--bg-sunken)", borderRadius: 8, padding: "var(--s-2)" }}><strong>{x.by}</strong> · {formatDateTime(x.at)}<div style={{ whiteSpace: "pre-wrap" }}>{x.body}</div></div>)}
        <div className="xs muted">Bağlam: {t.context.path} · {t.context.correlation_id}</div>
        <FormError error={reply.error ?? close.error} />
        {t.status === "resolved" && <div className="row" style={{ gap: "var(--s-2)", flexWrap: "wrap" }}><button className="btn btn--primary btn--sm" type="button" disabled={close.isPending} onClick={() => close.mutate({})}>Sorun çözüldü, kapat</button><span className="small muted">Çözülmediyse aşağıdan yazın; bilet yeniden açılır.</span></div>}
        {t.status !== "closed" && <div className="row" style={{ gap: "var(--s-2)", alignItems: "flex-end", flexWrap: "wrap" }}><Field label="Yanıtınız">{(p) => <input {...p} className="field__input" value={msg} onChange={(e) => setMsg(e.target.value)} />}</Field><button className="btn btn--sm" type="button" disabled={!msg.trim() || reply.isPending} onClick={() => reply.mutate({ body: msg })}>Gönder</button></div>}
      </div>
    </details>
  );
}

function Sessions({ canDecide }: { canDecide: boolean }) {
  const q = useSiteGet<Session[]>("/support-sessions");
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} />;
  if (q.data.length === 0) return <Empty title="Destek oturumu talebi yok" />;
  return <div className="stack">{q.data.map((s) => <SessionCard key={s.id} s={s} canDecide={canDecide} />)}</div>;
}
function SessionCard({ s, canDecide }: { s: Session; canDecide: boolean }) {
  const [reason, setReason] = useState("");
  const ok = useSiteMutation<Record<string, never>, Session>("POST", `/support-sessions/${s.id}/approve`);
  const no = useSiteMutation<{ reason: string }, Session>("POST", `/support-sessions/${s.id}/reject`);
  const end = useSiteMutation<Record<string, never>, Session>("POST", `/support-sessions/${s.id}/end`);
  return (
    <div className="card" style={{ borderColor: s.status === "pending" ? "var(--warn-line)" : s.status === "active" ? "var(--danger-line)" : undefined }}>
      <div className="card__head"><span className="card__title">{s.requested_by} · {s.hours} saat</span><span className="card__meta">{formatDateTime(s.requested_at)}</span><span className="ml-auto"><Badge tone={S_ST[s.status]![1]}>{S_ST[s.status]![0]}</Badge></span></div>
      <div className="card__body stack" style={{ gap: "var(--s-2)" }}>
        <div className="small">Gerekçe: {s.reason}</div>
        {s.status === "active" && <div className="small">Bitiş: {formatDateTime(s.ends_at)} · onaylayan {s.decided_by}</div>}
        {s.status === "rejected" && <div className="small muted">{s.decided_by}{s.reject_reason && `: ${s.reject_reason}`}</div>}
        <FormError error={ok.error ?? no.error ?? end.error} />
        {s.status === "pending" && (canDecide ? (
          <div className="row" style={{ gap: "var(--s-2)", flexWrap: "wrap" }}>
            <ConfirmButton className="btn btn--primary btn--sm" title="Destek oturumunu onayla" confirmLabel="Onayla" body={<p className="mb-0">Destek ekibi {s.hours} saat boyunca verinizi <strong>salt okunur</strong> görebilir; tüm işlemler denetim kaydına "destek oturumu" olarak yazılır. Süre dolunca oturum kendiliğinden kapanır.</p>} onConfirm={() => ok.mutateAsync({})}>Onayla</ConfirmButton>
            <ConfirmButton className="btn btn--sm" title="Reddet" confirmLabel="Reddet" body={<Field label="Gerekçe (isteğe bağlı)">{(p) => <input {...p} className="field__input" value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>} onConfirm={() => no.mutateAsync({ reason })}>Reddet</ConfirmButton>
          </div>
        ) : <p className="small muted mb-0">Onayı kullanıcı yönetimi yetkisi olan yönetici verir.</p>)}
        {s.status === "active" && canDecide && <div><button className="btn btn--sm" type="button" disabled={end.isPending} onClick={() => end.mutate({})}>Oturumu şimdi bitir</button></div>}
      </div>
    </div>
  );
}

/** Aktif destek oturumu bandı (her site ekranında). */
export function SupportSessionBanner() {
  const s = useSiteGet<Session | null>("/support-sessions/active", undefined, { refetchInterval: 60000 });
  if (!s.data) return null;
  return <Alert tone="warn" title="Destek oturumu aktif">Platform destek ekibi ({s.data.requested_by}) {formatDateTime(s.data.ends_at)} saatine kadar verinizi salt okunur görebilir. Destek ekranından bitirebilirsiniz.</Alert>;
}

// ===================================================================== 83 Yardım
/** Yardım ve bilgi bankası (PYN-06): rol ve ekrana göre makaleler, "faydalı mı?" geri bildirimi. */
export function HelpCenterPage() {
  const [s, set] = useUrlState({ q: "", ekran: "" });
  const q = useQuery({ queryKey: ["kb", s.q, s.ekran], queryFn: () => get<Article[]>("/knowledge-articles", { q: s.q || undefined, screen: s.ekran || undefined, audience: "staff" }) });
  const [sent, setSent] = useState<Record<string, boolean>>({});
  const [err, setErr] = useState<unknown>(null);
  async function fb(id: string, helpful: boolean) { setErr(null); try { await api("POST", `/knowledge-articles/${id}/feedback`, { body: { helpful } }); setSent((x) => ({ ...x, [id]: true })); } catch (e) { setErr(e); } }
  return (
    <div className="stack">
      <PageHead title="Yardım" subtitle="Ekranlarla ilgili kısa rehberler. Bulamadığınız konu için Destek'ten bilet açın." />
      <div className="filters">
        <div className="field"><label className="field__label" htmlFor="kb-q">Ara</label><input id="kb-q" className="field__input" type="search" value={s.q} onChange={(e) => set({ q: e.target.value })} /></div>
        {s.ekran && <div className="field"><span className="field__label">Ekran</span><button className="btn btn--sm" type="button" onClick={() => set({ ekran: "" })}>{s.ekran} ✕</button></div>}
      </div>
      <FormError error={err} />
      {q.isPending ? <Loading /> : q.isError ? <ErrorState error={q.error} /> : q.data.length === 0 ? <Empty title="Makale bulunamadı" /> : q.data.map((a) => (
        <details key={a.id} className="card"><summary className="card__head" style={{ cursor: "pointer" }}><span className="card__title">{a.title}</span><span className="card__meta ml-auto">{formatDateTime(a.updated_at)}</span></summary>
          <div className="card__body stack" style={{ gap: "var(--s-2)" }}>
            <p className="mb-0" style={{ whiteSpace: "pre-wrap" }}>{a.body}</p>
            {sent[a.id] ? <div className="small muted">Teşekkürler.</div> : <div className="row" style={{ gap: "var(--s-2)", alignItems: "center" }}><span className="small">Faydalı mı?</span><button className="btn btn--sm" type="button" aria-label="Faydalı" onClick={() => fb(a.id, true)}><ThumbsUp aria-hidden="true" /> Evet</button><button className="btn btn--sm" type="button" aria-label="Faydalı değil" onClick={() => fb(a.id, false)}><ThumbsDown aria-hidden="true" /> Hayır</button></div>}
          </div>
        </details>
      ))}
    </div>
  );
}
