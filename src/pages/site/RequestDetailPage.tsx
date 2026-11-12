import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import { CircleDot, Flag, History, ListChecks, MessageSquare, Timer, UserCheck } from "lucide-react";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { Schemas } from "../../api/types";
import { Avatar, Badge, ErrorState, Field, FormError, IconChip, Kpi, Loading, PageHead, SubmitButton, fieldError } from "../../components/ui";
import { formatDateTime } from "../../lib/format";
import { categoryIcon } from "../../lib/icons";
import { REQUEST_STATUSES, priorityTone, requestCategory, requestEvent, requestPriority, requestStatus, requestStatusTone, slaState, slaTone } from "../../lib/labels";
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
  // requests.assigned (teknik personel): kendi talebinde durum, yorum, iç not; atama/departman yok
  const work = can(P.requestsAssign) || can(P.requestsAssigned);
  const CatIcon = categoryIcon(r.category);
  const catName = r.category_name || requestCategory(r.category);

  return (
    <div className="stack">
      <PageHead
        eyebrow={`Talep #${r.number} · ${catName}`}
        title={r.title}
        subtitle={<>{r.unit_name ?? r.location ?? "Ortak alan"} · {formatDateTime(r.created_at)}</>}
        actions={<><Badge tone={requestStatusTone(r.status)}>{r.status_label || requestStatus(r.status)}</Badge><Badge tone={priorityTone(r.priority)}>{requestPriority(r.priority)}</Badge><Link className="btn" to={`/s/${site.slug}/talepler`}>Taleplere dön</Link></>}
      />
      <DetailKpis r={r} />

      <div className="grid grid--2">
        <div className="card">
          <div className="card__head"><IconChip><CatIcon /></IconChip><span className="card__title">Talep</span><span className="card__meta ml-auto">{catName}</span></div>
          <div className="card__body">
            <div className="kv"><span className="kv__k">Durum</span><span className="kv__v"><Badge tone={requestStatusTone(r.status)}>{r.status_label || requestStatus(r.status)}</Badge></span></div>
            <div className="kv"><span className="kv__k">Öncelik</span><span className="kv__v"><Badge tone={priorityTone(r.priority)}>{requestPriority(r.priority)}</Badge></span></div>
            <div className="kv"><span className="kv__k">Bildiren</span><span className="kv__v">{r.reporter_name ?? r.created_by_name ? <span className="cell-person" style={{ justifyContent: "flex-end" }}><Avatar name={r.reporter_name ?? r.created_by_name} size="sm" soft /><span>{r.reporter_name ?? r.created_by_name}</span></span> : "—"}</span></div>
            <div className="kv"><span className="kv__k">Departman</span><span className="kv__v"><DepartmentAssign requestId={r.id} current={r.department_id ?? null} currentName={r.department_name} canAssign={can(P.requestsAssign)} /></span></div>
            <div className="kv"><span className="kv__k">Atanan</span><span className="kv__v">{r.assigned_to ? <span className="cell-person" style={{ justifyContent: "flex-end" }}><Avatar name={r.assigned_to} size="sm" soft /><span>{r.assigned_to}</span></span> : "—"}</span></div>
            {r.due_at && <div className="kv"><span className="kv__k">Hedef</span><span className="kv__v">{formatDateTime(r.due_at)}</span></div>}
            <SlaCard s={r.sla} />
            {r.resolution && <div className="kv"><span className="kv__k">Çözüm</span><span className="kv__v">{r.resolution}</span></div>}
            {r.description && <p className="mt-4 mb-0" style={{ whiteSpace: "pre-wrap" }}>{r.description}</p>}
          </div>
        </div>

        <div className="stack">
          {work && r.allowed_transitions.length > 0 && <StatusForm key={`${r.status}-${r.allowed_transitions.join()}`} r={r} />}
          {can(P.requestsAssign) && !["closed", "cancelled"].includes(r.status) && <AssignForm r={r} />}
        </div>
      </div>

      <MergeCard r={r} />
      <ExtrasCard r={r} />
      {work && <InternalNotes id={r.id} />}

      <div className="card">
        <div className="card__head"><span className="card__icon card__icon--accent"><MessageSquare aria-hidden="true" /></span><span className="card__title">Geçmiş ve yanıtlar</span><span className="card__meta ml-auto">{r.events.length} hareket</span></div>
        <div className="card__body stack" style={{ gap: "var(--s-4)" }}>
          <ul className="timeline">
            {r.events.map((e) => (
              <li key={e.id} className="is-done">
                <div className="timeline__title">
                  {requestEvent(e.kind)}
                  {e.new_status && requestEvent(e.kind) !== requestStatus(e.new_status) && <> → <Badge tone={requestStatusTone(e.new_status)}>{requestStatus(e.new_status)}</Badge></>}
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

/** Talebin durumu, önceliği, SLA'sı ve hareket sayısı. Kaynak: talep ayrıntısı (SLA içinde gelir). */
function DetailKpis({ r }: { r: Detail }) {
  const s = r.sla;
  const ageH = Math.max(0, Math.round((Date.now() - new Date(r.created_at).getTime()) / 3_600_000));
  const age = ageH >= 48 ? `${Math.floor(ageH / 24)} gün` : `${ageH} saat`;
  const statusTone = requestStatusTone(r.status);
  return (
    <div className="grid grid--kpi rise">
      <Kpi label="Durum" tone={statusTone === "danger" ? "danger" : statusTone === "warn" ? "warn" : statusTone === "ok" ? "ok" : "accent"} icon={<CircleDot aria-hidden="true" />} value={r.status_label || requestStatus(r.status)} small note={r.assigned_to ? `atanan: ${r.assigned_to}` : "henüz atanmadı"} />
      <Kpi label="Öncelik" tone={r.priority === "urgent" ? "danger" : r.priority === "high" ? "warn" : undefined} icon={<Flag aria-hidden="true" />} value={requestPriority(r.priority)} small note={r.category_name || requestCategory(r.category)} />
      <Kpi label="SLA" tone={s ? (slaTone(s.state) === "ok" ? "ok" : slaTone(s.state) === "warn" ? "warn" : "danger") : undefined} icon={<Timer aria-hidden="true" />} value={s ? slaState(s.state) : "—"} small note={s ? `hedef ${s.target_hours} sa · ${formatDateTime(s.due_at)}` : "bu talep için SLA yok"} />
      <Kpi label="Açık kalma" icon={<History aria-hidden="true" />} value={age} small note={`${r.events.length} hareket`} />
    </div>
  );
}

/** Yalnız dokümandaki akışta izin verilen geçişler (backend `allowed_transitions`, K18). */
function StatusForm({ r }: { r: Detail }) {
  // Backend geçişleri sırasız (küme) döner: akış sırasına diz, varsayılan "İptal" değil bir sonraki adım olsun.
  const options = [...r.allowed_transitions].sort((a, b) => REQUEST_STATUSES.indexOf(a) - REQUEST_STATUSES.indexOf(b));
  const [status, setStatus] = useState<Detail["status"]>(options.find((x) => x !== "cancelled") ?? options[0] ?? r.status);
  const [resolution, setResolution] = useState("");
  const [err, setErr] = useState<string>();
  const m = useSiteMutation<{ status: string; resolution: string | null }, Detail>("POST", `/requests/${r.id}/status`, { onSuccess: () => setResolution("") });
  function submit(e: FormEvent) {
    e.preventDefault();
    if (NEEDS_RESOLUTION.has(status) && !resolution.trim()) return setErr(status === "cancelled" ? "İptal için gerekçe yazın." : "Çözüldü için çözüm notu zorunlu.");
    setErr(undefined);
    m.mutate({ status, resolution: NEEDS_RESOLUTION.has(status) ? resolution.trim() || null : null });
  }
  return (
    <form className="card" onSubmit={submit} noValidate>
      <div className="card__head"><span className="card__icon card__icon--accent"><ListChecks aria-hidden="true" /></span><span className="card__title">Durumu değiştir</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        <Field label="Yeni durum">
          {(p) => <select {...p} className="field__input" value={status} onChange={(e) => setStatus(e.target.value as Detail["status"])}>{options.map((x) => <option key={x} value={x}>{requestStatus(x)}</option>)}</select>}
        </Field>
        {r.status === "resolved" && r.channel === "resident" && <p className="small muted mb-0">Sakin onayı bekleniyor; talep sakin onaylayınca ya da yanıt gelmezse kendiliğinden kapanır.</p>}
        {/* Not yalnız Çözüldü (çözüm) ve İptal (gerekçe) için saklanır; diğer geçişlerde alan gösterilmez —
            ara not için "Yorum" ya da "İç not" kullanılır. */}
        {NEEDS_RESOLUTION.has(status) ? (
          <Field label={status === "cancelled" ? "İptal gerekçesi" : "Çözüm notu"} required error={err ?? fieldError(m.error, "resolution")}>
            {(p) => <textarea {...p} className="field__input" rows={2} value={resolution} onChange={(e) => setResolution(e.target.value)} />}
          </Field>
        ) : <p className="small muted mb-0">Ara bilgi için aşağıdaki yorum ya da iç not alanını kullanın.</p>}
      </div>
      <div className="card__foot"><SubmitButton busy={m.isPending} className="btn btn--primary" disabled={status === r.status}>Kaydet</SubmitButton></div>
    </form>
  );
}

type Assignable = Schemas["AssignableOut"];

/**
 * Atama: varsayılan personel seçimi (`assignee_id`) — yalnız böyle atanan talep personelin listesine düşer.
 * Firma / dış servis ikinci seçenek (`assignee`, serbest metin); hiçbir personelin listesine düşmez.
 */
function AssignForm({ r }: { r: Detail }) {
  const staff = useSiteGet<Assignable[]>("/requests/assignable-staff");
  const byFirm = !r.assignee_id && !!r.assigned_to;
  const [mode, setMode] = useState<"staff" | "firm">(byFirm ? "firm" : "staff");
  const [staffId, setStaffId] = useState(r.assignee_id ?? "");
  const [firm, setFirm] = useState(byFirm ? r.assigned_to ?? "" : "");
  const m = useSiteMutation<Schemas["AssignIn"], Detail>("POST", `/requests/${r.id}/assign`);
  const list = staff.data ?? [];
  const unchanged = mode === "staff" ? !staffId || staffId === r.assignee_id : firm.trim().length < 2 || (byFirm && firm.trim() === r.assigned_to);
  function submit(e: FormEvent) {
    e.preventDefault();
    m.mutate(mode === "staff" ? { assignee_id: staffId } : { assignee: firm.trim() });
  }
  return (
    <form className="card" noValidate onSubmit={submit}>
      <div className="card__head"><span className="card__icon card__icon--accent"><UserCheck aria-hidden="true" /></span><span className="card__title">Ata</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        {mode === "staff" ? (
          <>
            <Field label="Personel" hint="Talep seçilen kişinin talep listesine düşer ve kendisine bildirim gider." error={fieldError(m.error, "assignee_id")}>
              {(p) => (
                <select {...p} className="field__input" value={staffId} disabled={staff.isPending || list.length === 0} onChange={(e) => setStaffId(e.target.value)}>
                  <option value="">{staff.isPending ? "Yükleniyor…" : "Personel seçin"}</option>
                  {list.map((x) => <option key={x.id} value={x.id}>{x.full_name}{x.roles.length > 0 && ` · ${x.roles.join(", ")}`}</option>)}
                </select>
              )}
            </Field>
            {staff.isError && <p className="small mb-0" role="alert">Personel listesi alınamadı. Sayfayı yenileyin ya da firma adıyla atayın.</p>}
            {staff.data && list.length === 0 && <p className="small muted mb-0">Bu sitede talep işleyebilen personel yok. Site kullanıcılarından teknik personel ekleyin ya da firma adıyla atayın.</p>}
            <div><button type="button" className="btn btn--ghost btn--sm" onClick={() => setMode("firm")}>Firmaya ya da dış servise ata</button></div>
          </>
        ) : (
          <>
            <Field label="Firma ya da dış servis" required hint="Firmaya atanan talep hiçbir personelin listesine düşmez; takibi siz yaparsınız." error={fieldError(m.error, "assignee")}>
              {(p) => <input {...p} className="field__input" maxLength={120} value={firm} onChange={(e) => setFirm(e.target.value)} placeholder="ör. Asansör Servis A.Ş." />}
            </Field>
            <div><button type="button" className="btn btn--ghost btn--sm" onClick={() => setMode("staff")}>Personel listesinden seç</button></div>
          </>
        )}
      </div>
      <div className="card__foot"><SubmitButton busy={m.isPending} className="btn" disabled={unchanged}>Ata</SubmitButton></div>
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
