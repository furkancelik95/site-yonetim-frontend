import { useState, type FormEvent } from "react";
import { Car, Copy, Plus, Users } from "lucide-react";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { Schemas } from "../../api/types";
import { ResidentHead } from "../../components/ResidentHead";
import { useToast } from "../../components/toast";
import { Alert, Badge, ConfirmButton, Empty, ErrorState, Field, FormError, Loading, SubmitButton, fieldError, useDocumentTitle } from "../../components/ui";
import { formatDate, todayIso } from "../../lib/format";
import { formatPhone, isTrMobile, phoneDigits, phoneMask, plateInput, toE164 } from "../../lib/input";
import { householdPermission, householdStatus, vehicleKind, vehicleStatus, vehicleStatusTone } from "../../lib/labels";

type Perm = "visitors" | "packages" | "reservations" | "requests";
type Household = Schemas["HouseholdOut"];
type MyVehicle = Schemas["VehicleOut"];
type MyUnit = Schemas["MyUnit"];
const PERMS: Perm[] = ["visitors", "packages", "reservations", "requests"];
const HOUSEHOLD_LIMIT = 6;

function UnitSelect({ units, value, onChange }: { units: MyUnit[]; value: string; onChange: (v: string) => void }) {
  if (units.length <= 1) return null;
  return <Field label="Bölüm" required>{(p) => <select {...p} className="field__input" value={value} onChange={(e) => onChange(e.target.value)}>{units.map((u) => <option key={u.unit_id} value={u.unit_id}>{u.unit_name}</option>)}</select>}</Field>;
}

/** Hane üyeleri (YAP-04): sakin, bölümü için aile bireyi / yardımcı davet eder; yetkileri kendisi belirler. */
export function ResidentHouseholdPage() {
  useDocumentTitle("Hane üyeleri");
  const toast = useToast();
  const q = useSiteGet<Household[]>("/resident/household");
  const home = useSiteGet<Schemas["HomeOut"]>("/resident/home");
  const [adding, setAdding] = useState(false);
  // Davet bağlantısı yalnız oluşturma yanıtında döner (belirtecin özeti saklanır): bu oturumda göster.
  const [links, setLinks] = useState<Record<string, string>>({});
  const active = (q.data ?? []).filter((h) => h.status !== "ended");
  const copy = (link: string) => navigator.clipboard?.writeText(`${window.location.origin}${link}`).then(() => toast("Davet bağlantısı kopyalandı."));
  return (
    <>
      <ResidentHead icon={<Users />} title="Hane üyeleri" sub="Aile bireyleri ve yardımcılar ziyaretçi davet edebilir, kargo bildirimi alabilir. Davet bağlantısını kendilerine iletin."
        stats={q.data && [
          { label: "Etkin üye", value: `${active.filter((h) => h.status === "active").length} / ${HOUSEHOLD_LIMIT}` },
          { label: "Davet bekleyen", value: active.filter((h) => h.status === "invited").length, tone: active.some((h) => h.status === "invited") ? "info" : undefined },
        ]} />
      {q.isPending ? <Loading /> : q.isError ? <ErrorState error={q.error} /> : (
        <div className="r-split">
          <div className="r-split__col">
            {adding ? <HouseholdForm units={home.data?.units ?? []} onDone={(h) => { setAdding(false); if (h?.invite_link) { setLinks((x) => ({ ...x, [h.id]: h.invite_link! })); copy(h.invite_link); } }} /> : (
              <button className="btn btn--primary" style={{ width: "100%" }} type="button" disabled={active.length >= HOUSEHOLD_LIMIT} onClick={() => setAdding(true)}><Plus aria-hidden="true" /> Hane üyesi davet et</button>
            )}
            <p className="small muted mb-0">En fazla {HOUSEHOLD_LIMIT} üye. Yetkileri siz belirlersiniz; üyeliği istediğiniz zaman bitirebilirsiniz.</p>
          </div>
          <div className="r-split__col">
            <div className="section-title">Üyeler</div>
            {q.data.length === 0 ? <Empty title="Hane üyesi yok" icon={<Users aria-hidden="true" />}>Davet ettiğiniz kişiler burada görünür.</Empty> : q.data.map((h) => <HouseholdItem key={h.id} h={h} onCopy={links[h.id] ? () => copy(links[h.id]!) : undefined} />)}
          </div>
        </div>
      )}
    </>
  );
}

function HouseholdItem({ h, onCopy }: { h: Household; onCopy?: () => void }) {
  const end = useSiteMutation<Record<string, never>, Household>("POST", `/resident/household/${h.id}/end`);
  const perms = PERMS.filter((p) => h.permissions[p]).map(householdPermission);
  return (
    <div className="r-item" style={h.status === "ended" ? { opacity: 0.6 } : undefined}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="r-item__title">{h.full_name} <Badge tone={h.status === "active" ? "ok" : h.status === "invited" ? "info" : "muted"}>{householdStatus(h.status)}</Badge></div>
        <div className="r-item__meta">{formatPhone(h.phone)} · {h.unit_name}{h.ended_at && ` · bitti ${formatDate(h.ended_at)}`}</div>
        <div className="r-item__body">{perms.length ? perms.join(", ") : "Yetki yok"}</div>
        {h.status !== "ended" && (
          <div className="row" style={{ gap: "var(--s-2)", marginTop: "var(--s-2)" }}>
            {h.status === "invited" && onCopy && <button className="btn btn--sm" type="button" onClick={onCopy}><Copy aria-hidden="true" /> Davet bağlantısı</button>}
            {h.status === "invited" && !onCopy && <span className="small muted">Davet bağlantısı yalnız oluşturulduğunda gösterilir; kaybolduysa üyeliği bitirip yeniden davet edin.</span>}
            <ConfirmButton className="btn btn--ghost btn--sm" danger title={`${h.full_name} — hane üyeliğini bitir`} confirmLabel="Bitir" body="Kişi uygulamaya erişemez; ziyaretçi ve kargo yetkileri kalkar." onConfirm={() => end.mutateAsync({})}>Bitir</ConfirmButton>
          </div>
        )}
      </div>
    </div>
  );
}

function HouseholdForm({ units, onDone }: { units: MyUnit[]; onDone: (created?: Household) => void }) {
  const [f, setF] = useState({ full_name: "", phone: "", unit_id: units[0]?.unit_id ?? "" });
  const [perms, setPerms] = useState<Record<Perm, boolean>>({ visitors: true, packages: true, reservations: false, requests: false });
  const [phoneErr, setPhoneErr] = useState<string>();
  const m = useSiteMutation<Record<string, unknown>, Household>("POST", "/resident/household", { onSuccess: onDone });
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!isTrMobile(f.phone)) return setPhoneErr("Cep telefonu 5 ile başlayan 10 hane olmalı.");
    m.mutate({ full_name: f.full_name.trim(), phone: toE164(f.phone), unit_id: f.unit_id || undefined, permissions: perms });
  }
  return (
    <form className="card" onSubmit={submit} noValidate>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        <UnitSelect units={units} value={f.unit_id} onChange={(v) => setF((x) => ({ ...x, unit_id: v }))} />
        <Field label="Ad soyad" required error={fieldError(m.error, "full_name")}>{(p) => <input {...p} className="field__input" autoComplete="off" maxLength={60} value={f.full_name} onChange={(e) => setF((x) => ({ ...x, full_name: e.target.value }))} />}</Field>
        <Field label="Cep telefonu" required error={phoneErr ?? fieldError(m.error, "phone")}>{(p) => <input {...p} className="field__input" type="tel" inputMode="tel" placeholder="5XX XXX XX XX" value={phoneMask(phoneDigits(f.phone))} onChange={(e) => { setF((x) => ({ ...x, phone: e.target.value })); setPhoneErr(undefined); }} />}</Field>
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="field__label">Yetkiler</legend>
          {PERMS.map((p) => <label key={p} className="check"><input type="checkbox" checked={perms[p]} onChange={(e) => setPerms((x) => ({ ...x, [p]: e.target.checked }))} /><span>{householdPermission(p)}</span></label>)}
        </fieldset>
        <p className="small muted mb-0">Hane üyesi borç ve ekstre göremez; aidat sorumluluğu sizde kalır.</p>
      </div>
      <div className="card__foot row" style={{ gap: "var(--s-2)" }}><SubmitButton busy={m.isPending} disabled={!f.full_name.trim() || !f.phone}>Davet et</SubmitButton><button className="btn btn--ghost" type="button" onClick={() => onDone()}>Vazgeç</button></div>
    </form>
  );
}

/** Araçlarım (YAP-05): sakin plakasını ekler; ayara göre yönetici onayı bekler; kapı ekranında görünür. */
export function ResidentVehiclesPage() {
  useDocumentTitle("Araçlarım");
  const q = useSiteGet<{ limit: number; approval_required: boolean; items: MyVehicle[] }>("/resident/vehicles");
  const home = useSiteGet<Schemas["HomeOut"]>("/resident/home");
  const [adding, setAdding] = useState(false);
  const permanent = (q.data?.items ?? []).filter((v) => v.kind === "permanent").length;
  const pendingCount = (q.data?.items ?? []).filter((v) => v.status === "pending").length;
  return (
    <>
      <ResidentHead icon={<Car />} title="Araçlarım" sub="Kayıtlı plaka kapı görevlisinin ekranında görünür; misafir aracı için geçerlilik tarihi girilir."
        stats={q.data && [
          { label: "Kalıcı plaka", value: `${permanent} / ${q.data.limit}` },
          { label: "Misafir aracı", value: q.data.items.length - permanent },
          { label: "Onay bekleyen", value: pendingCount, tone: pendingCount ? "warn" : undefined },
        ]} />
      {q.isPending ? <Loading /> : q.isError ? <ErrorState error={q.error} /> : (
        <div className="r-split">
          <div className="r-split__col">
            {q.data.approval_required && <Alert tone="info">Eklediğiniz plaka site yönetimi onayladıktan sonra kapıda görünür.</Alert>}
            {adding ? <VehicleForm units={home.data?.units ?? []} onDone={() => setAdding(false)} /> : (
              <button className="btn btn--primary" style={{ width: "100%" }} type="button" onClick={() => setAdding(true)}><Plus aria-hidden="true" /> Araç ekle</button>
            )}
          </div>
          <div className="r-split__col">
            <div className="section-title">Kayıtlı araçlar</div>
            {q.data.items.length === 0 ? <Empty title="Kayıtlı aracınız yok" icon={<Car aria-hidden="true" />}>Eklediğiniz plakalar burada görünür.</Empty> : q.data.items.map((v) => <VehicleItem key={v.id} v={v} />)}
          </div>
        </div>
      )}
    </>
  );
}

function VehicleItem({ v }: { v: MyVehicle }) {
  const remove = useSiteMutation<Record<string, never>, MyVehicle>("POST", `/resident/vehicles/${v.id}/remove`);
  return (
    <div className="r-item">
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="r-item__title mono">{v.plate_display} <Badge tone={vehicleStatusTone(v.status)}>{vehicleStatus(v.status)}</Badge></div>
        <div className="r-item__meta">{[v.brand_model, v.color].filter(Boolean).join(" · ") || "—"} · {v.unit_name}</div>
        <div className="r-item__body">{vehicleKind(v.kind)}{v.valid_until && ` · ${formatDate(v.valid_until)} tarihine kadar`}</div>
        <div className="row" style={{ marginTop: "var(--s-2)" }}>
          <ConfirmButton className="btn btn--ghost btn--sm" danger title={`${v.plate_display} — kaldır`} confirmLabel="Kaldır" body="Plaka kapı ekranında görünmez." onConfirm={() => remove.mutateAsync({})}>Kaldır</ConfirmButton>
        </div>
      </div>
    </div>
  );
}

function VehicleForm({ units, onDone }: { units: MyUnit[]; onDone: () => void }) {
  const [f, setF] = useState({ plate: "", brand_model: "", color: "", kind: "permanent", valid_until: "", unit_id: units[0]?.unit_id ?? "" });
  const m = useSiteMutation<Record<string, unknown>, MyVehicle>("POST", "/resident/vehicles", { onSuccess: onDone });
  return (
    <form className="card" noValidate onSubmit={(e) => { e.preventDefault(); m.mutate({ ...f, plate: f.plate.replace(/\s/g, ""), unit_id: f.unit_id || undefined, valid_until: f.kind === "guest" ? f.valid_until : null }); }}>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        <UnitSelect units={units} value={f.unit_id} onChange={(v) => setF((x) => ({ ...x, unit_id: v }))} />
        <Field label="Plaka" required hint="ör. 34 ABC 123" error={fieldError(m.error, "plate")}>{(p) => <input {...p} className="field__input mono" autoComplete="off" value={f.plate} onChange={(e) => setF((x) => ({ ...x, plate: plateInput(e.target.value) }))} />}</Field>
        <Field label="Marka / model">{(p) => <input {...p} className="field__input" maxLength={60} value={f.brand_model} onChange={(e) => setF((x) => ({ ...x, brand_model: e.target.value }))} />}</Field>
        <Field label="Renk">{(p) => <input {...p} className="field__input" maxLength={30} value={f.color} onChange={(e) => setF((x) => ({ ...x, color: e.target.value }))} />}</Field>
        <Field label="Tür" required error={fieldError(m.error, "kind")}>{(p) => <select {...p} className="field__input" value={f.kind} onChange={(e) => setF((x) => ({ ...x, kind: e.target.value }))}><option value="permanent">{vehicleKind("permanent")}</option><option value="guest">{vehicleKind("guest")}</option></select>}</Field>
        {f.kind === "guest" && <Field label="Geçerlilik" required error={fieldError(m.error, "valid_until")}>{(p) => <input {...p} className="field__input" type="date" min={todayIso()} value={f.valid_until} onChange={(e) => setF((x) => ({ ...x, valid_until: e.target.value }))} />}</Field>}
      </div>
      <div className="card__foot row" style={{ gap: "var(--s-2)" }}><SubmitButton busy={m.isPending} disabled={!f.plate.trim()}>Ekle</SubmitButton><button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button></div>
    </form>
  );
}
