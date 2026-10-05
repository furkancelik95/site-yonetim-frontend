import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import { CalendarDays, Plus, Printer, Trash2 } from "lucide-react";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { Page } from "../../api/types";
import { MockBadge } from "../../components/MockBadge";
import { Alert, Badge, ConfirmButton, Empty, ErrorState, Field, FormError, Loading, PageHead, Pager, SubmitButton, fieldError } from "../../components/ui";
import { formatDate, formatDateTime } from "../../lib/format";
import { useUrlState } from "../../lib/hooks";
import { agendaResult, agendaResultTone, meetingKind, meetingStatus, meetingStatusTone } from "../../lib/labels";
import { P, useSite } from "../../site/SiteContext";

/** Servis isteği 14'teki şekiller. */
interface AgendaItem {
  id: string; order: number; title: string; decision: string | null; result: "accepted" | "rejected" | "postponed" | "info" | null;
  votes_for: number | null; votes_against: number | null; votes_abstain: number | null;
}
interface Meeting {
  id: string; number: number; kind: "general_ordinary" | "general_extraordinary" | "board"; title: string; scheduled_at: string; location: string;
  status: "planned" | "held" | "cancelled"; agenda: AgendaItem[]; attendance_note: string | null; held_at: string | null;
  cancel_reason: string | null; created_by: string; created_at: string;
}

const KINDS = ["general_ordinary", "general_extraordinary", "board"] as const;
const RESULTS = ["accepted", "rejected", "postponed", "info"] as const;
const daysFromNow = (iso: string) => Math.ceil((new Date(iso).getTime() - Date.now()) / 864e5);

/** Toplantılar ve genel kurul (Apsiyon "Toplantılar"): planla, gündem, karar, tutanak. */
export function MeetingsPage() {
  const { site, can } = useSite();
  const [s, set] = useUrlState({ durum: "", page: "1" });
  const q = useSiteGet<Page<Meeting>>("/meetings", { status: s.durum || undefined, page: s.page, page_size: 30 });
  const [adding, setAdding] = useState(false);
  const manage = can(P.announcementsPublish);
  return (
    <div className="stack">
      <PageHead
        title="Toplantılar"
        subtitle="Genel kurul ve yönetim kurulu toplantıları: gündem, kararlar, tutanak."
        actions={<><MockBadge request="14" />{manage && <button className="btn btn--primary" type="button" aria-expanded={adding} onClick={() => setAdding((v) => !v)}><Plus aria-hidden="true" /> Toplantı planla</button>}</>}
      />
      {adding && <NewMeeting onDone={() => setAdding(false)} />}

      <div className="row" role="tablist" aria-label="Toplantı durumu" style={{ gap: "var(--s-2)" }}>
        {[["", "Tümü"], ["planned", "Planlanan"], ["held", "Yapılan"], ["cancelled", "İptal"]].map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={s.durum === k} className={`btn btn--sm${s.durum === k ? " btn--primary" : ""}`} onClick={() => set({ durum: k!, page: "1" })}>{l}</button>
        ))}
      </div>

      <div className="card">
        <div className="card__body card__body--flush">
          {q.isPending ? <Loading /> : q.isError ? <div className="card__body"><ErrorState error={q.error} /></div> : q.data.items.length === 0 ? (
            <Empty title="Toplantı yok" icon={<CalendarDays aria-hidden="true" />}>Olağan genel kurul yılda en az bir kez yapılır. İlk toplantıyı planlayarak başlayın.</Empty>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <caption className="visually-hidden">Toplantılar</caption>
                <thead><tr><th scope="col">Toplantı</th><th scope="col">Tarih</th><th scope="col">Yer</th><th scope="col">Gündem</th><th scope="col">Durum</th></tr></thead>
                <tbody>
                  {q.data.items.map((m) => (
                    <tr key={m.id}>
                      <td><Link className="cell-main" to={`/s/${site.slug}/toplantilar/${m.id}`}>{m.title}</Link><div className="cell-sub">{meetingKind(m.kind)} · #{m.number}</div></td>
                      <td className="small nowrap">{formatDateTime(m.scheduled_at)}</td>
                      <td className="small">{m.location}</td>
                      <td className="small nowrap">{m.agenda.length} madde</td>
                      <td><Badge tone={meetingStatusTone(m.status)}>{meetingStatus(m.status)}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {q.data && q.data.total > q.data.page_size && <div className="card__foot"><Pager page={q.data.page} pageSize={q.data.page_size} total={q.data.total} onPage={(p) => set({ page: String(p) })} /></div>}
      </div>
    </div>
  );
}

function NewMeeting({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ kind: "general_ordinary", title: "", scheduled_at: "", location: "" });
  const [agenda, setAgenda] = useState<string[]>(["Açılış ve divan heyetinin seçimi", ""]);
  const m = useSiteMutation<Record<string, unknown>, Meeting>("POST", "/meetings", { onSuccess: onDone });
  const general = f.kind !== "board";
  const days = f.scheduled_at ? daysFromNow(f.scheduled_at) : null;

  function submit(e: FormEvent) {
    e.preventDefault();
    m.mutate({ ...f, scheduled_at: f.scheduled_at && !Number.isNaN(Date.parse(f.scheduled_at)) ? new Date(f.scheduled_at).toISOString() : "", agenda: agenda.map((a) => a.trim()).filter(Boolean) });
  }
  return (
    <form className="card" onSubmit={submit} noValidate>
      <div className="card__head"><span className="card__title">Toplantı planla</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        <div className="grid grid--2">
          <Field label="Tür" required error={fieldError(m.error, "kind")}>{(p) => <select {...p} className="field__input" value={f.kind} onChange={(e) => setF((x) => ({ ...x, kind: e.target.value }))}>{KINDS.map((k) => <option key={k} value={k}>{meetingKind(k)}</option>)}</select>}</Field>
          <Field label="Başlık" required error={fieldError(m.error, "title")}>{(p) => <input {...p} className="field__input" placeholder="ör. 2026 olağan genel kurulu" value={f.title} onChange={(e) => setF((x) => ({ ...x, title: e.target.value }))} />}</Field>
          <Field label="Tarih ve saat" required error={fieldError(m.error, "scheduled_at")}>{(p) => <input {...p} className="field__input" type="datetime-local" value={f.scheduled_at} onChange={(e) => setF((x) => ({ ...x, scheduled_at: e.target.value }))} />}</Field>
          <Field label="Yer" required error={fieldError(m.error, "location")}>{(p) => <input {...p} className="field__input" placeholder="ör. Sosyal tesis toplantı salonu" value={f.location} onChange={(e) => setF((x) => ({ ...x, location: e.target.value }))} />}</Field>
        </div>
        {general && days !== null && days < 15 && (
          <Alert tone="warn" title="Çağrı süresi">Genel kurul çağrısı toplantıdan en az 15 gün önce yapılmalı (KMK m.29). Seçilen tarihe {Math.max(days, 0)} gün var.</Alert>
        )}
        <fieldset className="stack" style={{ gap: "var(--s-2)", border: 0, padding: 0, margin: 0 }}>
          <legend className="field__label">Gündem *</legend>
          {agenda.map((a, i) => (
            <div key={i} className="row" style={{ gap: "var(--s-2)", flexWrap: "nowrap" }}>
              <span className="small muted nowrap" aria-hidden="true" style={{ width: "1.5rem" }}>{i + 1}.</span>
              <input aria-label={`${i + 1}. gündem maddesi`} className="field__input" style={{ flex: 1, minWidth: 0 }} value={a} onChange={(e) => setAgenda((x) => x.map((y, j) => (j === i ? e.target.value : y)))} />
              <button className="btn btn--ghost btn--sm" type="button" aria-label={`${i + 1}. maddeyi kaldır`} disabled={agenda.length === 1} onClick={() => setAgenda((x) => x.filter((_, j) => j !== i))}><Trash2 aria-hidden="true" /></button>
            </div>
          ))}
          {fieldError(m.error, "agenda") && <span className="field__error" role="alert">{fieldError(m.error, "agenda")}</span>}
          <div><button className="btn btn--sm" type="button" disabled={agenda.length >= 30} onClick={() => setAgenda((x) => [...x, ""])}><Plus aria-hidden="true" /> Madde ekle</button></div>
        </fieldset>
      </div>
      <div className="card__foot row" style={{ gap: "var(--s-2)" }}>
        <SubmitButton busy={m.isPending}>Planla</SubmitButton>
        <button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button>
      </div>
    </form>
  );
}

/** Toplantı ayrıntısı: kararların girilmesi, iptal, yazdırılabilir tutanak. */
export function MeetingDetailPage() {
  const { meetingId = "" } = useParams();
  const { site, can } = useSite();
  const q = useSiteGet<Meeting>(`/meetings/${meetingId}`);
  const [reason, setReason] = useState("");
  const cancel = useSiteMutation<{ reason: string }, Meeting>("POST", `/meetings/${meetingId}/cancel`);
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} />;
  const m = q.data;
  const manage = can(P.announcementsPublish);
  return (
    <div className="stack">
      <div className="print-hide">
        <PageHead
          title={m.title}
          subtitle={<>{meetingKind(m.kind)} · {formatDateTime(m.scheduled_at)} · {m.location}</>}
          actions={
            <>
              <MockBadge request="14" />
              <Badge tone={meetingStatusTone(m.status)}>{meetingStatus(m.status)}</Badge>
              <Link className="btn" to={`/s/${site.slug}/toplantilar`}>Geri</Link>
              {m.kind !== "board" && <Link className="btn" to={`/s/${site.slug}/belge/hazirun`}>Hazirun listesi</Link>}
              {m.status === "held" && <button className="btn btn--primary" type="button" onClick={() => window.print()}><Printer aria-hidden="true" /> Tutanağı yazdır</button>}
            </>
          }
        />
      </div>

      {m.status === "cancelled" && <Alert tone="info" title="Toplantı iptal edildi">{m.cancel_reason}</Alert>}

      {m.status === "planned" && manage ? (
        <>
          <Decisions m={m} />
          <div className="row print-hide">
            <ConfirmButton className="btn btn--ghost btn--sm" danger title="Toplantıyı iptal et" confirmLabel="İptal et"
              body={<div className="field"><label className="field__label" htmlFor="mt-cancel">Gerekçe *</label><input id="mt-cancel" className="field__input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="ör. Yeter sayı sağlanamadı, yeni tarih duyurulacak" /></div>}
              onConfirm={() => { if (!reason.trim()) throw new Error("Gerekçe zorunlu."); return cancel.mutateAsync({ reason: reason.trim() }); }}>
              Toplantıyı iptal et
            </ConfirmButton>
          </div>
        </>
      ) : (
        <Minutes m={m} siteName={site.name} />
      )}
    </div>
  );
}

type Row = { id: string; result: string; decision: string; votes_for: string; votes_against: string; votes_abstain: string };

function Decisions({ m }: { m: Meeting }) {
  const [attendance, setAttendance] = useState("");
  const [rows, setRows] = useState<Row[]>(m.agenda.map((a) => ({ id: a.id, result: "", decision: "", votes_for: "", votes_against: "", votes_abstain: "" })));
  const save = useSiteMutation<Record<string, unknown>, Meeting>("POST", `/meetings/${m.id}/decisions`);
  const upd = (i: number, k: keyof Row, v: string) => setRows((x) => x.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const num = (v: string) => (v === "" ? null : Number(v));
  const body = () => ({
    attendance_note: attendance.trim(),
    items: rows.map((r) => ({ id: r.id, result: r.result || null, decision: r.decision.trim() || null, votes_for: num(r.votes_for), votes_against: num(r.votes_against), votes_abstain: num(r.votes_abstain) })),
  });
  const digits = (v: string) => v.replace(/\D/g, "").slice(0, 5);
  return (
    <div className="card">
      <div className="card__head"><span className="card__title">Toplantı sonucu</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-4)" }}>
        <p className="small muted mb-0">Toplantı yapıldıktan sonra her gündem maddesinin sonucunu ve karar metnini girin. Kaydedince kayıt kilitlenir ve tutanak yazdırılabilir.</p>
        <FormError error={save.error} />
        <Field label="Katılım" required hint="ör. 48 bağımsız bölümden 31'i katıldı veya vekille temsil edildi" error={fieldError(save.error, "attendance_note")}>
          {(p) => <input {...p} className="field__input" value={attendance} onChange={(e) => setAttendance(e.target.value)} />}
        </Field>
        {m.agenda.map((a, i) => (
          <fieldset key={a.id} className="stack" style={{ gap: "var(--s-2)", border: "1px solid var(--line)", borderRadius: "var(--r-md)", padding: "var(--s-3)", margin: 0 }}>
            <legend className="strong" style={{ padding: "0 var(--s-1)" }}>{a.order}. {a.title}</legend>
            <div className="grid grid--kpi">
              <Field label="Sonuç" required>{(p) => <select {...p} className="field__input" value={rows[i]!.result} onChange={(e) => upd(i, "result", e.target.value)}><option value="">Seçin</option>{RESULTS.map((r) => <option key={r} value={r}>{agendaResult(r)}</option>)}</select>}</Field>
              <Field label="Kabul oyu">{(p) => <input {...p} className="field__input" inputMode="numeric" value={rows[i]!.votes_for} onChange={(e) => upd(i, "votes_for", digits(e.target.value))} />}</Field>
              <Field label="Ret oyu">{(p) => <input {...p} className="field__input" inputMode="numeric" value={rows[i]!.votes_against} onChange={(e) => upd(i, "votes_against", digits(e.target.value))} />}</Field>
              <Field label="Çekimser">{(p) => <input {...p} className="field__input" inputMode="numeric" value={rows[i]!.votes_abstain} onChange={(e) => upd(i, "votes_abstain", digits(e.target.value))} />}</Field>
            </div>
            <Field label="Karar metni" required={rows[i]!.result !== "info"} error={fieldError(save.error, `items.${a.order}`)}>
              {(p) => <textarea {...p} className="field__input" rows={2} value={rows[i]!.decision} onChange={(e) => upd(i, "decision", e.target.value)} />}
            </Field>
          </fieldset>
        ))}
      </div>
      <div className="card__foot">
        <ConfirmButton className="btn btn--primary" title="Kararları kaydet" confirmLabel="Kaydet ve kilitle" body="Toplantı yapıldı olarak işaretlenir. Kararlar bundan sonra değiştirilemez; düzeltme ancak yeni bir toplantı kararıyla yapılır."
          onConfirm={() => save.mutateAsync(body())}>
          Kararları kaydet
        </ConfirmButton>
      </div>
    </div>
  );
}

function Minutes({ m, siteName }: { m: Meeting; siteName: string }) {
  const votes = (a: AgendaItem) => [a.votes_for != null && `${a.votes_for} kabul`, a.votes_against != null && `${a.votes_against} ret`, a.votes_abstain != null && `${a.votes_abstain} çekimser`].filter(Boolean).join(", ");
  return (
    <article className="card doc-print" aria-label="Toplantı tutanağı">
      <div className="card__body stack" style={{ gap: "var(--s-4)", lineHeight: 1.7 }}>
        <header className="stack" style={{ gap: "var(--s-1)", textAlign: "center" }}>
          <div className="strong">{siteName}</div>
          <h1 style={{ margin: 0, fontSize: "1.25rem" }}>{m.status === "held" ? `${meetingKind(m.kind)} toplantı tutanağı` : `${meetingKind(m.kind)} gündemi`}</h1>
          <div className="small">{formatDateTime(m.scheduled_at)} · {m.location}</div>
        </header>
        {m.attendance_note && <p className="mb-0"><strong>Katılım:</strong> {m.attendance_note}</p>}
        <ol className="stack" style={{ gap: "var(--s-3)", paddingLeft: "1.25rem", margin: 0 }}>
          {m.agenda.map((a) => (
            <li key={a.id}>
              <div className="strong">{a.title}</div>
              {a.result && (
                <div className="small">
                  <Badge tone={agendaResultTone(a.result)}>{agendaResult(a.result)}</Badge>{votes(a) && <> · {votes(a)}</>}
                </div>
              )}
              {a.decision && <p className="mb-0">{a.decision}</p>}
            </li>
          ))}
        </ol>
        {m.status === "held" && (
          <>
            <p className="small muted mb-0">Tutanak {m.held_at ? formatDate(m.held_at) : ""} tarihinde sisteme kaydedilmiştir. Kararların karar defterine geçirilip imzalanması gerekir.</p>
            <div className="grid grid--2" style={{ marginTop: "var(--s-5)" }}>
              {["Divan başkanı", "Yazman", "Oy toplayıcı"].map((r) => <div key={r} className="small" style={{ borderTop: "1px solid var(--line)", paddingTop: "var(--s-2)" }}>{r}<br />Ad soyad / imza</div>)}
            </div>
          </>
        )}
      </div>
    </article>
  );
}
