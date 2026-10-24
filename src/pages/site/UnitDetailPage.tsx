import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import { ArrowLeftRight, Copy, Pencil, Plus, Trash2, UserPlus } from "lucide-react";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { Page, Schemas } from "../../api/types";
import { CustomValuesCard } from "../../components/CustomValuesCard";
import { MaskedContact } from "../../components/MaskedContact";
import { useToast } from "../../components/toast";
import { Alert, Badge, ConfirmButton, Empty, ErrorState, Field, FormError, Kpi, Loading, Money, PageHead, SubmitButton, fieldError } from "../../components/ui";
import { formatArea, formatDate, formatDateTime, todayIso } from "../../lib/format";
import { useDebounced, useUrlState } from "../../lib/hooks";
import { formatPhone, isTrMobile, phoneDigits, phoneMask, toE164 } from "../../lib/input";
import { accountKind, actorType, auditAction, householdPermission, householdStatus, packageStatus, partyRole, requestStatus, requestStatusTone, unitAttr, unitUsage, visitorKind, visitorStatus, visitorTone } from "../../lib/labels";
import { M, P, useSite } from "../../site/SiteContext";
import { VehiclesPage } from "./VehiclesPage";

type Unit = Schemas["UnitDetail"];
type Party = Unit["parties"][number];
type UnitType = Schemas["UnitTypeOut"];
type Person = Schemas["PersonOut"];
type Account = Schemas["site_yonetim__api__v1__payments__AccountOut"];
type Req = Schemas["RequestOut"];
type Pkg = Schemas["PackageOut"];
type Visitor = Schemas["VisitorOut"];
type Audit = Schemas["AuditOut"];
/** Servis isteği 19 ve 20'deki şekiller. */
interface Overview { balance: string | null; share_total: string; warnings: string[]; packages_waiting: number; vehicles: number; household: number }
interface AttrChange { id: string; effective_from: string; changes: Record<string, { from: unknown; to: unknown }>; changed_by: string; created_at: string; applied: boolean }
type Perm = "visitors" | "packages" | "reservations" | "requests";
interface Household { id: string; full_name: string; phone: string; invited_by: string; permissions: Record<Perm, boolean>; status: "invited" | "active" | "ended"; invite_link: string; created_at: string; ended_at: string | null }
const PERMS: Perm[] = ["visitors", "packages", "reservations", "requests"];

const WARN: Record<string, string> = {
  no_owner: "Bölümün maliki yok; demirbaş ve yatırım giderleri kimseye yazılamaz.",
  shares_incomplete: "Malik hisseleri toplamı %100 değil; malike yazılan giderler eksik dağıtılır.",
  no_land_share: "Arsa payı girilmemiş; arsa payına göre dağıtılan giderlerde bu bölüm pay almaz.",
};
const TABS = [["kisiler", "Kişiler"], ["finans", "Finans"], ["talepler", "Talepler"], ["araclar", "Araçlar"], ["guvenlik", "Güvenlik"], ["ozel", "Özel alanlar"], ["gecmis", "Geçmiş"]] as const;
type Panel = "edit" | "transfer" | null;

/** Bölüm 360° (YAP-03): bir bölümle ilgili her şey tek kartta; kişisel veri maskeli, hızlı eylemler üstte. */
export function UnitDetailPage() {
  const { unitId = "" } = useParams();
  const { site, can, shows } = useSite();
  const q = useSiteGet<Unit>(`/units/${unitId}`);
  const ov = useSiteGet<Overview>(`/units/${unitId}/overview`);
  const [s, set] = useUrlState({ sekme: "kisiler" });
  const [panel, setPanel] = useState<Panel>(null);
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const u = q.data;
  const base = `/s/${site.slug}`;
  const manage = can(P.unitsManage);
  const security = shows(M.packages, P.packages) || shows(M.visitors, P.visitors);
  const tabs = TABS.filter(([k]) => k === "kisiler" || k === "araclar" || k === "ozel" || (k === "finans" && can(P.financeRead)) || (k === "talepler" && shows(M.requests, P.requestsRead)) || (k === "guvenlik" && security) || (k === "gecmis" && can(P.auditRead)));
  const sekme = tabs.some(([k]) => k === s.sekme) ? s.sekme : "kisiler";
  const shareOff = !!ov.data && Math.abs(Number(ov.data.share_total) - 100) > 0.01;
  const toggle = (p: Panel) => setPanel((x) => (x === p ? null : p));
  return (
    <div className="stack">
      <PageHead
        title={`Bölüm ${u.display_name}`}
        subtitle={[u.block.name + " blok", u.floor !== null && u.floor !== undefined ? `${u.floor}. kat` : null, u.unit_type?.name, unitUsage(u.usage), !u.is_active ? "Pasif" : null].filter(Boolean).join(" · ")}
        actions={<>
          <Link className="btn" to={`${base}/daireler`}>Daireler</Link>
          {shows(M.requests, P.requestsCreate) && <Link className="btn" to={`${base}/talepler`}>Talep aç</Link>}
          {can(P.paymentRecord) && <Link className="btn" to={`${base}/tahsilat`}>Tahsilat kaydet</Link>}
          {manage && <button className="btn" type="button" aria-expanded={panel === "edit"} onClick={() => toggle("edit")}><Pencil aria-hidden="true" /> Düzenle</button>}
          {manage && <button className="btn btn--primary" type="button" aria-expanded={panel === "transfer"} onClick={() => toggle("transfer")}><ArrowLeftRight aria-hidden="true" /> Satış / veraset</button>}
        </>}
      />
      {ov.data && (
        <div className="grid grid--kpi">
          <Kpi label="Bakiye" value={<Money value={ov.data.balance} tone="balance" />} note={Number(ov.data.balance) > 0.005 ? "Borç" : Number(ov.data.balance) < -0.005 ? "Alacak" : "Borç yok"} />
          <Kpi label="Malik hissesi" value={`%${Number(ov.data.share_total).toLocaleString("tr-TR")}`} tone={shareOff ? "warn" : "ok"} note={shareOff ? "Toplam %100 olmalı" : "Tam"} />
          <Kpi label="Araç" value={ov.data.vehicles} />
          <Kpi label="Hane üyesi" value={ov.data.household} />
          {security && <Kpi label="Bekleyen kargo" value={ov.data.packages_waiting} tone={ov.data.packages_waiting ? "accent" : undefined} />}
        </div>
      )}
      {ov.data?.warnings.map((w) => <Alert key={w} tone="warn">{WARN[w] ?? w}</Alert>)}
      {panel === "edit" && <EditPanel u={u} onDone={() => setPanel(null)} />}
      {panel === "transfer" && <TransferForm u={u} onDone={() => setPanel(null)} />}

      <div className="card">
        <div className="card__head"><span className="card__title">Bölüm bilgisi</span>{manage && <button className="btn btn--ghost btn--sm ml-auto" type="button" onClick={() => toggle("edit")}>Düzenle</button>}</div>
        <div className="card__body grid grid--kpi">
          <Kpi small label="Brüt alan" value={formatArea(u.gross_area)} />
          <Kpi small label="Net alan" value={formatArea(u.net_area)} />
          <Kpi small label="Arsa payı" value={u.land_share_numerator && u.land_share_denominator ? `${u.land_share_numerator} / ${u.land_share_denominator}` : "—"} />
          <Kpi small label="Tip" value={u.unit_type?.name ?? "—"} />
          {u.commercial_title && <Kpi small label="Ticari unvan" value={u.commercial_title} />}
        </div>
      </div>

      <div className="row" role="tablist" aria-label="Bölüm kartı" style={{ gap: "var(--s-2)", flexWrap: "wrap" }}>
        {tabs.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={sekme === k} className={`btn btn--sm${sekme === k ? " btn--primary" : ""}`} onClick={() => set({ sekme: k })}>{l}</button>)}
      </div>
      {sekme === "kisiler" && <PeopleTab u={u} manage={manage} />}
      {sekme === "finans" && <FinanceTab u={u} />}
      {sekme === "talepler" && <RequestsTab u={u} />}
      {sekme === "araclar" && <VehiclesPage unitId={u.id} embedded />}
      {sekme === "guvenlik" && <SecurityTab u={u} />}
      {sekme === "ozel" && <div className="card"><div className="card__body"><CustomValuesCard entity="unit" id={u.id} /></div></div>}
      {sekme === "gecmis" && <HistoryTab u={u} />}
    </div>
  );
}

// ---------------------------------------------------------------- Kişiler
function PeopleTab({ u, manage }: { u: Unit; manage: boolean }) {
  const { can } = useSite();
  const [adding, setAdding] = useState(false);
  const current = u.parties.filter((p) => p.is_current);
  const past = u.parties.filter((p) => !p.is_current);
  return (
    <>
      <div className="card">
        <div className="card__head">
          <span className="card__title">Malik ve oturanlar</span>
          {manage && <button className="btn btn--sm ml-auto" type="button" onClick={() => setAdding((v) => !v)} aria-expanded={adding}><UserPlus aria-hidden="true" /> Kişi ekle</button>}
        </div>
        {adding && <AddPartyForm unitId={u.id} onDone={() => setAdding(false)} />}
        <div className="card__body card__body--flush"><PartyTable parties={current} unitId={u.id} canManage={manage} /></div>
        <div className="card__foot small muted">Aidat oturana, demirbaş ve yatırım giderleri malike yazılır (KMK m.22). Telefon ve e-posta maskelidir; "Göster" denetim kaydına yazılır.</div>
        {past.length > 0 && <details className="card__foot"><summary className="small">Geçmiş ({past.length})</summary><PartyTable parties={past} unitId={u.id} canManage={false} /></details>}
      </div>
      {can(P.peopleRead) && <HouseholdCard unitId={u.id} manage={manage} />}
    </>
  );
}

function PartyTable({ parties, unitId, canManage }: { parties: Party[]; unitId: string; canManage: boolean }) {
  if (parties.length === 0) return <p className="small muted" style={{ padding: "var(--s-4)", margin: 0 }}>Kayıtlı kişi yok.</p>;
  return (
    <div className="table-wrap"><table className="data">
      <caption className="visually-hidden">Bölümle ilişkili kişiler</caption>
      <thead><tr><th scope="col">Kişi</th><th scope="col">İlişki</th><th scope="col">İletişim</th><th scope="col">Başlangıç</th><th scope="col">Bitiş</th>{canManage && <th scope="col"><span className="visually-hidden">İşlem</span></th>}</tr></thead>
      <tbody>{parties.map((p) => (
        <tr key={p.id}>
          <td className="cell-main">{p.person.full_name}</td>
          <td>{partyRole(p.role)}{p.role === "owner" && p.share_percent && p.share_percent !== "100.00" && <span className="small muted"> · %{p.share_percent}</span>}</td>
          <td><MaskedContact personId={p.person.id} phone={p.person.phone} email={p.person.email} /></td>
          <td className="small nowrap">{formatDate(p.start_date)}</td>
          <td className="small nowrap">{formatDate(p.end_date)}</td>
          {canManage && <td className="right"><EndPartyButton unitId={unitId} party={p} /></td>}
        </tr>
      ))}</tbody>
    </table></div>
  );
}

function EndPartyButton({ unitId, party }: { unitId: string; party: Party }) {
  const [date, setDate] = useState(todayIso());
  const m = useSiteMutation<{ end_date: string }, unknown>("POST", `/units/${unitId}/parties/${party.id}/end`);
  return (
    <ConfirmButton className="btn btn--sm" title={`${party.person.full_name} — ilişkiyi sona erdir`} confirmLabel="Sona erdir" danger
      body={<div className="stack" style={{ gap: "var(--s-3)" }}><p className="mb-0">Kayıt silinmez; geçmişte kalır. Bu tarihten sonraki tahakkuklar bu kişiye yazılmaz.</p><div className="field"><label className="field__label" htmlFor={`end-${party.id}`}>Bitiş tarihi</label><input id={`end-${party.id}`} className="field__input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div></div>}
      onConfirm={() => m.mutateAsync({ end_date: date })}>
      Sona erdir
    </ConfirmButton>
  );
}

function AddPartyForm({ unitId, onDone }: { unitId: string; onDone: () => void }) {
  const [f, setF] = useState({ role: "tenant", start_date: todayIso(), share_percent: "100", first_name: "", last_name: "", phone: "", email: "" });
  const [person, setPerson] = useState<Person | null>(null);
  const m = useSiteMutation<Record<string, unknown>, unknown>("POST", `/units/${unitId}/parties`, { onSuccess: onDone });
  const up = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  function submit(e: FormEvent) {
    e.preventDefault();
    m.mutate({
      role: f.role, start_date: f.start_date, share_percent: f.role === "owner" ? f.share_percent.replace(",", ".") : undefined,
      person_id: person?.id ?? undefined,
      person: person ? undefined : { first_name: f.first_name.trim(), last_name: f.last_name.trim(), phone: f.phone.trim() ? toE164(f.phone) : null, email: f.email.trim().toLocaleLowerCase("tr-TR") || null },
    });
  }
  return (
    <form className="card__body stack" style={{ gap: "var(--s-4)", borderBottom: "1px solid var(--line)" }} onSubmit={submit} noValidate>
      <FormError error={m.error} />
      <div className="grid grid--kpi">
        <Field label="İlişki" required>{(p) => <select {...p} className="field__input" value={f.role} onChange={up("role")}>{["tenant", "owner", "resident", "proxy"].map((r) => <option key={r} value={r}>{partyRole(r)}</option>)}</select>}</Field>
        <Field label="Başlangıç" required error={fieldError(m.error, "start_date")}>{(p) => <input {...p} className="field__input" type="date" value={f.start_date} onChange={up("start_date")} />}</Field>
        {f.role === "owner" && <Field label="Hisse (%)" error={fieldError(m.error, "share_percent")}>{(p) => <input {...p} className="field__input" inputMode="decimal" value={f.share_percent} onChange={up("share_percent")} />}</Field>}
      </div>
      <Field label="Kayıtlı kişi" hint="Kişi sistemde varsa seçin; mükerrer kayıt oluşmaz. Yoksa aşağıya yeni kişiyi yazın.">{() => <PersonSearch value={person} onChange={setPerson} />}</Field>
      {!person && (
        <div className="grid grid--kpi">
          <Field label="Ad" required error={fieldError(m.error, "first_name")}>{(p) => <input {...p} className="field__input" autoComplete="off" value={f.first_name} onChange={up("first_name")} />}</Field>
          <Field label="Soyad" required error={fieldError(m.error, "last_name")}>{(p) => <input {...p} className="field__input" autoComplete="off" value={f.last_name} onChange={up("last_name")} />}</Field>
          <Field label="Telefon" error={fieldError(m.error, "phone")}>{(p) => <input {...p} className="field__input" type="tel" inputMode="tel" placeholder="5XX XXX XX XX" value={phoneMask(phoneDigits(f.phone))} onChange={up("phone")} />}</Field>
          <Field label="E-posta" error={fieldError(m.error, "email")}>{(p) => <input {...p} className="field__input" type="email" inputMode="email" value={f.email} onChange={up("email")} />}</Field>
        </div>
      )}
      {f.role === "tenant" && <p className="small muted mb-0">Kiracı eklendiğinde aidat, başlangıç tarihinden sonraki tahakkuklarda kiracının hesabına yazılır.</p>}
      <div className="row" style={{ gap: "var(--s-2)" }}>
        <SubmitButton busy={m.isPending} disabled={!person && (!f.first_name.trim() || !f.last_name.trim())}>Ekle</SubmitButton>
        <button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button>
      </div>
    </form>
  );
}

/** Kayıtlı kişi arama: mükerrer kişi kaydını baştan önler (YAP-04). */
function PersonSearch({ value, onChange }: { value: Person | null; onChange: (p: Person | null) => void }) {
  const [text, setText] = useState("");
  const q = useDebounced(text.trim(), 250);
  const r = useSiteGet<Page<Person>>("/people", { q, page_size: 8 }, { enabled: q.length > 1 });
  if (value) return <div className="row" style={{ gap: "var(--s-2)", minHeight: 44 }}><span className="strong">{value.full_name}</span><button className="btn btn--ghost btn--sm" type="button" onClick={() => onChange(null)}>Değiştir</button></div>;
  return (
    <div className="stack" style={{ gap: "var(--s-1)" }}>
      <input className="field__input" type="search" placeholder="Ad, telefon ya da e-posta ile ara" aria-label="Kayıtlı kişi ara" value={text} onChange={(e) => setText(e.target.value)} />
      {q.length > 1 && r.data && (r.data.items.length === 0 ? <span className="small muted">Kayıtlı kişi bulunamadı; yeni kişi girin.</span> : (
        <div className="row" style={{ gap: "var(--s-1)", flexWrap: "wrap" }}>{r.data.items.map((p) => <button key={p.id} type="button" className="btn btn--sm" onClick={() => onChange(p)}>{p.full_name}</button>)}</div>
      ))}
    </div>
  );
}

function HouseholdCard({ unitId, manage }: { unitId: string; manage: boolean }) {
  const toast = useToast();
  const q = useSiteGet<Household[]>(`/units/${unitId}/household`);
  const [adding, setAdding] = useState(false);
  return (
    <div className="card">
      <div className="card__head"><span className="card__title">Hane üyeleri</span><span className="card__meta">aile bireyleri, yardımcılar; sakin kendisi de ekler</span>{manage && <button className="btn btn--sm ml-auto" type="button" aria-expanded={adding} onClick={() => setAdding((v) => !v)}><Plus aria-hidden="true" /> Davet et</button>}</div>
      {adding && <HouseholdForm unitId={unitId} onDone={() => setAdding(false)} />}
      <div className="card__body card__body--flush">
        {q.isPending ? <Loading /> : !q.data || q.data.length === 0 ? <p className="small muted" style={{ padding: "var(--s-4)", margin: 0 }}>Hane üyesi yok.</p> : (
          <div className="table-wrap"><table className="data">
            <caption className="visually-hidden">Hane üyeleri</caption>
            <thead><tr><th scope="col">Kişi</th><th scope="col">Yetkiler</th><th scope="col">Durum</th><th scope="col">Davet eden</th>{manage && <th scope="col"><span className="visually-hidden">İşlem</span></th>}</tr></thead>
            <tbody>{q.data.map((h) => <HouseholdRow key={h.id} h={h} manage={manage} onCopy={() => navigator.clipboard?.writeText(h.invite_link).then(() => toast("Davet bağlantısı kopyalandı."))} />)}</tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}

function HouseholdRow({ h, manage, onCopy }: { h: Household; manage: boolean; onCopy: () => void }) {
  const end = useSiteMutation<Record<string, never>, Household>("POST", `/household/${h.id}/end`);
  return (
    <tr style={h.status === "ended" ? { opacity: 0.6 } : undefined}>
      <td><div className="cell-main">{h.full_name}</div><div className="cell-sub">{formatPhone(h.phone)}</div></td>
      <td className="small">{PERMS.filter((p) => h.permissions[p]).map(householdPermission).join(", ") || "—"}</td>
      <td><Badge tone={h.status === "active" ? "ok" : h.status === "invited" ? "info" : "muted"}>{householdStatus(h.status)}</Badge></td>
      <td className="small">{h.invited_by}<div className="cell-sub">{formatDateTime(h.created_at)}</div></td>
      {manage && <td className="right nowrap">{h.status === "invited" && <button className="btn btn--ghost btn--sm" type="button" onClick={onCopy}><Copy aria-hidden="true" /> Davet bağlantısı</button>} {h.status !== "ended" && <ConfirmButton className="btn btn--ghost btn--sm" danger title={`${h.full_name} — hane üyeliğini bitir`} confirmLabel="Bitir" body="Kişi uygulamaya erişemez; ziyaretçi ve kargo yetkileri kalkar." onConfirm={() => end.mutateAsync({})}>Bitir</ConfirmButton>}</td>}
    </tr>
  );
}

function HouseholdForm({ unitId, onDone }: { unitId: string; onDone: () => void }) {
  const [f, setF] = useState({ full_name: "", phone: "" });
  const [perms, setPerms] = useState<Record<Perm, boolean>>({ visitors: true, packages: true, reservations: false, requests: false });
  const [phoneErr, setPhoneErr] = useState<string>();
  const m = useSiteMutation<Record<string, unknown>, Household>("POST", `/units/${unitId}/household`, { onSuccess: onDone });
  return (
    <form className="card__body stack" style={{ gap: "var(--s-3)", borderBottom: "1px solid var(--line)" }} noValidate onSubmit={(e) => { e.preventDefault(); if (!isTrMobile(f.phone)) return setPhoneErr("Cep telefonu 5 ile başlayan 10 hane olmalı."); m.mutate({ full_name: f.full_name.trim(), phone: toE164(f.phone), permissions: perms }); }}>
      <FormError error={m.error} />
      <div className="grid grid--kpi">
        <Field label="Ad soyad" required error={fieldError(m.error, "full_name")}>{(p) => <input {...p} className="field__input" maxLength={60} value={f.full_name} onChange={(e) => setF((x) => ({ ...x, full_name: e.target.value }))} />}</Field>
        <Field label="Cep telefonu" required error={phoneErr ?? fieldError(m.error, "phone")}>{(p) => <input {...p} className="field__input" type="tel" inputMode="tel" placeholder="5XX XXX XX XX" value={phoneMask(phoneDigits(f.phone))} onChange={(e) => { setF((x) => ({ ...x, phone: e.target.value })); setPhoneErr(undefined); }} />}</Field>
      </div>
      <div className="row" style={{ gap: "var(--s-2) var(--s-4)" }}>{PERMS.map((p) => <label key={p} className="check"><input type="checkbox" checked={perms[p]} onChange={(e) => setPerms((x) => ({ ...x, [p]: e.target.checked }))} /><span>{householdPermission(p)}</span></label>)}</div>
      <p className="small muted mb-0">SMS gönderimi henüz yok (K5); davet bağlantısını kişiye siz iletirsiniz. Hane üyesi borç ve ekstre göremez.</p>
      <div className="row" style={{ gap: "var(--s-2)" }}><SubmitButton busy={m.isPending} disabled={!f.full_name.trim() || !f.phone}>Davet et</SubmitButton><button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button></div>
    </form>
  );
}

// ---------------------------------------------------------------- Finans / talepler / güvenlik / geçmiş
function FinanceTab({ u }: { u: Unit }) {
  const { site } = useSite();
  const q = useSiteGet<Page<Account>>("/accounts", { unit_id: u.id, page_size: 50 });
  return (
    <div className="card">
      <div className="card__head"><span className="card__title">Cari hesaplar</span></div>
      <div className="card__body card__body--flush">
        {q.isPending ? <Loading /> : q.isError ? <div className="card__body"><ErrorState error={q.error} /></div> : q.data.items.length === 0 ? <Empty title="Cari hesap yok" /> : (
          <div className="table-wrap"><table className="data">
            <caption className="visually-hidden">Bölümün cari hesapları</caption>
            <thead><tr><th scope="col">Hesap</th><th scope="col">Referans</th><th scope="col" className="right">Bakiye</th><th scope="col">En eski vade</th><th scope="col"><span className="visually-hidden">İşlem</span></th></tr></thead>
            <tbody>{q.data.items.map((a) => (
              <tr key={a.id}>
                <td><div className="cell-main">{accountKind(a.kind)} {a.is_closed && <Badge>Kapalı</Badge>}</div>{a.person_name && <div className="cell-sub">{a.person_name}</div>}</td>
                <td className="mono xs">{a.reference_code}</td>
                <td className="right"><Money value={a.balance} tone="balance" /></td>
                <td className="small nowrap">{formatDate(a.oldest_open_due_date)}</td>
                <td className="right"><Link className="btn btn--sm" to={`/s/${site.slug}/cari/${a.id}`}>Ekstre</Link></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
      <div className="card__foot small muted">Tahsilat ve borçsuzluk belgesi işlemleri ekstre ekranındadır.</div>
    </div>
  );
}

function RequestsTab({ u }: { u: Unit }) {
  const { site } = useSite();
  const q = useSiteGet<Page<Req>>("/requests", { unit_id: u.id, page_size: 50 });
  return (
    <div className="card">
      <div className="card__head"><span className="card__title">Talepler</span><span className="card__meta ml-auto">bu bölümden açılanlar</span></div>
      <div className="card__body card__body--flush">
        {q.isPending ? <Loading /> : q.isError ? <div className="card__body"><ErrorState error={q.error} /></div> : q.data.items.length === 0 ? <Empty title="Talep yok" /> : (
          <div className="table-wrap"><table className="data">
            <caption className="visually-hidden">Bölümün talepleri</caption>
            <thead><tr><th scope="col">Talep</th><th scope="col">Durum</th><th scope="col">Açan</th><th scope="col">Tarih</th></tr></thead>
            <tbody>{q.data.items.map((r) => (
              <tr key={r.id}>
                <td><Link className="cell-main" to={`/s/${site.slug}/talepler/${r.id}`}>{r.title}</Link><div className="cell-sub mono">{r.number}</div></td>
                <td><Badge tone={requestStatusTone(r.status)}>{requestStatus(r.status)}</Badge></td>
                <td className="small">{r.reporter_name ?? r.created_by_name ?? "—"}</td>
                <td className="small nowrap">{formatDateTime(r.created_at)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}

function SecurityTab({ u }: { u: Unit }) {
  const { shows } = useSite();
  const pk = useSiteGet<Page<Pkg>>("/packages", { unit_id: u.id, page_size: 50 }, { enabled: shows(M.packages, P.packages) });
  const vi = useSiteGet<Page<Visitor>>("/visitors", { unit_id: u.id, page_size: 50 }, { enabled: shows(M.visitors, P.visitors) });
  return (
    <div className="grid grid--2">
      {shows(M.packages, P.packages) && (
        <div className="card">
          <div className="card__head"><span className="card__title">Kargolar</span></div>
          <div className="card__body card__body--flush">
            {pk.isPending ? <Loading /> : !pk.data || pk.data.items.length === 0 ? <Empty title="Kargo kaydı yok" /> : (
              <div className="table-wrap"><table className="data">
                <caption className="visually-hidden">Bölümün kargoları</caption>
                <thead><tr><th scope="col">Kargo</th><th scope="col">Durum</th><th scope="col">Geldi</th></tr></thead>
                <tbody>{pk.data.items.map((p) => <tr key={p.id}><td className="cell-main">{p.carrier ?? "Kargo"}</td><td><Badge tone={p.status === "waiting" ? "info" : "muted"}>{packageStatus(p.status)}</Badge></td><td className="small nowrap">{formatDateTime(p.received_at)}</td></tr>)}</tbody>
              </table></div>
            )}
          </div>
        </div>
      )}
      {shows(M.visitors, P.visitors) && (
        <div className="card">
          <div className="card__head"><span className="card__title">Ziyaretçiler</span></div>
          <div className="card__body card__body--flush">
            {vi.isPending ? <Loading /> : !vi.data || vi.data.items.length === 0 ? <Empty title="Ziyaretçi kaydı yok" /> : (
              <div className="table-wrap"><table className="data">
                <caption className="visually-hidden">Bölümün ziyaretçileri</caption>
                <thead><tr><th scope="col">Ziyaretçi</th><th scope="col">Durum</th><th scope="col">Tarih</th></tr></thead>
                <tbody>{vi.data.items.map((v) => <tr key={v.id}><td><div className="cell-main">{v.full_name}</div><div className="cell-sub">{visitorKind(v.kind)}{v.plate_number ? ` · ${v.plate_number}` : ""}</div></td><td><Badge tone={visitorTone(v.status)}>{visitorStatus(v.status)}</Badge></td><td className="small nowrap">{formatDate(v.visit_date ?? v.expected_on)}</td></tr>)}</tbody>
              </table></div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function HistoryTab({ u }: { u: Unit }) {
  const attrs = useSiteGet<AttrChange[]>(`/units/${u.id}/attribute-history`);
  const audit = useSiteGet<Page<Audit>>("/audit", { entity: "units", entity_id: u.id, page_size: 50 });
  return (
    <div className="stack">
      <div className="card">
        <div className="card__head"><span className="card__title">Öznitelik değişiklikleri</span><span className="card__meta ml-auto">yürürlük tarihli; geçmiş tahakkuk değişmez</span></div>
        <div className="card__body card__body--flush">
          {attrs.isPending ? <Loading /> : !attrs.data || attrs.data.length === 0 ? <Empty title="Değişiklik yok" /> : (
            <div className="table-wrap"><table className="data">
              <caption className="visually-hidden">Öznitelik değişiklikleri</caption>
              <thead><tr><th scope="col">Yürürlük</th><th scope="col">Değişiklik</th><th scope="col">Yapan</th><th scope="col">Durum</th></tr></thead>
              <tbody>{attrs.data.map((c) => (
                <tr key={c.id}>
                  <td className="small nowrap">{formatDate(c.effective_from)}</td>
                  <td className="small">{Object.entries(c.changes).map(([k, v]) => <div key={k}>{unitAttr(k)}: <span className="muted">{String(v.from ?? "—")}</span> → <strong>{String(v.to ?? "—")}</strong></div>)}</td>
                  <td className="small">{c.changed_by}<div className="cell-sub">{formatDateTime(c.created_at)}</div></td>
                  <td>{c.applied ? <Badge tone="ok">Uygulandı</Badge> : <Badge tone="info">Planlı</Badge>}</td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </div>
      </div>
      <div className="card">
        <div className="card__head"><span className="card__title">Denetim kaydı</span></div>
        <div className="card__body card__body--flush">
          {audit.isPending ? <Loading /> : !audit.data || audit.data.items.length === 0 ? <Empty title="Kayıt yok" /> : (
            <div className="table-wrap"><table className="data">
              <caption className="visually-hidden">Bölümün denetim kaydı</caption>
              <thead><tr><th scope="col">Zaman</th><th scope="col">İşlem</th><th scope="col">Yapan</th><th scope="col">Gerekçe</th></tr></thead>
              <tbody>{audit.data.items.map((a) => <tr key={a.id}><td className="small nowrap">{formatDateTime(a.at)}</td><td className="small">{auditAction(a.action)}</td><td className="small">{a.actor_name}<div className="cell-sub">{actorType(a.actor_type)}</div></td><td className="small">{a.reason ?? "—"}</td></tr>)}</tbody>
            </table></div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Düzenleme
function EditPanel({ u, onDone }: { u: Unit; onDone: () => void }) {
  return (
    <div className="grid grid--2">
      <IdentityForm u={u} onDone={onDone} />
      <AttrForm u={u} onDone={onDone} />
    </div>
  );
}

/** Kimlik bilgileri: anında geçerli (gerçek PATCH /units/{id}). */
function IdentityForm({ u, onDone }: { u: Unit; onDone: () => void }) {
  const [f, setF] = useState({ number: u.number, floor: u.floor != null ? String(u.floor) : "", usage: u.usage, commercial_title: u.commercial_title ?? "", is_active: u.is_active });
  const m = useSiteMutation<Record<string, unknown>, Unit>("PATCH", `/units/${u.id}`, { onSuccess: onDone });
  return (
    <form className="card" noValidate onSubmit={(e) => { e.preventDefault(); m.mutate({ number: f.number.trim(), floor: f.floor === "" ? null : Number(f.floor), usage: f.usage, commercial_title: f.commercial_title.trim() || null, is_active: f.is_active }); }}>
      <div className="card__head"><span className="card__title">Kimlik bilgileri</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        <div className="grid grid--kpi">
          <Field label="Bölüm no" required error={fieldError(m.error, "number")}>{(p) => <input {...p} className="field__input" value={f.number} onChange={(e) => setF((x) => ({ ...x, number: e.target.value }))} />}</Field>
          <Field label="Kat" error={fieldError(m.error, "floor")}>{(p) => <input {...p} className="field__input" inputMode="numeric" value={f.floor} onChange={(e) => setF((x) => ({ ...x, floor: e.target.value.replace(/[^\d-]/g, "").slice(0, 3) }))} />}</Field>
          <Field label="Kullanım" error={fieldError(m.error, "usage")}>{(p) => <select {...p} className="field__input" value={f.usage} onChange={(e) => setF((x) => ({ ...x, usage: e.target.value }))}>{["residential", "commercial", "storage", "parking"].map((k) => <option key={k} value={k}>{unitUsage(k)}</option>)}</select>}</Field>
          {f.usage === "commercial" && <Field label="Ticari unvan" error={fieldError(m.error, "commercial_title")}>{(p) => <input {...p} className="field__input" maxLength={120} value={f.commercial_title} onChange={(e) => setF((x) => ({ ...x, commercial_title: e.target.value }))} />}</Field>}
        </div>
        <label className="check"><input type="checkbox" checked={f.is_active} onChange={(e) => setF((x) => ({ ...x, is_active: e.target.checked }))} /><span>Etkin (pasif bölüm tahakkuk almaz)</span></label>
      </div>
      <div className="card__foot row" style={{ gap: "var(--s-2)" }}><SubmitButton busy={m.isPending} disabled={!f.number.trim()}>Kaydet</SubmitButton><button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button></div>
    </form>
  );
}

/** Ölçü ve pay: yürürlük tarihli (istek 19). Geçmiş döneme yazılamaz; ileri tarih planlanır. */
function AttrForm({ u, onDone }: { u: Unit; onDone: () => void }) {
  const types = useSiteGet<Page<UnitType>>("/unit-types", { page_size: 200 });
  const [f, setF] = useState({ effective_from: todayIso(), gross_area: u.gross_area ?? "", net_area: u.net_area ?? "", land_share_numerator: u.land_share_numerator != null ? String(u.land_share_numerator) : "", land_share_denominator: u.land_share_denominator != null ? String(u.land_share_denominator) : "", unit_type_id: u.unit_type?.id ?? "" });
  const m = useSiteMutation<Record<string, unknown>, Unit>("PATCH", `/units/${u.id}/attributes`, { onSuccess: onDone });
  const monthStart = todayIso().slice(0, 7) + "-01";
  const up = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <form className="card" noValidate onSubmit={(e) => { e.preventDefault(); m.mutate({ effective_from: f.effective_from, gross_area: f.gross_area.replace(",", ".") || null, net_area: f.net_area.replace(",", ".") || null, land_share_numerator: f.land_share_numerator === "" ? null : Number(f.land_share_numerator), land_share_denominator: f.land_share_denominator === "" ? null : Number(f.land_share_denominator), unit_type_id: f.unit_type_id || null }); }}>
      <div className="card__head"><span className="card__title">Ölçü, arsa payı ve tip</span><span className="card__meta ml-auto">yürürlük tarihli</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        <div className="grid grid--kpi">
          <Field label="Yürürlük tarihi" required hint="Bu ay başından önce olamaz; ileri tarih planlanır" error={fieldError(m.error, "effective_from")}>{(p) => <input {...p} className="field__input" type="date" min={monthStart} value={f.effective_from} onChange={up("effective_from")} />}</Field>
          <Field label="Daire tipi" error={fieldError(m.error, "unit_type_id")}>{(p) => <select {...p} className="field__input" value={f.unit_type_id} onChange={up("unit_type_id")}><option value="">Seçilmedi</option>{types.data?.items.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>}</Field>
          <Field label="Brüt m²" error={fieldError(m.error, "gross_area")}>{(p) => <input {...p} className="field__input" inputMode="decimal" value={f.gross_area} onChange={up("gross_area")} />}</Field>
          <Field label="Net m²" error={fieldError(m.error, "net_area")}>{(p) => <input {...p} className="field__input" inputMode="decimal" value={f.net_area} onChange={up("net_area")} />}</Field>
          <Field label="Arsa payı (pay)" error={fieldError(m.error, "land_share_numerator")}>{(p) => <input {...p} className="field__input" inputMode="numeric" value={f.land_share_numerator} onChange={(e) => setF((x) => ({ ...x, land_share_numerator: e.target.value.replace(/\D/g, "") }))} />}</Field>
          <Field label="Arsa payı (payda)" error={fieldError(m.error, "land_share_denominator")}>{(p) => <input {...p} className="field__input" inputMode="numeric" value={f.land_share_denominator} onChange={(e) => setF((x) => ({ ...x, land_share_denominator: e.target.value.replace(/\D/g, "") }))} />}</Field>
        </div>
        <p className="small muted mb-0">Geçmiş tahakkuklar değişmez; yeni değer yürürlük tarihinden sonraki tahakkuklarda kullanılır. Değişiklik Geçmiş sekmesinde görünür.</p>
      </div>
      <div className="card__foot row" style={{ gap: "var(--s-2)" }}><SubmitButton busy={m.isPending}>Kaydet</SubmitButton><button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button></div>
    </form>
  );
}

// ---------------------------------------------------------------- Satış / veraset
interface NewOwner { person: Person | null; first_name: string; last_name: string; phone: string; email: string; share: string }
const emptyOwner = (share: string): NewOwner => ({ person: null, first_name: "", last_name: "", phone: "", email: "", share });

/** Malik değişimi (istek 21): eski malikler devir tarihinde kapanır, yeniler aynı gün başlar; borç eski malikte kalır (K10). */
function TransferForm({ u, onDone }: { u: Unit; onDone: () => void }) {
  const [f, setF] = useState({ reason: "sale", transfer_date: todayIso() });
  const [owners, setOwners] = useState<NewOwner[]>([emptyOwner("100")]);
  const m = useSiteMutation<Record<string, unknown>, Unit>("POST", `/units/${u.id}/ownership-transfer`, { onSuccess: onDone });
  const current = u.parties.filter((p) => p.is_current && p.role === "owner");
  const total = owners.reduce((s, o) => s + Number(o.share.replace(",", ".") || 0), 0);
  const upd = (i: number, patch: Partial<NewOwner>) => setOwners((list) => list.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  function submit(e: FormEvent) {
    e.preventDefault();
    m.mutate({
      reason: f.reason, transfer_date: f.transfer_date, debt_policy: "stays_with_seller",
      new_owners: owners.map((o) => ({ person_id: o.person?.id, person: o.person ? undefined : { first_name: o.first_name.trim(), last_name: o.last_name.trim(), phone: o.phone.trim() ? toE164(o.phone) : null, email: o.email.trim().toLocaleLowerCase("tr-TR") || null }, share_percent: o.share.replace(",", ".") })),
    });
  }
  const ready = owners.every((o) => o.person || (o.first_name.trim() && o.last_name.trim())) && Math.abs(total - 100) < 0.01;
  return (
    <form className="card" onSubmit={submit} noValidate>
      <div className="card__head"><span className="card__title">Satış / veraset — malik değişimi</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-4)" }}>
        <FormError error={m.error} />
        <div className="small">Şu anki malik: {current.length ? current.map((p) => `${p.person.full_name} (%${p.share_percent})`).join(", ") : <span className="muted">yok</span>}. Devir tarihinde ilişkileri kapanır; kayıtları geçmişte kalır.</div>
        <div className="grid grid--kpi">
          <Field label="Neden" required error={fieldError(m.error, "reason")}>{(p) => <select {...p} className="field__input" value={f.reason} onChange={(e) => setF((x) => ({ ...x, reason: e.target.value }))}><option value="sale">Satış</option><option value="inheritance">Veraset</option></select>}</Field>
          <Field label="Devir tarihi" required error={fieldError(m.error, "transfer_date")}>{(p) => <input {...p} className="field__input" type="date" value={f.transfer_date} onChange={(e) => setF((x) => ({ ...x, transfer_date: e.target.value }))} />}</Field>
          <Field label="Devir öncesi borç" hint="Yeni malike devir hukuki teyit bekliyor (K10)" error={fieldError(m.error, "debt_policy")}>{(p) => <select {...p} className="field__input" value="stays_with_seller" disabled><option value="stays_with_seller">Eski malikte kalır</option></select>}</Field>
        </div>
        <div className="stack" style={{ gap: "var(--s-3)" }}>
          <div className="row row--between"><span className="field__label">Yeni malikler</span><span className={`small ${Math.abs(total - 100) < 0.01 ? "muted" : "field__error"}`}>Hisse toplamı %{total.toLocaleString("tr-TR")} {Math.abs(total - 100) < 0.01 ? "" : "— tam %100 olmalı"}</span></div>
          {fieldError(m.error, "new_owners") && <span className="field__error" role="alert">{fieldError(m.error, "new_owners")}</span>}
          {owners.map((o, i) => (
            <div key={i} className="stack" style={{ gap: "var(--s-2)", border: "1px solid var(--line)", borderRadius: "var(--r-md)", padding: "var(--s-3)" }}>
              <div className="row row--between">
                <span className="strong small">{i + 1}. malik</span>
                {owners.length > 1 && <button className="btn btn--ghost btn--sm btn--icon" type="button" aria-label={`${i + 1}. maliki kaldır`} onClick={() => setOwners((l) => l.filter((_, j) => j !== i))}><Trash2 aria-hidden="true" /></button>}
              </div>
              <PersonSearch value={o.person} onChange={(p) => upd(i, { person: p })} />
              {!o.person && (
                <div className="grid grid--kpi">
                  <Field label="Ad" required>{(p) => <input {...p} className="field__input" value={o.first_name} onChange={(e) => upd(i, { first_name: e.target.value })} />}</Field>
                  <Field label="Soyad" required>{(p) => <input {...p} className="field__input" value={o.last_name} onChange={(e) => upd(i, { last_name: e.target.value })} />}</Field>
                  <Field label="Telefon">{(p) => <input {...p} className="field__input" type="tel" inputMode="tel" placeholder="5XX XXX XX XX" value={phoneMask(phoneDigits(o.phone))} onChange={(e) => upd(i, { phone: e.target.value })} />}</Field>
                  <Field label="E-posta">{(p) => <input {...p} className="field__input" type="email" inputMode="email" value={o.email} onChange={(e) => upd(i, { email: e.target.value })} />}</Field>
                </div>
              )}
              <Field label="Hisse (%)" required>{(p) => <input {...p} className="field__input" inputMode="decimal" style={{ maxWidth: "8rem" }} value={o.share} onChange={(e) => upd(i, { share: e.target.value.replace(/[^\d.,]/g, "").slice(0, 6) })} />}</Field>
            </div>
          ))}
          <div><button className="btn btn--sm" type="button" onClick={() => setOwners((l) => [...l, emptyOwner("0")])}><Plus aria-hidden="true" /> Malik ekle</button></div>
        </div>
        <p className="small muted mb-0">Tapu / veraset ilamı görüntüsü bu sürümde yüklenmez; belge yönetimde dosyalanır.</p>
      </div>
      <div className="card__foot row" style={{ gap: "var(--s-2)" }}><SubmitButton busy={m.isPending} disabled={!ready}>Devri kaydet</SubmitButton><button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button></div>
    </form>
  );
}
