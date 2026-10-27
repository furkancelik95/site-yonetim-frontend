import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import { CheckCircle2, History as HistoryIcon, Inbox, Send, UserCheck } from "lucide-react";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { Page, Schemas } from "../../api/types";
import { Donut } from "../../components/charts";
import { Alert, Avatar, Badge, ConfirmButton, Empty, ErrorState, Field, FormError, Kpi, Loading, PageHead, Pager, Segmented, SubmitButton, fieldError } from "../../components/ui";
import { formatDateTime, formatMoney, todayIso } from "../../lib/format";
import { useUrlState } from "../../lib/hooks";
import { RuleForm } from "./ApprovalRulesPage";
import { approvalStatus, approvalStatusTone, decisionLabel, decisionTone, delegationState, delegationStateTone } from "../../lib/labels";
import { P, useSite } from "../../site/SiteContext";

type ListItem = Schemas["RequestListItem"];
type Request = Schemas["ApprovalRequestOut"];
type Delegation = Schemas["DelegationOut"];
type Candidate = Schemas["CandidateOut"];

const TABS = [
  { key: "bekleyen", api: "pending", label: "Kararımı bekleyen" },
  { key: "benim", api: "mine", label: "Benim taleplerim" },
  { key: "gecmis", api: "history", label: "Geçmiş" },
  { key: "devir", api: "", label: "Yetki devri" },
] as const;

/**
 * Onay kutusu (ONY-02): kararımı bekleyen talepler, kendi taleplerim, geçmiş; yetki devri (ONY-03).
 * Onaycı olmak rol atamasından gelir, ayrı izin gerekmez. Şu an onaydan geçen tek işlem
 * "onay kuralı değişikliği"; diğer akışlar bağlandıkça buraya düşer (backend K21).
 */
export function ApprovalsPage() {
  const { can, site } = useSite();
  const [s, set] = useUrlState({ sekme: "bekleyen", page: "1" });
  const tab = TABS.find((t) => t.key === s.sekme) ?? TABS[0];
  // Üst sayılar: her kutunun toplamı (sayfa boyutu 1 — yalnız `total` okunur, liste indirilmez)
  const pending = useSiteGet<Page<ListItem>>("/approvals", { tab: "pending", page_size: 1 });
  const mine = useSiteGet<Page<ListItem>>("/approvals", { tab: "mine", page_size: 1 });
  const past = useSiteGet<Page<ListItem>>("/approvals", { tab: "history", page_size: 1 });
  const total = (q: typeof pending) => (q.data ? q.data.total : "—");
  return (
    <div className="stack">
      <PageHead
        band
        title="Onaylar"
        subtitle="Onayınıza gelen işlemler ve sizin onaya gönderdikleriniz. Karar için ayrı izin gerekmez; onaycı listesinde olmanız yeter."
        actions={can(P.approvalRulesRead) && <Link className="btn" to={`/s/${site.slug}/onay-kurallari`}>Onay kuralları</Link>}
      />
      <div className="grid grid--kpi rise">
        <Kpi label="Kararımı bekleyen" tone={pending.data && pending.data.total > 0 ? "warn" : undefined} icon={<Inbox aria-hidden="true" />} value={total(pending)} note="sizden karar bekleyen talep" />
        <Kpi label="Benim taleplerim" icon={<Send aria-hidden="true" />} value={total(mine)} note="onaya gönderdikleriniz" />
        <Kpi label="Sonuçlanan" icon={<HistoryIcon aria-hidden="true" />} value={total(past)} note="geçmiş kararlar" />
      </div>
      <Segmented label="Onay bölümleri" value={tab.key} onChange={(k) => set({ sekme: k, page: "1" })} options={TABS.map((t) => ({ value: t.key, label: t.label }))} />
      {tab.key === "devir" ? <Delegations /> : <RequestList tab={tab.api} page={s.page} onPage={(p) => set({ page: String(p) })} empty={tab.key === "bekleyen" ? "Kararınızı bekleyen talep yok" : "Kayıt yok"} />}
    </div>
  );
}

const DONUT_TONES = ["ok", "warn", "danger", "info", "muted"] as const;
type DonutTone = (typeof DONUT_TONES)[number];
const donutTone = (t: string): DonutTone => (DONUT_TONES as readonly string[]).includes(t) ? (t as DonutTone) : "muted";

function RequestList({ tab, page, onPage, empty }: { tab: string; page: string; onPage: (p: number) => void; empty: string }) {
  const { site } = useSite();
  const q = useSiteGet<Page<ListItem>>("/approvals", { tab, page, page_size: 30 });
  // Listelenen taleplerin durum dağılımı (bu sayfadaki kayıtlar) — gerçek sayılar
  const dist = q.data
    ? Object.entries(q.data.items.reduce<Record<string, number>>((acc, r) => { acc[r.status] = (acc[r.status] ?? 0) + 1; return acc; }, {}))
    : [];
  const list = (
    <div className="card">
      <div className="card__body card__body--flush">
        {q.isPending ? <Loading /> : q.isError ? <div className="card__body"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div> : q.data.items.length === 0 ? (
          <Empty title={empty} icon={<Inbox aria-hidden="true" />}>Şu an onaydan geçen tek işlem onay kuralı değişikliği; kayıt başvurusu, iade ve tahakkuk bağlandıkça burada görünecek.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <caption className="visually-hidden">Onay talepleri</caption>
              <thead><tr><th scope="col">Talep</th><th scope="col">İşlem</th><th scope="col" className="right">Tutar</th><th scope="col">İlerleme</th><th scope="col">Durum</th></tr></thead>
              <tbody>
                {q.data.items.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div className="cell-person">
                        <Avatar name={r.requested_by} size="sm" soft />
                        <div>
                          <Link className="cell-main" to={`/s/${site.slug}/onaylar/${r.id}`}>#{r.number} {r.title}</Link>
                          <div className="cell-sub">{r.requested_by} · {formatDateTime(r.created_at)}</div>
                        </div>
                      </div>
                    </td>
                    <td className="small">{r.action_label}{r.post_approval && <div className="cell-sub">Sonradan onay</div>}</td>
                    <td className="right nowrap">{r.amount ? formatMoney(r.amount) : "—"}</td>
                    <td className="small nowrap">{r.progress}{r.escalated && <div><Badge tone="warn">Üst role iletildi</Badge></div>}</td>
                    <td><Badge tone={approvalStatusTone(r.status)}>{approvalStatus(r.status)}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {q.data && q.data.total > q.data.page_size && <div className="card__foot"><Pager page={q.data.page} pageSize={q.data.page_size} total={q.data.total} onPage={onPage} /></div>}
    </div>
  );
  if (dist.length === 0) return list;
  return (
    <div className="grid grid--main">
      {list}
      <div className="card">
        <div className="card__head"><span className="card__icon card__icon--accent"><CheckCircle2 aria-hidden="true" /></span><span className="card__title">Durum dağılımı</span><span className="card__meta ml-auto">bu sayfadaki {q.data?.items.length ?? 0} talep</span></div>
        <div className="card__body">
          <Donut label="Onay talebi durumları" centerSub="talep" segments={dist.map(([k, v]) => ({ label: approvalStatus(k), value: v, tone: donutTone(approvalStatusTone(k)) }))} />
        </div>
      </div>
    </div>
  );
}

/** Yetki devri (ONY-03): kendi rolümü aynı roldeki birine, süreli; zincirleme yok. */
function Delegations() {
  const q = useSiteGet<Delegation[]>("/delegations");
  const [adding, setAdding] = useState(false);
  return (
    <>
      <div className="row row--between" style={{ gap: "var(--s-2)" }}>
        <p className="small muted mb-0">İzindeyken onaylarınızı aynı roldeki birine devredebilirsiniz. Devralan kişi sizin adınıza karar verir; kararlar "vekâleten" diye kaydedilir. Kendi talebinizi devralan onaylayamaz.</p>
        <button className="btn btn--primary" type="button" aria-expanded={adding} onClick={() => setAdding((v) => !v)}><UserCheck aria-hidden="true" /> Yetki devret</button>
      </div>
      {adding && <NewDelegation onDone={() => setAdding(false)} />}
      <div className="card">
        <div className="card__body card__body--flush">
          {q.isPending ? <Loading /> : q.isError ? <div className="card__body"><ErrorState error={q.error} /></div> : q.data.length === 0 ? (
            <Empty title="Yetki devri yok" />
          ) : (
            <div className="table-wrap">
              <table className="data">
                <caption className="visually-hidden">Yetki devirleri</caption>
                <thead><tr><th scope="col">Devir</th><th scope="col">Rol</th><th scope="col">Süre</th><th scope="col">Durum</th><th scope="col"><span className="visually-hidden">İşlem</span></th></tr></thead>
                <tbody>
                  {q.data.map((d) => (
                    <tr key={d.id}>
                      <td>
                        <div className="cell-main">{d.direction === "given" ? `${d.to_name} kişisine verdim` : `${d.from_name} kişisinden aldım`}</div>
                        {d.note && <div className="cell-sub">{d.note}</div>}
                      </td>
                      <td className="small">{d.roles.join(", ")}</td>
                      <td className="small nowrap">{formatDateTime(d.starts_at)} – {formatDateTime(d.ended_at ?? d.ends_at)}</td>
                      <td><Badge tone={delegationStateTone(d.state)}>{delegationState(d.state)}</Badge></td>
                      <td className="right">{d.direction === "given" && d.state !== "ended" && <EndDelegation d={d} />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function EndDelegation({ d }: { d: Delegation }) {
  const m = useSiteMutation<Record<string, never>, Delegation>("POST", `/delegations/${d.id}/end`);
  return <ConfirmButton className="btn btn--ghost btn--sm" title="Yetki devrini bitir" confirmLabel="Bitir" body={`${d.to_name} artık sizin adınıza karar veremez.`} onConfirm={() => m.mutateAsync({})}>Bitir</ConfirmButton>;
}

const toIso = (local: string) => (local && !Number.isNaN(Date.parse(local)) ? new Date(local).toISOString() : "");

function NewDelegation({ onDone }: { onDone: () => void }) {
  const { site } = useSite();
  const cands = useSiteGet<Candidate[]>("/delegations/candidates");
  const [f, setF] = useState({ to_user_id: "", starts_at: "", ends_at: "", note: "" });
  const m = useSiteMutation<Record<string, unknown>, Delegation>("POST", "/delegations", { onSuccess: onDone });
  function submit(e: FormEvent) {
    e.preventDefault();
    m.mutate({ to_user_id: f.to_user_id, roles: [site.role], starts_at: toIso(f.starts_at), ends_at: toIso(f.ends_at), note: f.note.trim() || null });
  }
  const none = cands.data && cands.data.length === 0;
  return (
    <form className="card" onSubmit={submit} noValidate>
      <div className="card__head"><span className="card__title">Yetki devret</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        {none ? (
          <Alert tone="info">Sitede sizinle aynı rolde ({site.role}) başka etkin kullanıcı yok; yetki yalnız aynı role devredilebilir.</Alert>
        ) : (
          <div className="grid grid--kpi">
            <Field label="Devralacak kişi" required error={fieldError(m.error, "to_user_id")}>
              {(p) => <select {...p} className="field__input" value={f.to_user_id} onChange={(e) => setF((x) => ({ ...x, to_user_id: e.target.value }))}><option value="">Seçin</option>{cands.data?.map((c) => <option key={c.user_id} value={c.user_id}>{c.name} · {c.role}</option>)}</select>}
            </Field>
            <Field label="Başlangıç" required error={fieldError(m.error, "starts_at")}>{(p) => <input {...p} className="field__input" type="datetime-local" min={`${todayIso()}T00:00`} value={f.starts_at} onChange={(e) => setF((x) => ({ ...x, starts_at: e.target.value }))} />}</Field>
            <Field label="Bitiş" required error={fieldError(m.error, "ends_at")}>{(p) => <input {...p} className="field__input" type="datetime-local" min={f.starts_at || undefined} value={f.ends_at} onChange={(e) => setF((x) => ({ ...x, ends_at: e.target.value }))} />}</Field>
            <Field label="Not" hint="ör. Yıllık izin">{(p) => <input {...p} className="field__input" maxLength={200} value={f.note} onChange={(e) => setF((x) => ({ ...x, note: e.target.value }))} />}</Field>
          </div>
        )}
      </div>
      <div className="card__foot row" style={{ gap: "var(--s-2)" }}>
        {!none && <SubmitButton busy={m.isPending} disabled={!f.to_user_id || !f.starts_at || !f.ends_at}>Devret</SubmitButton>}
        <button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button>
      </div>
    </form>
  );
}

/** Onay talebi ayrıntısı: adımlar, onaycılar, geçmiş; karar (onay / ret / düzeltme), geri çekme, yeniden gönderme. */
export function ApprovalDetailPage() {
  const { requestId = "" } = useParams();
  const { site } = useSite();
  const q = useSiteGet<Request>(`/approvals/${requestId}`);
  const [fixing, setFixing] = useState(false);
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const r = q.data;
  const warnings = Array.isArray(r.summary?.warnings) ? (r.summary.warnings as string[]) : [];
  return (
    <div className="stack">
      <PageHead
        title={`#${r.number} ${r.title}`}
        subtitle={<>{r.action_label} · {r.requested_by} · {formatDateTime(r.created_at)}{r.revision > 1 ? ` · ${r.revision}. sürüm` : ""}</>}
        actions={<><Badge tone={approvalStatusTone(r.status)}>{approvalStatus(r.status)}</Badge><Link className="btn" to={`/s/${site.slug}/onaylar`}>Geri</Link></>}
      />
      {r.acting_for && <Alert tone="info" title="Vekâleten">Bu talepte {r.acting_for} adına karar veriyorsunuz; kararınız "vekâleten" diye kaydedilir.</Alert>}
      {r.status === "execution_failed" && <Alert tone="danger" title="Onaylandı ama uygulanamadı">{r.failure_reason ?? "İşlem onaydan sonra yürütülemedi."}</Alert>}
      {r.escalated && <Alert tone="warn">Süresinde karar verilmediği için üst role iletildi.</Alert>}
      {warnings.length > 0 && <Alert tone="warn" title="Uyarılar"><ul className="mb-0">{warnings.map((w) => <li key={w}>{w}</li>)}</ul></Alert>}

      <div className="grid grid--2">
        <div className="card">
          <div className="card__head"><span className="card__title">Onay adımları</span><span className="card__meta ml-auto">{r.progress}</span></div>
          <div className="card__body">
            <ol className="steps">
              {r.steps.map((st) => (
                <li key={st.index} className={`steps__item steps__item--${st.status}`} aria-current={st.status === "open" ? "step" : undefined}>
                  <div className="row row--between" style={{ gap: "var(--s-2)" }}>
                    <span className="strong">{st.index + 1}. adım · {st.roles.join(", ")}</span>
                    <Badge tone={st.status === "approved" ? "ok" : st.status === "rejected" ? "danger" : st.status === "open" ? "warn" : "muted"}>
                      {st.status === "approved" ? "Tamamlandı" : st.status === "rejected" ? "Reddedildi" : st.status === "open" ? "Karar bekliyor" : "Sırada"}
                    </Badge>
                  </div>
                  <div className="small muted">
                    {st.required != null && st.eligible != null ? `${st.eligible} kişiden ${st.required} onay gerekli` : ""} · {st.approvals} onay, {st.rejections} ret
                  </div>
                  {st.quorum_unreachable && <div className="field__error">Bu adımda yeterli onay artık sağlanamaz.</div>}
                  <ul className="steps__people">
                    {st.approvers.map((a) => (
                      <li key={a.user_id}>
                        <span className="cell-person"><Avatar name={a.name} size="sm" soft /><span>{a.name} <span className="muted">({a.role}{a.source === "escalation" ? ", üst role iletildi" : ""})</span></span></span>
                        {a.decision ? <Badge tone={decisionTone(a.decision)}>{decisionLabel(a.decision)}</Badge> : <span className="small muted">Bekleniyor</span>}
                        {a.comment && <div className="small">"{a.comment}"{a.decided_by && a.decided_by !== a.name ? ` — ${a.decided_by} vekâleten` : ""}</div>}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="stack">
          <Actions r={r} onFixRule={() => setFixing(true)} />
          <div className="card">
            <div className="card__head"><span className="card__title">Geçmiş</span></div>
            <div className="card__body">
              {r.history.length === 0 ? <span className="small muted">Henüz karar yok.</span> : (
                <ul className="stack small" style={{ gap: "var(--s-2)", listStyle: "none", padding: 0, margin: 0 }}>
                  {r.history.map((h, i) => (
                    <li key={i}>
                      <Badge tone={decisionTone(h.decision)}>{decisionLabel(h.decision)}</Badge> {h.user_name}{h.on_behalf_of ? ` (${h.on_behalf_of} adına)` : ""} · {h.step_index + 1}. adım · {formatDateTime(h.at)}{r.revision > 1 ? ` · ${h.revision}. sürüm` : ""}
                      {h.comment && <div>"{h.comment}"</div>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
      {fixing && r.can_resubmit && <ResubmitRule r={r} onDone={() => setFixing(false)} />}
    </div>
  );
}

/** Kural değişikliği talebi: düzeltilmiş kural formla gönderilir (backend `rule` zorunlu ister). */
function ResubmitRule({ r, onDone }: { r: Request; onDone: () => void }) {
  const types = useSiteGet<Schemas["ActionTypeOut"][]>("/approval-action-types");
  if (types.isPending) return <Loading />;
  if (types.isError) return <ErrorState error={types.error} />;
  // Form, talebin önerdiği kuralın son sürümüyle dolu gelir (backend #65: rule_change.rule); yoksa boş
  const proposed = r.rule_change?.rule ?? undefined;
  return <RuleForm rule={null} initial={proposed} types={types.data} actionType={proposed?.action_type} resubmitId={r.id} onDone={onDone} />;
}

function Actions({ r, onFixRule }: { r: Request; onFixRule: () => void }) {
  const base = `/approvals/${r.id}`;
  // Kural değişikliğinde yeniden gönderim düzeltilmiş kuralı ister; form ayrı açılır
  const isRuleChange = r.action_type === "approval_rule_change";
  const [comment, setComment] = useState("");
  const approve = useSiteMutation<{ comment: string | null }, Request>("POST", `${base}/approve`);
  const reject = useSiteMutation<{ comment: string }, Request>("POST", `${base}/reject`);
  const revise = useSiteMutation<{ comment: string }, Request>("POST", `${base}/request-revision`);
  const withdraw = useSiteMutation<Record<string, never>, Request>("POST", `${base}/withdraw`);
  const resubmit = useSiteMutation<{ title: string | null }, Request>("POST", `${base}/resubmit`);
  const needReason = () => { if (!comment.trim()) throw new Error("Gerekçe zorunlu: talep edene ne yapması gerektiğini yazın."); return comment.trim(); };
  if (!r.can_decide && !r.can_withdraw && !r.can_resubmit) {
    return (
      <div className="card"><div className="card__body row" style={{ gap: "var(--s-2)" }}>
        <CheckCircle2 aria-hidden="true" /><span className="small">{r.status === "pending" ? "Bu talepte sizden beklenen bir karar yok." : "Talep sonuçlandı."}</span>
      </div></div>
    );
  }
  return (
    <div className="card">
      <div className="card__head"><span className="card__title">{r.can_decide ? "Kararınız" : "Talebiniz"}</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        {r.can_decide && (
          <>
            <div className="field">
              <label className="field__label" htmlFor="ap-comment">Açıklama</label>
              <textarea id="ap-comment" className="field__input" rows={2} maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} aria-describedby="ap-comment-hint" />
              <span className="field__hint" id="ap-comment-hint">Onayda isteğe bağlı; ret ve düzeltme isteğinde zorunlu.</span>
            </div>
            <div className="row" style={{ gap: "var(--s-2)" }}>
              <ConfirmButton className="btn btn--primary" title="Onayla" confirmLabel="Onayla" body="Kararınız kaydedilir ve değiştirilemez." onConfirm={() => approve.mutateAsync({ comment: comment.trim() || null })}>Onayla</ConfirmButton>
              <ConfirmButton className="btn" title="Düzeltme iste" confirmLabel="Düzeltme iste" body="Talep, açıklamanızla talep edene geri döner; yeniden gönderilince onay zinciri baştan başlar." onConfirm={() => revise.mutateAsync({ comment: needReason() })}>Düzeltme iste</ConfirmButton>
              <ConfirmButton className="btn btn--ghost" danger title="Reddet" confirmLabel="Reddet" body="Kural tek reddin yettiğini söylüyorsa talep kapanır." onConfirm={() => reject.mutateAsync({ comment: needReason() })}>Reddet</ConfirmButton>
            </div>
          </>
        )}
        {(r.can_withdraw || r.can_resubmit) && (
          <div className="row" style={{ gap: "var(--s-2)" }}>
            {r.can_resubmit && (isRuleChange ? (
              <button className="btn btn--primary" type="button" onClick={onFixRule}>Kuralı düzelt ve yeniden gönder</button>
            ) : (
              <ConfirmButton className="btn btn--primary" title="Yeniden gönder" confirmLabel="Gönder" body="Talep yeni sürüm olarak gönderilir; onay zinciri baştan başlar." onConfirm={() => resubmit.mutateAsync({ title: null })}>Yeniden gönder</ConfirmButton>
            ))}
            {r.can_withdraw && <ConfirmButton className="btn btn--ghost" danger title="Talebi geri çek" confirmLabel="Geri çek" body="Talep kapanır; işlem uygulanmaz." onConfirm={() => withdraw.mutateAsync({})}>Geri çek</ConfirmButton>}
          </div>
        )}
        <p className="small muted mb-0">Onay mekanizmasında otomatik onay ya da ret yoktur; süresi geçen talep hatırlatılır ve kuralda seçildiyse üst role iletilir.</p>
      </div>
    </div>
  );
}

