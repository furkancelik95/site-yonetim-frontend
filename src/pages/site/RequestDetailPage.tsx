import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { Schemas } from "../../api/types";
import { Badge, ErrorState, Field, FormError, Loading, PageHead, SubmitButton, fieldError } from "../../components/ui";
import { formatDateTime } from "../../lib/format";
import { priorityTone, requestCategory, requestEvent, requestPriority, requestStatus, requestStatusTone } from "../../lib/labels";
import { P, useSite } from "../../site/SiteContext";

type Detail = Schemas["RequestDetail"];
const STATUSES = ["open", "in_progress", "waiting", "resolved", "closed", "cancelled"];
const NEEDS_RESOLUTION = new Set(["resolved", "closed"]);

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
        subtitle={<>{requestCategory(r.category)} · {r.unit_name ?? r.location ?? "Ortak alan"} · {formatDateTime(r.created_at)}</>}
        actions={<Link className="btn" to={`/s/${site.slug}/talepler`}>Taleplere dön</Link>}
      />

      <div className="grid grid--2">
        <div className="card">
          <div className="card__head"><span className="card__title">Talep</span></div>
          <div className="card__body">
            <div className="kv"><span className="kv__k">Durum</span><span className="kv__v"><Badge tone={requestStatusTone(r.status)}>{r.status_label || requestStatus(r.status)}</Badge></span></div>
            <div className="kv"><span className="kv__k">Öncelik</span><span className="kv__v"><Badge tone={priorityTone(r.priority)}>{requestPriority(r.priority)}</Badge></span></div>
            <div className="kv"><span className="kv__k">Bildiren</span><span className="kv__v">{r.reporter_name ?? r.created_by_name ?? "—"}</span></div>
            <div className="kv"><span className="kv__k">Atanan</span><span className="kv__v">{r.assigned_to ?? "—"}</span></div>
            {r.due_at && <div className="kv"><span className="kv__k">Hedef</span><span className="kv__v">{formatDateTime(r.due_at)}</span></div>}
            {r.resolution && <div className="kv"><span className="kv__k">Çözüm</span><span className="kv__v">{r.resolution}</span></div>}
            {r.description && <p className="mt-4 mb-0" style={{ whiteSpace: "pre-wrap" }}>{r.description}</p>}
          </div>
        </div>

        <div className="stack">
          {can(P.requestsAssign) && <StatusForm r={r} />}
          {can(P.requestsAssign) && <AssignForm r={r} />}
        </div>
      </div>

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
          <CommentForm id={r.id} />
        </div>
      </div>
    </div>
  );
}

function StatusForm({ r }: { r: Detail }) {
  const [status, setStatus] = useState(r.status);
  const [resolution, setResolution] = useState("");
  const [err, setErr] = useState<string>();
  const m = useSiteMutation<{ status: string; resolution: string | null }, Detail>("POST", `/requests/${r.id}/status`, { onSuccess: () => setResolution("") });
  function submit(e: FormEvent) {
    e.preventDefault();
    if (NEEDS_RESOLUTION.has(status) && !resolution.trim()) return setErr("Çözüldü ya da kapandı için çözüm notu zorunlu.");
    setErr(undefined);
    m.mutate({ status, resolution: resolution.trim() || null });
  }
  return (
    <form className="card" onSubmit={submit} noValidate>
      <div className="card__head"><span className="card__title">Durumu değiştir</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        <Field label="Yeni durum">
          {(p) => <select {...p} className="field__input" value={status} onChange={(e) => setStatus(e.target.value as Detail["status"])}>{STATUSES.map((x) => <option key={x} value={x} disabled={x === r.status}>{requestStatus(x)}</option>)}</select>}
        </Field>
        <Field label="Çözüm notu" required={NEEDS_RESOLUTION.has(status)} error={err ?? fieldError(m.error, "resolution")}>
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

function CommentForm({ id }: { id: string }) {
  const [body, setBody] = useState("");
  const m = useSiteMutation<{ body: string }, Detail>("POST", `/requests/${id}/comments`, { onSuccess: () => setBody("") });
  return (
    <form className="stack" style={{ gap: "var(--s-2)" }} noValidate onSubmit={(e) => { e.preventDefault(); m.mutate({ body: body.trim() }); }}>
      <FormError error={m.error} />
      <Field label="Yorum ekle" error={fieldError(m.error, "body")}>{(p) => <textarea {...p} className="field__input" rows={2} value={body} onChange={(e) => setBody(e.target.value)} />}</Field>
      <div><SubmitButton busy={m.isPending} className="btn" disabled={!body.trim()}>Yorum ekle</SubmitButton></div>
    </form>
  );
}
