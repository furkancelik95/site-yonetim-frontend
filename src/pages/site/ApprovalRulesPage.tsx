import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../../api/client";
import { Link } from "react-router";
import { Link2, ListChecks, Plus, ShieldCheck, Trash2, UserX } from "lucide-react";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { Schemas } from "../../api/types";
import { useToast } from "../../components/toast";
import { Alert, Badge, ConfirmButton, Empty, ErrorState, Field, FormError, Kpi, Loading, PageHead, Segmented, SubmitButton, fieldError } from "../../components/ui";
import { formatDate, formatMoney, parseMoneyInput, todayIso } from "../../lib/format";
import { useUrlState } from "../../lib/hooks";
import { dayBasis, quorumKind, rejectBehavior, stepMode } from "../../lib/labels";
import { P, useSite } from "../../site/SiteContext";

type Rule = Schemas["RuleOut"];
type ActionTypeOut = Schemas["ActionTypeOut"];
type RuleIn = Schemas["RuleIn"];
type RuleWrite = Schemas["RuleWriteOut"];
type SiteRole = string; // P16a: backend rol adları artık veri (/roles); fe #40 bunu tam bağlar
type Quorum = Schemas["QuorumKind"];
type Simulated = Schemas["SimulateOut"];

/** Onaycı olabilecek roller (sakin onaycı olamaz). */
const ROLES: SiteRole[] = ["Yönetici", "Yönetim Kurulu Üyesi", "Denetçi", "Muhasebe", "Güvenlik", "Teknik Personel"];
const QUORUMS: Quorum[] = ["any", "all", "majority", "count"];

const range = (r: Rule["current"]) =>
  r.amount_min == null && r.amount_max == null ? "Her tutar" :
  r.amount_min == null ? `${formatMoney(r.amount_max)} ve altı` :
  r.amount_max == null ? `${formatMoney(r.amount_min)} üstü` :
  `${formatMoney(r.amount_min)} üstü – ${formatMoney(r.amount_max)}`;

/**
 * Onay kuralları (ONY-01): her işlem tipi için kim, kaç kişi, hangi sırayla onaylar. Kurallar
 * versiyonludur: düzenleme yeni sürüm yazar, bekleyen talepler eski sürümle sürer. "Onay kuralı
 * değişikliği" için yürürlükte kural varsa değişiklik de onaya gider.
 */
export function ApprovalRulesPage() {
  const { can, site } = useSite();
  const toast = useToast();
  const [s, set] = useUrlState({ arsiv: "" });
  const types = useSiteGet<ActionTypeOut[]>("/approval-action-types");
  const q = useSiteGet<Rule[]>("/approval-rules", { archived: s.arsiv ? "true" : undefined });
  // Göstergeler her zaman yürürlükteki listeden (Arşiv sekmesinde de); varsayılan sekmede q ile aynı sorgu
  const active = useSiteGet<Rule[]>("/approval-rules", { archived: undefined });
  const [editing, setEditing] = useState<Rule | "new" | null>(null);
  const restore = useSiteMutation<Record<string, never>, Schemas["RestoreOut"]>("POST", "/approval-rules/restore-defaults", {
    onSuccess: (d) => d?.skipped.length && toast(`Kurulamayanlar: ${d.skipped.join(", ")}`),
  });
  const manage = can(P.approvalRulesManage);
  const connected = new Set((types.data ?? []).filter((t) => t.connected).map((t) => t.key));

  return (
    <div className="stack">
      <PageHead
        title="Onay kuralları"
        subtitle="Hangi işlemi kimin, kaç kişinin, hangi sırayla onaylayacağı. Kuralı olmayan işlemi site yöneticisi tek başına onaylar."
        actions={<>
          <Link className="btn" to={`/s/${site.slug}/onaylar`}>Onaylar</Link>
          {manage && <ConfirmButton className="btn" title="Önerilen kuralları kur" confirmLabel="Kur" body="Belgede adımları tanımlı önerilen kurallar kurulur (aidat kuralı, tahakkuk, iade, satın alma, kayıt başvurusu). Kuralı olan işlem tipine dokunulmaz." onConfirm={() => restore.mutateAsync({})}>Önerilen kuralları kur</ConfirmButton>}
          {manage && <button className="btn btn--primary" type="button" onClick={() => setEditing("new")}><Plus aria-hidden="true" /> Kural ekle</button>}
        </>}
      />
      {active.isError || types.isError ? null : !active.data || !types.data ? (
        <div className="grid grid--kpi">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton skel__kpi" />)}</div>
      ) : (
        <div className="grid grid--kpi rise">
          <Kpi label="Yürürlükteki kural" tone="accent" icon={<ListChecks aria-hidden="true" />} value={active.data.length} note={`${types.data.length} işlem tipinden`} />
          <Kpi label="Uygulanan" tone="ok" icon={<ShieldCheck aria-hidden="true" />} value={active.data.filter((r) => connected.has(r.action_type)).length} note="onaya bağlı işlemde çalışıyor" />
          <Kpi label="Onaya bağlı işlem" icon={<Link2 aria-hidden="true" />} value={connected.size} note={`${types.data.length - connected.size} işlem bağlanmayı bekliyor`} />
          <Kpi label="Onaycısı yok" tone={active.data.some((r) => !r.applicable) ? "danger" : undefined} icon={<UserX aria-hidden="true" />} value={active.data.filter((r) => !r.applicable).length} note="adımdaki rolde etkin kullanıcı yok" />
        </div>
      )}
      <Alert tone="info">Şu an onaydan gerçekten geçen işlem: {(types.data ?? []).filter((t) => t.connected).map((t) => t.label).join(", ") || "—"}. Diğer işlemler için kural şimdiden tanımlanabilir; o işlemler onaya bağlanınca kural uygulanır.</Alert>
      {editing && <RuleForm rule={editing === "new" ? null : editing} types={types.data ?? []} onDone={() => setEditing(null)} />}
      <Simulator types={types.data ?? []} />

      <Segmented label="Kural listesi" value={s.arsiv} onChange={(k) => set({ arsiv: k })} options={[{ value: "", label: "Yürürlükte" }, { value: "1", label: "Arşiv" }]} />

      {q.isPending ? <Loading /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : q.data.length === 0 ? (
        <div className="card"><div className="card__body"><Empty title={s.arsiv ? "Arşivde kural yok" : "Henüz kural yok"} icon={<ListChecks aria-hidden="true" />}>{!s.arsiv && manage && "\"Önerilen kuralları kur\" ile başlayabilirsiniz."}</Empty></div></div>
      ) : (
        <div className="grid grid--2">
          {q.data.map((r) => <RuleCard key={r.id} r={r} manage={manage && !s.arsiv} connected={connected.has(r.action_type)} onEdit={() => setEditing(r)} />)}
        </div>
      )}
    </div>
  );
}

function RuleCard({ r, manage, connected, onEdit }: { r: Rule; manage: boolean; connected: boolean; onEdit: () => void }) {
  const archive = useSiteMutation<Record<string, never>, RuleWrite>("POST", `/approval-rules/${r.id}/archive`);
  const v = r.current;
  return (
    <div className="card">
      <div className="card__head">
        <span className="card__title">{r.action_label}</span>
        <span className="ml-auto row" style={{ gap: "var(--s-1)" }}>
          {r.is_template && <Badge tone="info">Önerilen</Badge>}
          {connected ? <Badge tone="ok">Uygulanıyor</Badge> : <Badge>Henüz bağlı değil</Badge>}
          {!r.applicable && <Badge tone="danger">Onaycı yok</Badge>}
        </span>
      </div>
      <div className="card__body stack" style={{ gap: "var(--s-2)" }}>
        <div className="kv"><span className="kv__k">Tutar</span><span className="kv__v">{range(v)}{v.source ? ` · kaynak: ${v.source}` : ""}</span></div>
        <div className="kv"><span className="kv__k">Akış</span><span className="kv__v">{stepMode(v.mode)} · {rejectBehavior(v.reject_behavior)}</span></div>
        <ol className="small" style={{ margin: 0, paddingLeft: "1.25rem" }}>
          {v.steps.map((st, i) => (
            <li key={i}>{st.roles.join(" / ")}: {quorumKind(st.quorum)}{st.quorum === "count" ? ` (${st.count})` : ""} — {st.eligible} kişiden {st.required} onay</li>
          ))}
        </ol>
        <div className="small muted">
          {v.remind_after_days} {dayBasis(v.day_basis).toLocaleLowerCase("tr-TR")} sonra hatırlatma, {v.escalate_after_days} gün sonra {v.escalation_role ? `${v.escalation_role} rolüne iletilir` : "yalnız hatırlatma"} ·
          {" "}{v.version}. sürüm, {formatDate(v.effective_from)} itibarıyla{r.in_force_version != null && r.in_force_version !== v.version ? ` (yürürlükte: ${r.in_force_version}. sürüm)` : ""}
        </div>
        {v.basis_note && <div className="small">Dayanak: {v.basis_note}</div>}
        {!r.applicable && <span className="field__error">Bir adımdaki rolde etkin kullanıcı yok; bu kural uygulanamaz.</span>}
      </div>
      {manage && (
        <div className="card__foot row" style={{ gap: "var(--s-2)" }}>
          <button className="btn btn--sm" type="button" onClick={onEdit}>Yeni sürüm</button>
          <ConfirmButton className="btn btn--ghost btn--sm" danger title={`${r.action_label} kuralını arşivle`} confirmLabel="Arşivle" body="Kural yeni taleplere uygulanmaz; bekleyen talepler mevcut kuralla sürer. Kural değişikliği onaya bağlıysa arşivleme de onaya gider." onConfirm={() => archive.mutateAsync({})}>Arşivle</ConfirmButton>
        </div>
      )}
    </div>
  );
}

type StepDraft = { roles: SiteRole[]; quorum: Quorum; count: string };

/**
 * Kural formu. `resubmitId` verilirse kural değişikliği talebi düzeltilip yeniden gönderilir
 * (POST /approvals/{id}/resubmit; backend düzeltilmiş kuralı zorunlu ister). Form, değişikliğin
 * hedefi olan işlem tipinin mevcut kuralıyla dolu gelir.
 */
export function RuleForm({ rule, initial, types, onDone, resubmitId, actionType }: { rule: Rule | null; initial?: RuleIn; types: ActionTypeOut[]; onDone: () => void; resubmitId?: string; actionType?: string }) {
  // Formu dolduran kaynak: talebin önerdiği kural (yeniden gönderme) ya da yürürlükteki sürüm (yeni sürüm)
  const v: Pick<RuleIn, "mode" | "reject_behavior" | "amount_min" | "amount_max" | "remind_after_days" | "escalate_after_days" | "day_basis" | "escalation_role" | "basis_note" | "steps"> | undefined = initial ?? rule?.current;
  const [f, setF] = useState({
    action_type: rule?.action_type ?? actionType ?? types[0]?.key ?? "",
    mode: v?.mode ?? "sequential",
    reject_behavior: v?.reject_behavior ?? "single_rejects",
    amount_min: v?.amount_min ? formatMoney(v.amount_min, false) : "",
    amount_max: v?.amount_max ? formatMoney(v.amount_max, false) : "",
    remind_after_days: String(v?.remind_after_days ?? 2),
    escalate_after_days: String(v?.escalate_after_days ?? 5),
    day_basis: v?.day_basis ?? "business",
    escalation_role: v?.escalation_role ?? "",
    effective_from: todayIso(),
    basis_note: v?.basis_note ?? "",
  });
  const [steps, setSteps] = useState<StepDraft[]>(v?.steps.map((s) => ({ roles: s.roles, quorum: s.quorum, count: s.count ? String(s.count) : "" })) ?? [{ roles: ["Yönetici"], quorum: "any", count: "" }]);
  const [moneyErr, setMoneyErr] = useState<string>();
  const [warnings, setWarnings] = useState<string[]>([]);
  const m = useSiteMutation<RuleIn, RuleWrite>(rule ? "PUT" : "POST", rule ? `/approval-rules/${rule.id}` : "/approval-rules", {
    onSuccess: (d) => {
      if (d?.warnings.length) setWarnings(d.warnings); else onDone();
    },
    onPending: (d) => {
      const w = Array.isArray(d.warnings) ? (d.warnings as string[]) : [];
      if (w.length) setWarnings(w); else onDone();
    },
  });
  const resub = useSiteMutation<{ rule: RuleIn; title: null; amount: null }, unknown>("POST", `/approvals/${resubmitId}/resubmit`, { onSuccess: onDone });
  const act = resubmitId ? resub : m;
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const upd = (i: number, p: Partial<StepDraft>) => setSteps((x) => x.map((s, j) => (j === i ? { ...s, ...p } : s)));

  function submit(e: FormEvent) {
    e.preventDefault();
    const min = f.amount_min.trim() ? parseMoneyInput(f.amount_min) : null;
    const max = f.amount_max.trim() ? parseMoneyInput(f.amount_max) : null;
    if ((f.amount_min.trim() && !min) || (f.amount_max.trim() && !max)) { setMoneyErr("Tutarı 12.500,00 biçiminde girin."); return; }
    setMoneyErr(undefined);
    const body: RuleIn = {
      action_type: f.action_type as RuleIn["action_type"],
      steps: steps.map((s) => ({ roles: s.roles, quorum: s.quorum, count: s.quorum === "count" ? Number(s.count || 0) : null })),
      mode: f.mode as RuleIn["mode"],
      reject_behavior: f.reject_behavior as RuleIn["reject_behavior"],
      amount_min: min, amount_max: max, source: null,
      remind_after_days: Number(f.remind_after_days || 0),
      escalate_after_days: Number(f.escalate_after_days || 0),
      day_basis: f.day_basis as RuleIn["day_basis"],
      escalation_role: (f.escalation_role || null) as RuleIn["escalation_role"],
      effective_from: f.effective_from,
      basis_note: f.basis_note.trim() || null,
    };
    if (resubmitId) resub.mutate({ rule: body, title: null, amount: null }); else m.mutate(body);
  }
  const digits = (val: string) => val.replace(/\D/g, "").slice(0, 2);

  return (
    <form className="card" onSubmit={submit} noValidate>
      <div className="card__head"><span className="card__title">{resubmitId ? "Kuralı düzeltip yeniden gönder" : rule ? `${rule.action_label} — yeni sürüm` : "Kural ekle"}</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-4)" }}>
        <FormError error={act.error} />
        {warnings.length > 0 && <Alert tone="warn" title="Kaydedildi, uyarılar var">{warnings.map((w) => <div key={w}>{w}</div>)}<button className="btn btn--sm mt-2" type="button" onClick={onDone}>Tamam</button></Alert>}
        <div className="grid grid--kpi">
          <Field label="İşlem" required error={fieldError(act.error, "action_type")}>
            {(p) => <select {...p} className="field__input" disabled={!!rule || !!resubmitId} value={f.action_type} onChange={set("action_type")}>{types.map((t) => <option key={t.key} value={t.key}>{t.label}{t.connected ? "" : " (henüz bağlı değil)"}</option>)}</select>}
          </Field>
          <Field label="Tutar alt sınırı (₺, hariç)" hint="Boş: alt sınır yok" error={moneyErr ?? fieldError(act.error, "amount_min")}>{(p) => <input {...p} className="field__input" inputMode="decimal" value={f.amount_min} onChange={set("amount_min")} />}</Field>
          <Field label="Tutar üst sınırı (₺, dahil)" hint="Boş: üst sınır yok" error={fieldError(act.error, "amount_max")}>{(p) => <input {...p} className="field__input" inputMode="decimal" value={f.amount_max} onChange={set("amount_max")} />}</Field>
          <Field label="Yürürlük tarihi" required error={fieldError(act.error, "effective_from")}>{(p) => <input {...p} className="field__input" type="date" min={todayIso()} value={f.effective_from} onChange={set("effective_from")} />}</Field>
        </div>

        <fieldset className="stack" style={{ gap: "var(--s-3)", border: 0, padding: 0, margin: 0 }}>
          <legend className="field__label">Onay adımları *</legend>
          {steps.map((st, i) => (
            <div key={i} className="stack" style={{ gap: "var(--s-2)", border: "1px solid var(--line)", borderRadius: "var(--r-md)", padding: "var(--s-3)" }}>
              <div className="row row--between">
                <span className="strong">{i + 1}. adım</span>
                <button className="btn btn--ghost btn--sm" type="button" aria-label={`${i + 1}. adımı kaldır`} disabled={steps.length === 1} onClick={() => setSteps((x) => x.filter((_, j) => j !== i))}><Trash2 aria-hidden="true" /></button>
              </div>
              <fieldset className="row" style={{ gap: "var(--s-2) var(--s-4)", border: 0, padding: 0, margin: 0 }}>
                <legend className="visually-hidden">{i + 1}. adımda onaylayacak roller</legend>
                {ROLES.map((role) => (
                  <label key={role} className="check">
                    <input type="checkbox" checked={st.roles.includes(role)} onChange={(e) => upd(i, { roles: e.target.checked ? [...st.roles, role] : st.roles.filter((x) => x !== role) })} />
                    <span>{role}</span>
                  </label>
                ))}
              </fieldset>
              <div className="row" style={{ gap: "var(--s-3)", alignItems: "flex-end" }}>
                <div className="field" style={{ minWidth: "12rem" }}>
                  <label className="field__label" htmlFor={`st-q-${i}`}>Kaç kişi onaylar</label>
                  <select id={`st-q-${i}`} className="field__input" value={st.quorum} onChange={(e) => upd(i, { quorum: e.target.value as Quorum })}>{QUORUMS.map((qk) => <option key={qk} value={qk}>{quorumKind(qk)}</option>)}</select>
                </div>
                {st.quorum === "count" && (
                  <div className="field" style={{ width: "7rem" }}>
                    <label className="field__label" htmlFor={`st-c-${i}`}>Sayı</label>
                    <input id={`st-c-${i}`} className="field__input" inputMode="numeric" value={st.count} onChange={(e) => upd(i, { count: digits(e.target.value) })} />
                  </div>
                )}
              </div>
              {fieldError(act.error, `steps.${i}`) && <span className="field__error" role="alert">{fieldError(act.error, `steps.${i}`)}</span>}
            </div>
          ))}
          <div><button className="btn btn--sm" type="button" disabled={steps.length >= 5} onClick={() => setSteps((x) => [...x, { roles: ["Yönetim Kurulu Üyesi"], quorum: "majority", count: "" }])}><Plus aria-hidden="true" /> Adım ekle</button></div>
        </fieldset>

        <div className="grid grid--kpi">
          <Field label="Adımlar">{(p) => <select {...p} className="field__input" value={f.mode} onChange={set("mode")}>{["sequential", "parallel"].map((k) => <option key={k} value={k}>{stepMode(k)}</option>)}</select>}</Field>
          <Field label="Ret">{(p) => <select {...p} className="field__input" value={f.reject_behavior} onChange={set("reject_behavior")}>{["single_rejects", "counts"].map((k) => <option key={k} value={k}>{rejectBehavior(k)}</option>)}</select>}</Field>
          <Field label="Hatırlatma (gün)" hint="1–30" error={fieldError(act.error, "remind_after_days")}>{(p) => <input {...p} className="field__input" inputMode="numeric" value={f.remind_after_days} onChange={(e) => setF((x) => ({ ...x, remind_after_days: digits(e.target.value) }))} />}</Field>
          <Field label="Üst role iletme (gün)" hint="Hatırlatmadan sonra" error={fieldError(act.error, "escalate_after_days")}>{(p) => <input {...p} className="field__input" inputMode="numeric" value={f.escalate_after_days} onChange={(e) => setF((x) => ({ ...x, escalate_after_days: digits(e.target.value) }))} />}</Field>
          <Field label="Gün hesabı">{(p) => <select {...p} className="field__input" value={f.day_basis} onChange={set("day_basis")}>{["business", "calendar"].map((k) => <option key={k} value={k}>{dayBasis(k)}</option>)}</select>}</Field>
          <Field label="İletilecek rol" hint="Boş: yalnız hatırlatma gider">{(p) => <select {...p} className="field__input" value={f.escalation_role} onChange={set("escalation_role")}><option value="">Yok</option>{ROLES.map((r) => <option key={r} value={r}>{r}</option>)}</select>}</Field>
        </div>
        <Field label="Dayanak" hint="ör. 12.03.2026 tarihli yönetim kurulu kararı">{(p) => <input {...p} className="field__input" maxLength={300} value={f.basis_note} onChange={set("basis_note")} />}</Field>
        <p className="small muted mb-0">Otomatik onay ya da ret yoktur: süresi geçen talep hatırlatılır, seçildiyse üst role iletilir. Talep eden, onaycı listesinden kendiliğinden çıkar.</p>
      </div>
      <div className="card__foot row" style={{ gap: "var(--s-2)" }}>
        <SubmitButton busy={act.isPending} disabled={steps.some((s) => s.roles.length === 0)}>{resubmitId ? "Yeniden gönder" : rule ? "Yeni sürümü kaydet" : "Kaydet"}</SubmitButton>
        <button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button>
      </div>
    </form>
  );
}

/** "Bu işlem kime gider?" — kural ve onaycı adlarını gösterir, hiçbir şey kaydetmez. */
function Simulator({ types }: { types: ActionTypeOut[] }) {
  const [f, setF] = useState({ action_type: "", amount: "" });
  const { site } = useSite();
  // Deneme hiçbir şey kaydetmez; yanıt doğrudan SimulateOut (yazma yanıtı değil)
  const m = useMutation({ mutationFn: (body: { action_type: string; amount: string | null; source: null }) => api<Simulated>("POST", `/sites/${site.slug}/approval-rules/simulate`, { body }) });
  const res = m.data;
  const [err, setErr] = useState<string>();
  return (
    <details className="card">
      <summary className="card__head" style={{ cursor: "pointer" }}><span className="card__title">Bu işlem kime gider? (deneme)</span></summary>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <form className="row" style={{ gap: "var(--s-2)", alignItems: "flex-end" }} noValidate onSubmit={(e) => {
          e.preventDefault();
          const amount = f.amount.trim() ? parseMoneyInput(f.amount) : null;
          if (f.amount.trim() && !amount) { setErr("Tutarı 12.500,00 biçiminde girin."); return; }
          setErr(undefined);
          m.mutate({ action_type: f.action_type || types[0]?.key || "", amount, source: null });
        }}>
          <Field label="İşlem">{(p) => <select {...p} className="field__input" value={f.action_type || types[0]?.key || ""} onChange={(e) => setF((x) => ({ ...x, action_type: e.target.value }))}>{types.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select>}</Field>
          <Field label="Tutar (₺)" error={err}>{(p) => <input {...p} className="field__input" inputMode="decimal" style={{ width: "10rem" }} value={f.amount} onChange={(e) => setF((x) => ({ ...x, amount: e.target.value }))} />}</Field>
          <SubmitButton busy={m.isPending} className="btn">Göster</SubmitButton>
        </form>
        <FormError error={m.error} />
        {res && (
          <div className="small">
            {res.rule_id ? `Uygulanacak kural: ${res.version}. sürüm · ${stepMode(res.mode)}` : "Kural yok: site yöneticisi tek başına onaylar."}
            <ol style={{ margin: "var(--s-2) 0 0", paddingLeft: "1.25rem" }}>
              {res.steps.map((st, i) => <li key={i}>{st.roles.join(" / ")} — {st.eligible} kişiden {st.required}: {st.approvers.join(", ") || "onaycı yok"}</li>)}
            </ol>
          </div>
        )}
      </div>
    </details>
  );
}
