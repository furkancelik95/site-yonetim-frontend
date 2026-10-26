import { useState, type FormEvent } from "react";
import { ClipboardCheck, Megaphone, Pin, Plus } from "lucide-react";
import { Link } from "react-router";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { Page, Schemas } from "../../api/types";
import { Alert, Badge, ConfirmButton, Empty, ErrorState, Field, FormError, Loading, PageHead, Pager, SubmitButton, fieldError } from "../../components/ui";
import { formatDate, formatDateTime } from "../../lib/format";
import { useUrlState } from "../../lib/hooks";
import { audience, channel, importance, importanceTone } from "../../lib/labels";
import { P, useSite } from "../../site/SiteContext";

/** Servis isteği 71: okuma onayı alanları liste yanıtına eklenir. */
type Ann = Schemas["AnnouncementOut"] & { requires_ack?: boolean; ack_deadline?: string | null; ack_count?: number | null };
interface Sched { id: string; title: string; importance: string; publish_at: string; requested_at: string; shifted: boolean; requires_ack: boolean; created_by: string }
interface Comm { quiet_from: string; quiet_to: string }
type Block = Schemas["BlockOut"];

const AUDIENCES = ["all_residents", "owners_only", "tenants_only", "debtors_only", "blocks"];
const CHANNELS = ["in_app", "email", "sms", "web_push"];

export function AnnouncementsPage() {
  const { can, site } = useSite();
  const [s, set] = useUrlState({ page: "1", sekme: "" });
  const r = useSiteGet<Page<Ann>>("/announcements", { page: s.page, page_size: 20 });
  const [adding, setAdding] = useState(false);

  return (
    <div className="stack">
      <PageHead
        title="Duyurular"
        subtitle="Sabitlenmiş duyurular üstte, sonra en yeni."
        actions={can(P.announcementsPublish) && <button className="btn btn--primary" type="button" aria-expanded={adding} onClick={() => setAdding((v) => !v)}><Plus aria-hidden="true" /> Duyuru yayınla</button>}
      />
      {adding && <NewAnnouncementForm onDone={() => setAdding(false)} />}
      {can(P.announcementsPublish) && (
        <div className="row" role="tablist" aria-label="Duyurular" style={{ gap: "var(--s-2)" }}>
          {[["", "Yayındakiler"], ["zaman", "Zamanlanmış"], ["ayar", "Sessiz saatler"]].map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={s.sekme === k} className={`btn btn--sm${s.sekme === k ? " btn--primary" : ""}`} onClick={() => set({ sekme: k! })}>{l}</button>)}
        </div>
      )}
      {s.sekme === "zaman" ? <ScheduledList /> : s.sekme === "ayar" ? <QuietHours /> : null}

      {s.sekme ? null : r.isPending ? (
        <Loading />
      ) : r.isError ? (
        <ErrorState error={r.error} onRetry={() => r.refetch()} />
      ) : r.data.items.length === 0 ? (
        <div className="card"><Empty title="Henüz duyuru yok" icon={<Megaphone aria-hidden="true" />} /></div>
      ) : (
        <div className="stack" style={{ gap: "var(--s-3)" }}>
          {r.data.items.map((a) => (
            <article key={a.id} className="card">
              <div className="card__head">
                {a.is_pinned && <span className="card__icon card__icon--accent" title="Sabitlendi"><Pin aria-hidden="true" /></span>}
                <h2 className="card__title" style={{ margin: 0 }}>{a.title}</h2>
                {a.importance !== "normal" && <Badge tone={importanceTone(a.importance)}>{importance(a.importance)}</Badge>}
                <span className="card__meta ml-auto">{formatDateTime(a.published_at)}</span>
              </div>
              <div className="card__body">
                <p className="mb-0" style={{ whiteSpace: "pre-wrap" }}>{a.body}</p>
              </div>
              <div className="card__foot row small muted" style={{ gap: "var(--s-3)" }}>
                <span>{audience(a.audience)}</span>
                {a.published_by && <span>· {a.published_by}</span>}
                {a.expires_on && <span>· {formatDate(a.expires_on)} tarihine kadar</span>}
                {a.recipient_count !== null && a.recipient_count !== undefined && (
                  <span className="ml-auto">{a.read_count ?? 0} / {a.recipient_count} kişi okudu</span>
                )}
                {a.requires_ack && <span><Badge tone="info">Okuma onayı</Badge> {a.ack_count ?? 0} onay · son {formatDateTime(a.ack_deadline)}</span>}
                {can(P.announcementsPublish) && <Link to={`/s/${site.slug}/duyurular/${a.id}/okuma-raporu`}><ClipboardCheck aria-hidden="true" style={{ width: 14, height: 14, verticalAlign: "-2px" }} /> Okuma raporu</Link>}
              </div>
            </article>
          ))}
          <Pager page={r.data.page} pageSize={r.data.page_size} total={r.data.total} onPage={(p) => set({ page: String(p) })} />
        </div>
      )}
    </div>
  );
}

function NewAnnouncementForm({ onDone }: { onDone: () => void }) {
  const blocks = useSiteGet<Page<Block>>("/blocks", { page_size: 200 });
  const [f, setF] = useState({ title: "", body: "", importance: "normal", audience: "all_residents", expires_on: "", is_pinned: false });
  const [blockIds, setBlockIds] = useState<string[]>([]);
  const [channels, setChannels] = useState<string[]>(["in_app"]);
  const [ack, setAck] = useState({ requires_ack: false, ack_hours: "48", sms_fallback: true });
  const [when, setWhen] = useState({ later: false, at: "" });
  const comm = useSiteGet<Comm>("/communication-settings");
  const m = useSiteMutation<Record<string, unknown>, Ann>("POST", "/announcements", { onSuccess: onDone });
  const up = (k: "title" | "body" | "importance" | "audience" | "expires_on") => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  function submit(e: FormEvent) {
    e.preventDefault();
    m.mutate({
      title: f.title.trim(),
      body: f.body.trim(),
      importance: f.importance,
      audience: f.audience,
      audience_block_ids: f.audience === "blocks" ? blockIds : [],
      channels,
      expires_on: f.expires_on || null,
      is_pinned: f.is_pinned,
      requires_ack: ack.requires_ack,
      ack_hours: ack.requires_ack ? Number(ack.ack_hours) : undefined,
      sms_fallback: ack.requires_ack ? ack.sms_fallback : undefined,
      publish_at: when.later && when.at ? new Date(when.at).toISOString() : null,
    });
  }

  return (
    <form className="card" onSubmit={submit} noValidate>
      <div className="card__head"><span className="card__title">Yeni duyuru</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        <Field label="Başlık" required error={fieldError(m.error, "title")}>{(p) => <input {...p} className="field__input" value={f.title} onChange={up("title")} />}</Field>
        <Field label="Metin" required error={fieldError(m.error, "body")}>{(p) => <textarea {...p} className="field__input" rows={4} value={f.body} onChange={up("body")} />}</Field>
        <div className="grid grid--kpi">
          <Field label="Önem">{(p) => <select {...p} className="field__input" value={f.importance} onChange={up("importance")}>{["normal", "important", "critical"].map((x) => <option key={x} value={x}>{importance(x)}</option>)}</select>}</Field>
          <Field label="Kime">{(p) => <select {...p} className="field__input" value={f.audience} onChange={up("audience")}>{AUDIENCES.map((x) => <option key={x} value={x}>{audience(x)}</option>)}</select>}</Field>
          <Field label="Yayından kalkış" hint="Boşsa süresiz.">{(p) => <input {...p} className="field__input" type="date" value={f.expires_on} onChange={up("expires_on")} />}</Field>
        </div>
        {f.audience === "blocks" && (
          <fieldset className="stack" style={{ gap: "var(--s-2)", border: 0, padding: 0, margin: 0 }}>
            <legend className="field__label">Bloklar</legend>
            <div className="row" style={{ gap: "var(--s-3)" }}>
              {blocks.data?.items.map((b) => (
                <label key={b.id} className="check"><input type="checkbox" checked={blockIds.includes(b.id)} onChange={() => setBlockIds((l) => toggle(l, b.id))} /> {b.name}</label>
              ))}
            </div>
          </fieldset>
        )}
        <fieldset className="stack" style={{ gap: "var(--s-2)", border: 0, padding: 0, margin: 0 }}>
          <legend className="field__label">Kanallar</legend>
          <div className="row" style={{ gap: "var(--s-3)" }}>
            {CHANNELS.map((c) => (
              <label key={c} className="check"><input type="checkbox" checked={channels.includes(c)} onChange={() => setChannels((l) => toggle(l, c))} /> {channel(c)}</label>
            ))}
          </div>
        </fieldset>
        {channels.some((c) => c !== "in_app") && (
          <Alert tone="info">SMS, e-posta ve tarayıcı bildirimi sağlayıcısı henüz seçilmedi; gönderim kaydı tutulur ama dışarıya ileti gitmez.</Alert>
        )}
        <label className="check"><input type="checkbox" checked={f.is_pinned} onChange={(e) => setF((x) => ({ ...x, is_pinned: e.target.checked }))} /> Üste sabitle</label>
        <fieldset className="stack" style={{ gap: "var(--s-2)", border: 0, padding: 0, margin: 0 }}>
          <label className="check"><input type="checkbox" checked={ack.requires_ack} onChange={(e) => setAck((x) => ({ ...x, requires_ack: e.target.checked }))} /> Okuma onayı zorunlu</label>
          {ack.requires_ack && (
            <div className="row" style={{ gap: "var(--s-3)", alignItems: "flex-end", flexWrap: "wrap" }}>
              <Field label="Son onay süresi (saat)" error={fieldError(m.error, "ack_hours")}>{(p) => <input {...p} className="field__input" style={{ maxWidth: "8rem" }} inputMode="numeric" value={ack.ack_hours} onChange={(e) => setAck((x) => ({ ...x, ack_hours: e.target.value.replace(/\D/g, "") }))} />}</Field>
              <label className="check"><input type="checkbox" checked={ack.sms_fallback} onChange={(e) => setAck((x) => ({ ...x, sms_fallback: e.target.checked }))} /> Süre dolunca onaylamayanlara bir kez SMS</label>
            </div>
          )}
          {ack.requires_ack && <p className="xs muted mb-0">Sakin "Okudum, anladım"a basana kadar duyuru ana sayfasında sabit kalır. Zaman damgalı okuma raporu genel kurul çağrısında ispat olarak kullanılabilir.</p>}
        </fieldset>
        <fieldset className="stack" style={{ gap: "var(--s-2)", border: 0, padding: 0, margin: 0 }}>
          <label className="check"><input type="checkbox" checked={when.later} onChange={(e) => setWhen((x) => ({ ...x, later: e.target.checked }))} /> İleri bir zamanda yayınla</label>
          {when.later && <Field label="Yayın zamanı" error={fieldError(m.error, "publish_at")}>{(p) => <input {...p} className="field__input" style={{ maxWidth: "16rem" }} type="datetime-local" value={when.at} onChange={(e) => setWhen((x) => ({ ...x, at: e.target.value }))} />}</Field>}
          {comm.data && <p className="xs muted mb-0">Sessiz saatler {comm.data.quiet_from}–{comm.data.quiet_to}: bu aralığa düşen zamanlanmış duyuru ve push/SMS/e-posta sessiz saat bitişine kayar; <strong>kritik</strong> önemdeki duyuru aşar.</p>}
        </fieldset>
      </div>
      <div className="card__foot row" style={{ gap: "var(--s-2)" }}>
        <SubmitButton busy={m.isPending} disabled={!f.title.trim() || !f.body.trim() || channels.length === 0 || (f.audience === "blocks" && blockIds.length === 0) || (when.later && !when.at)}>{when.later ? "Zamanla" : "Yayınla"}</SubmitButton>
        <button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button>
      </div>
    </form>
  );
}

/** Zamanlanmış duyurular (ILT-01): zamanı gelince yayınlanır; iptal edilebilir. */
function ScheduledList() {
  const q = useSiteGet<Sched[]>("/scheduled-announcements");
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} />;
  if (q.data.length === 0) return <div className="card"><Empty title="Zamanlanmış duyuru yok" /></div>;
  return <div className="stack" style={{ gap: "var(--s-2)" }}>{q.data.map((x) => <SchedItem key={x.id} x={x} />)}</div>;
}
function SchedItem({ x }: { x: Sched }) {
  const m = useSiteMutation<Record<string, never>, unknown>("POST", `/scheduled-announcements/${x.id}/cancel`);
  return (
    <div className="card"><div className="card__body row row--between" style={{ gap: "var(--s-2)", flexWrap: "wrap" }}>
      <div><div className="strong">{x.title}</div><div className="small muted">{formatDateTime(x.publish_at)}{x.shifted && ` (istenen ${formatDateTime(x.requested_at)}, sessiz saat nedeniyle kaydırıldı)`} · {x.created_by}{x.requires_ack && " · okuma onayı"}</div></div>
      <ConfirmButton className="btn btn--sm btn--ghost" title="Zamanlanmış duyuruyu iptal et" confirmLabel="İptal et" danger body={<p className="mb-0">{x.title} yayınlanmayacak.</p>} onConfirm={() => m.mutateAsync({})}>İptal et</ConfirmButton>
    </div></div>
  );
}

/** Sessiz saatler (16.2): site ayarı; acil duyuru aşar. */
function QuietHours() {
  const q = useSiteGet<Comm>("/communication-settings");
  if (!q.data) return q.isError ? <ErrorState error={q.error} /> : <Loading />;
  return <QuietForm c={q.data} />;
}
function QuietForm({ c }: { c: Comm }) {
  const [f, setF] = useState(c);
  const m = useSiteMutation<Comm, Comm>("PUT", "/communication-settings");
  return (
    <form className="card" noValidate onSubmit={(e) => { e.preventDefault(); m.mutate(f); }}>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        <div className="row" style={{ gap: "var(--s-3)", flexWrap: "wrap" }}>
          <Field label="Başlangıç" error={fieldError(m.error, "quiet_from")}>{(p) => <input {...p} className="field__input" type="time" value={f.quiet_from} onChange={(e) => setF((x) => ({ ...x, quiet_from: e.target.value }))} />}</Field>
          <Field label="Bitiş" error={fieldError(m.error, "quiet_to")}>{(p) => <input {...p} className="field__input" type="time" value={f.quiet_to} onChange={(e) => setF((x) => ({ ...x, quiet_to: e.target.value }))} />}</Field>
        </div>
        <p className="xs muted mb-0">Bu saatlerde push, SMS ve e-posta gönderilmez, bitişte gider. Kritik duyuru ve acil durum aşar. SMS hesabı, kota ve teslim kayıtları "SMS Hesabı ve Gönderim" ekranında.</p>
      </div>
      <div className="card__foot"><SubmitButton busy={m.isPending}>Kaydet</SubmitButton></div>
    </form>
  );
}
