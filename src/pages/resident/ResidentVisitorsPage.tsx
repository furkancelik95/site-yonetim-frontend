import { useEffect, useState, type FormEvent } from "react";
import QRCode from "qrcode";
import { Copy, Plus, RefreshCw, UserRoundCheck } from "lucide-react";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { Schemas } from "../../api/types";
import { useToast } from "../../components/toast";
import { Badge, ConfirmButton, Empty, ErrorState, Field, FormError, Loading, SubmitButton, fieldError, useDocumentTitle } from "../../components/ui";
import { formatDate, todayIso } from "../../lib/format";
import { plateInput } from "../../lib/input";
import { WEEKDAYS, inviteStatus, inviteType, visitRequestStatus } from "../../lib/labels";

type Invite = Schemas["VisitorInviteOut"];
type Approval = Schemas["VisitRequestOut"];
type Delegate = Schemas["ParcelDelegateOut"];

/**
 * Ziyaretçiler (GUV-02/03, sakin): ön davet (tek kullanımlık / tarih aralıklı / süreli kalıcı) — 6 haneli kod ve QR;
 * kapıdaki habersiz ziyaretçi için onay/ret; kargo teslim yetkilisi. Kod güvenlik için sunucuda saklanmaz: yalnız
 * oluşturulduğunda (ya da yeni kod üretilince) bu oturumda gösterilir.
 */
export function ResidentVisitorsPage() {
  useDocumentTitle("Ziyaretçiler");
  const approvals = useSiteGet<Approval[]>("/resident/visit-approvals", undefined, { refetchInterval: 5000 });
  const q = useSiteGet<Invite[]>("/resident/visitor-invites");
  const [adding, setAdding] = useState(false);
  // Yalnız bu oturumda: oluşturma / yeni kod yanıtındaki kodlar (sunucu kodu yeniden göstermez)
  const [codes, setCodes] = useState<Record<string, string>>({});
  const keep = (i: Invite) => { if (i.code) setCodes((c) => ({ ...c, [i.id]: i.code! })); };
  const pending = (approvals.data ?? []).filter((a) => a.status === "awaiting" && !a.timed_out);
  return (
    <>
      {pending.length > 0 && (
        <div className="stack" style={{ gap: "var(--s-2)" }}>
          <div className="section-title">Kapıda bekleyen</div>
          {pending.map((a) => <ApprovalCard key={a.id} a={a} />)}
        </div>
      )}
      <div className="section-title">Ziyaretçi davetleri</div>
      <p className="small muted">Davet edilen ziyaretçi kapıda 6 haneli kodu ya da QR'ı gösterir; beklemeden girer.</p>
      {q.isPending ? <Loading /> : q.isError ? <ErrorState error={q.error} /> : (
        <div className="stack" style={{ gap: "var(--s-3)" }}>
          {adding ? <InviteForm onDone={(i) => { setAdding(false); if (i) keep(i); }} /> : <button className="btn btn--primary" style={{ width: "100%" }} type="button" onClick={() => setAdding(true)}><Plus aria-hidden="true" /> Ziyaretçi davet et</button>}
          {q.data.length === 0 ? <Empty title="Davet yok" /> : q.data.map((i) => <InviteItem key={i.id} i={i} code={codes[i.id] ?? i.code} onCode={keep} />)}
        </div>
      )}
      {(approvals.data ?? []).filter((a) => a.status !== "awaiting").length > 0 && (
        <details className="card"><summary className="card__head" style={{ cursor: "pointer" }}><span className="card__title">Bugün kapıdaki kararlar</span></summary>
          <div className="card__body stack" style={{ gap: "var(--s-1)" }}>{approvals.data!.filter((a) => a.status !== "awaiting").map((a) => <div key={a.id} className="small">{a.full_name} · <Badge tone={a.status === "allowed" ? "ok" : "danger"}>{visitRequestStatus(a.status)}</Badge> <span className="muted">({a.decision_source === "resident" ? "sizin kararınız" : "görevli kararı"})</span></div>)}</div>
        </details>
      )}
      <Delegates />
    </>
  );
}

function ApprovalCard({ a }: { a: Approval }) {
  const m = useSiteMutation<{ decision: string }, unknown>("POST", `/resident/visit-approvals/${a.id}`);
  return (
    <div className="card" style={{ borderColor: "var(--warn-solid, #d97706)" }}>
      <div className="card__body stack" style={{ gap: "var(--s-2)" }}>
        <div><span className="strong">{a.full_name}</span> kapıda, {a.unit_name} için giriş istiyor.</div>
        <div className="small muted">{a.seconds_left} sn içinde yanıt vermezseniz görevli sizi arar.</div>
        <div className="row" style={{ gap: "var(--s-2)" }}>
          <button className="btn btn--primary" type="button" disabled={m.isPending} onClick={() => m.mutate({ decision: "allow" })}><UserRoundCheck aria-hidden="true" /> İçeri alın</button>
          <button className="btn" type="button" disabled={m.isPending} onClick={() => m.mutate({ decision: "deny" })}>Almayın</button>
        </div>
      </div>
    </div>
  );
}

function InviteItem({ i, code, onCode }: { i: Invite; code: string | null; onCode: (i: Invite) => void }) {
  const toast = useToast();
  const [qr, setQr] = useState<string>();
  const cancel = useSiteMutation<Record<string, never>, Invite>("POST", `/resident/visitor-invites/${i.id}/cancel`);
  const renew = useSiteMutation<Record<string, never>, Invite>("POST", `/resident/visitor-invites/${i.id}/new-code`, { onSuccess: onCode });
  const live = i.status === "active" && !i.expired;
  useEffect(() => { if (live && code) QRCode.toDataURL(`SY-DAVET:${code}`, { width: 240, margin: 1 }).then(setQr); else setQr(undefined); }, [code, live]);
  return (
    <div className="r-item" style={!live ? { opacity: 0.6 } : undefined}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="r-item__title">{i.visitor_name} <Badge tone={live ? "ok" : "muted"}>{i.expired ? "Süresi doldu" : inviteStatus(i.status)}</Badge></div>
        <div className="r-item__meta">{inviteType(i.type)} · {formatDate(i.date_from)}{i.date_to !== i.date_from && ` – ${formatDate(i.date_to)}`}{i.weekdays.length > 0 && ` · ${i.weekdays.map((d) => WEEKDAYS[d]).join(", ")}`}{i.time_from && ` · ${i.time_from}–${i.time_to}`}{i.plate && ` · ${i.plate}`}</div>
        {live && (
          <div className="row" style={{ gap: "var(--s-3)", marginTop: "var(--s-2)", alignItems: "center" }}>
            {code && qr && <img src={qr} alt={`${i.visitor_name} davet QR kodu`} width={96} height={96} style={{ background: "#fff", borderRadius: 8 }} />}
            <div className="stack" style={{ gap: "var(--s-1)" }}>
              {code ? <div className="mono strong" style={{ fontSize: "1.375rem", letterSpacing: ".15em" }}>{code}</div> : <div className="small muted">Kod güvenlik için yalnız oluşturulurken gösterilir. Kaybettiyseniz yeni kod üretin (eskisi geçersiz olur).</div>}
              <div className="row" style={{ gap: "var(--s-2)" }}>
                {code ? <button className="btn btn--sm" type="button" onClick={() => navigator.clipboard?.writeText(`${i.visitor_name}, site girişinde bu kodu gösterin: ${code}`).then(() => toast("Davet metni kopyalandı."))}><Copy aria-hidden="true" /> Paylaş</button>
                  : <button className="btn btn--sm" type="button" disabled={renew.isPending} onClick={() => renew.mutate({})}><RefreshCw aria-hidden="true" /> Yeni kod</button>}
                <ConfirmButton className="btn btn--ghost btn--sm" danger title="Daveti iptal et" confirmLabel="İptal et" body="Kod artık kapıda çalışmaz." onConfirm={() => cancel.mutateAsync({})}>İptal</ConfirmButton>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function InviteForm({ onDone }: { onDone: (created?: Invite) => void }) {
  const home = useSiteGet<Schemas["HomeOut"]>("/resident/home");
  const [f, setF] = useState({ visitor_name: "", type: "once", date_from: todayIso(), date_to: todayIso(), weekdays: [0, 1, 2, 3, 4] as number[], time_from: "", time_to: "", plate: "", note: "", unit_id: "" });
  const m = useSiteMutation<Record<string, unknown>, Invite>("POST", "/resident/visitor-invites", { onSuccess: onDone });
  const units = home.data?.units ?? [];
  const up = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  function submit(e: FormEvent) { e.preventDefault(); m.mutate({ ...f, unit_id: f.unit_id || units[0]?.unit_id, plate: f.plate.replace(/\s/g, "") || null, time_from: f.time_from || null, time_to: f.time_to || null, note: f.note.trim() || null }); }
  return (
    <form className="card" noValidate onSubmit={submit}>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        {units.length > 1 && <Field label="Bölüm">{(p) => <select {...p} className="field__input" value={f.unit_id || units[0]!.unit_id} onChange={up("unit_id")}>{units.map((u) => <option key={u.unit_id} value={u.unit_id}>{u.unit_name}</option>)}</select>}</Field>}
        <Field label="Ziyaretçinin adı" required error={fieldError(m.error, "visitor_name")}>{(p) => <input {...p} className="field__input" autoComplete="off" maxLength={60} value={f.visitor_name} onChange={up("visitor_name")} />}</Field>
        <Field label="Davet tipi" required>{(p) => <select {...p} className="field__input" value={f.type} onChange={up("type")}>{["once", "range", "recurring"].map((k) => <option key={k} value={k}>{inviteType(k)}</option>)}</select>}</Field>
        <div className="grid grid--2">
          <Field label={f.type === "once" ? "Tarih" : "Başlangıç"} required error={fieldError(m.error, "date_from")}>{(p) => <input {...p} className="field__input" type="date" min={todayIso()} value={f.date_from} onChange={up("date_from")} />}</Field>
          {f.type !== "once" && <Field label="Bitiş" required error={fieldError(m.error, "date_to")}>{(p) => <input {...p} className="field__input" type="date" min={f.date_from} value={f.date_to} onChange={up("date_to")} />}</Field>}
        </div>
        {f.type === "recurring" && (
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}><legend className="field__label">Günler</legend>
            <div className="row" style={{ gap: "var(--s-2)" }}>{WEEKDAYS.map((d, i) => <label key={d} className="check"><input type="checkbox" checked={f.weekdays.includes(i)} onChange={(e) => setF((x) => ({ ...x, weekdays: e.target.checked ? [...x.weekdays, i].sort() : x.weekdays.filter((w) => w !== i) }))} /><span>{d}</span></label>)}</div>
            {fieldError(m.error, "weekdays") && <span className="field__error">{fieldError(m.error, "weekdays")}</span>}
          </fieldset>
        )}
        <div className="grid grid--2">
          <Field label="Saat (başlangıç)" hint="İsteğe bağlı">{(p) => <input {...p} className="field__input" type="time" value={f.time_from} onChange={up("time_from")} />}</Field>
          <Field label="Saat (bitiş)" error={fieldError(m.error, "time_to")}>{(p) => <input {...p} className="field__input" type="time" value={f.time_to} onChange={up("time_to")} />}</Field>
        </div>
        <Field label="Araç plakası" hint="İsteğe bağlı; misafir parkına kaydedilir" error={fieldError(m.error, "plate")}>{(p) => <input {...p} className="field__input mono" value={f.plate} onChange={(e) => setF((x) => ({ ...x, plate: plateInput(e.target.value) }))} />}</Field>
        <Field label="Not">{(p) => <input {...p} className="field__input" maxLength={200} value={f.note} onChange={up("note")} />}</Field>
      </div>
      <div className="card__foot row" style={{ gap: "var(--s-2)" }}><SubmitButton busy={m.isPending} disabled={f.visitor_name.trim().length < 3}>Davet oluştur</SubmitButton><button className="btn btn--ghost" type="button" onClick={() => onDone()}>Vazgeç</button></div>
    </form>
  );
}

function Delegates() {
  const q = useSiteGet<Delegate[]>("/resident/parcel-delegates");
  const [name, setName] = useState("");
  const add = useSiteMutation<{ name: string }, Delegate>("POST", "/resident/parcel-delegates", { onSuccess: () => setName("") });
  return (
    <div className="card">
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <div className="section-title" style={{ margin: 0 }}>Kargo teslim yetkilisi</div>
        <p className="small muted mb-0">Komşunuz ya da yakınınız kargonuzu sizin teslim kodunuzla alabilir. En fazla 3 kişi.</p>
        {(q.data ?? []).map((d) => <DelegateRow key={d.id} d={d} />)}
        <form className="row" style={{ gap: "var(--s-2)", alignItems: "flex-end" }} noValidate onSubmit={(e) => { e.preventDefault(); add.mutate({ name: name.trim() }); }}>
          <Field label="Ad soyad" error={fieldError(add.error, "name") ?? (add.error && !fieldError(add.error, "name") ? (add.error as Error).message : undefined)}>{(p) => <input {...p} className="field__input" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
          <SubmitButton busy={add.isPending} disabled={name.trim().length < 3} className="btn">Ekle</SubmitButton>
        </form>
      </div>
    </div>
  );
}

function DelegateRow({ d }: { d: Delegate }) {
  const rm = useSiteMutation<Record<string, never>, Delegate>("POST", `/resident/parcel-delegates/${d.id}/remove`);
  return <div className="row row--between small"><span>{d.name} <span className="muted">· {d.unit_name}</span></span><button className="btn btn--ghost btn--sm" type="button" disabled={rm.isPending} onClick={() => rm.mutate({})}>Kaldır</button></div>;
}
