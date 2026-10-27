import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { Schemas } from "../../api/types";
import { Badge, ErrorState, Field, FormError, Loading, PageHead, SubmitButton, fieldError } from "../../components/ui";
import { formatDateTime } from "../../lib/format";
import { priorityTone, requestEvent, requestPriority, requestStatus, requestStatusTone } from "../../lib/labels";
import { P, useSite } from "../../site/SiteContext";
import { DepartmentAssign } from "./Departments";
import { ExtrasCard, InternalNotes, MergeCard, SlaCard } from "./RequestExtras";
import { fillTemplate } from "../../lib/labels";

type Detail = Schemas["RequestDetail"];
/** Çözüm notu (çözüldü) ya da gerekçe (iptal) zorunlu — backend kuralı (K18). */
const NEEDS_RESOLUTION = new Set(["resolved", "cancelled"]);

export function RequestDetailPage() {
  const { requestId = "" } = useParams();
  const { site, can } = useSite();
  const q = useSiteGet<Detail>(`/requests/${requestId}`);

  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const r = q.data;

  return (
    <div className="stack">
      <PageHead
        title={`#${r.number} ${r.title}`}
        subtitle={<>{r.category_name} · {r.unit_name ?? r.location ?? "Ortak alan"} · {formatDateTime(r.created_at)}</>}
        actions={<Link className="btn" to={`/s/${site.slug}/talepler`}>Taleplere dön</Link>}
      />

      <div className="grid grid--2">
        <div className="card">
          <div className="card__head"><span className="card__title">Talep</span></div>
          <div className="card__body">
            <div className="kv"><span className="kv__k">Durum</span><span className="kv__v"><Badge tone={requestStatusTone(r.status)}>{r.status_label || requestStatus(r.status)}</Badge></span></div>
            <div className="kv"><span className="kv__k">Öncelik</span><span className="kv__v"><Badge tone={priorityTone(r.priority)}>{requestPriority(r.priority)}</Badge></span></div>
            <div className="kv"><span className="kv__k">Bildiren</span><span className="kv__v">{r.reporter_name ?? r.created_by_name ?? "—"}</span></div>
            <div className="kv"><span className="kv__k">Departman</span><span className="kv__v"><DepartmentAssign requestId={r.id} current={r.department_id ?? null} canAssign={can(P.requestsAssign)} /></span></div>
            <div className="kv"><span className="kv__k">Atanan</span><span className="kv__v">{r.assigned_to ?? "—"}</span></div>
            {r.due_at && <div className="kv"><span className="kv__k">Hedef</span><span className="kv__v">{formatDateTime(r.due_at)}</span></div>}
            <SlaCard s={r.sla} />
            {r.resolution && <div className="kv"><span className="kv__k">Çözüm</span><span className="kv__v">{r.resolution}</span></div>}
            {r.description && <p className="mt-4 mb-0" style={{ whiteSpace: "pre-wrap" }}>{r.description}</p>}
          </div>
        </div>

        <div className="stack">
          {can(P.requestsAssign) && r.allowed_transitions.length > 0 && <StatusForm key={`${r.status}-${r.allowed_transitions.join()}`} r={r} />}
          {can(P.requestsAssign) && !["closed", "cancelled"].includes(r.status) && <AssignForm r={r} />}
        </div>
      </div>

      <MergeCard r={r} />
      <ExtrasCard r={r} />
      {can(P.requestsAssign) && <InternalNotes id={r.id} />}

      <div className="card">
        <div className="card__head"><span className="card__title">Geçmiş</span></div>
        <div className="card__body stack" style={{ gap: "var(--s-4)" }}>
          <ul className="timeline">
            {r.events.map((e) => (
              <li key={e.id} className="is-done">
                <div className="timeline__title">
                  {requestEvent(e.kind)}
                  {e.new_status && <> → <Badge tone={requestStatusTone(e.new_status)}>{requestStatus(e.new_status)}</Badge></>}
                </div>
                {e.description && <div style={{ whiteSpace: "pre-wrap" }} className="small">{e.description}</div>}
                <div className="timeline__meta">{e.actor_name ?? "—"} · {formatDateTime(e.created_at)}</div>
              </li>
            ))}
          </ul>
          <CommentForm r={r} />
        </div>
      </div>
    </div>
  );
}

/** Yalnız dokümandaki akışta izin verilen geçişler (backend `allowed_transitions`, K18). */
function StatusForm({ r }: { r: Detail }) {
  const [status, setStatus] = useState<Detail["status"]>(r.allowed_transitions[0] ?? r.status);
  const [resolution, setResolution] = useState("");
  const [err, setErr] = useState<string>();
  const m = useSiteMutation<{ status: string; resolution: string | null }, Detail>("POST", `/requests/${r.id}/status`, { onSuccess: () => setResolution("") });
  function submit(e: FormEvent) {
    e.preventDefault();
    if (NEEDS_RESOLUTION.has(status) && !resolution.trim()) return setErr(status === "cancelled" ? "İptal için gerekçe yazın." : "Çözüldü için çözüm notu zorunlu.");
    setErr(undefined);
    m.mutate({ status, resolution: resolution.trim() || null });
  }
  return (
    <form className="card" onSubmit={submit} noValidate>
      <div className="card__head"><span className="card__title">Durumu değiştir</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        <Field label="Yeni durum">
          {(p) => <select {...p} className="field__input" value={status} onChange={(e) => setStatus(e.target.value as Detail["status"])}>{r.allowed_transitions.map((x) => <option key={x} value={x}>{requestStatus(x)}</option>)}</select>}
        </Field>
        {r.status === "resolved" && r.reported_by_person_id && <p className="small muted mb-0">Sakin onayı bekleniyor; talep sakin onaylayınca ya da yanıt gelmezse kendiliğinden kapanır.</p>}
        <Field label={status === "cancelled" ? "İptal gerekçesi" : "Çözüm notu"} required={NEEDS_RESOLUTION.has(status)} error={err ?? fieldError(m.error, "resolution")}>
          {(p) => <textarea {...p} className="field__input" rows={2} value={resolution} onChange={(e) => setResolution(e.target.value)} />}
        </Field>
      </div>
      <div className="card__foot"><SubmitButton busy={m.isPending} className="btn btn--primary" disabled={status === r.status}>Kaydet</SubmitButton></div>
    </form>
  );
}

function AssignForm({ r }: { r: Detail }) {
  const [who, setWho] = useState(r.assigned_to ?? "");
  const m = useSiteMutation<{ assignee: string }, Detail>("POST", `/requests/${r.id}/assign`);
  return (
    <form className="card" noValidate onSubmit={(e) => { e.preventDefault(); m.mutate({ assignee: who.trim() }); }}>
      <div className="card__head"><span className="card__title">Ata</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        <Field label="Personel ya da firma" error={fieldError(m.error, "assignee")}>
          {(p) => <input {...p} className="field__input" value={who} onChange={(e) => setWho(e.target.value)} placeholder="ör. Ergün Kılıç / Asansör Servis A.Ş." />}
        </Field>
      </div>
      <div className="card__foot"><SubmitButton busy={m.isPending} className="btn" disabled={who.trim().length < 2 || who.trim() === r.assigned_to}>Ata</SubmitButton></div>
    </form>
  );
}

function CommentForm({ r }: { r: Detail }) {
  const id = r.id;
  const [body, setBody] = useState("");
  const m = useSiteMutation<{ body: string }, Detail>("POST", `/requests/${id}/comments`, { onSuccess: () => setBody("") });
  const tpl = useSiteGet<{ id: string; title: string; category: string | null; body: string; is_active: boolean }[]>("/reply-templates");
  const usable = (tpl.data ?? []).filter((t) => t.is_active && (!t.category || t.category === r.category));
  return (
    <form className="stack" style={{ gap: "var(--s-2)" }} noValidate onSubmit={(e) => { e.preventDefault(); m.mutate({ body: body.trim() }); }}>
      <FormError error={m.error} />
      {usable.length > 0 && <div className="field" style={{ maxWidth: "20rem" }}><label className="field__label" htmlFor={`tpl-${id}`}>Hazır yanıt</label><select id={`tpl-${id}`} className="field__input" value="" onChange={(e) => { const t = usable.find((x) => x.id === e.target.value); if (t) setBody(fillTemplate(t.body, { number: r.number, reporter_name: r.reporter_name, title: r.title })); }}><option value="">Şablon seç…</option>{usable.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}</select></div>}
      <Field label="Sakine yanıt (yorum)" hint="Yorumu sakin de görür; yalnız personelin göreceği notu İç notlar kartına yazın." error={fieldError(m.error, "body")}>{(p) => <textarea {...p} className="field__input" rows={2} value={body} onChange={(e) => setBody(e.target.value)} />}</Field>
      <div><SubmitButton busy={m.isPending} className="btn" disabled={!body.trim()}>Yorum ekle</SubmitButton></div>
    </form>
  );
}
