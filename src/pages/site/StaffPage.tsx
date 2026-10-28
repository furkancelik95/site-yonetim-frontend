import { useState, type FormEvent } from "react";
import { Building2, IdCard, KeyRound, Plus, Truck, Users } from "lucide-react";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { Schemas } from "../../api/types";
import { Avatar, Badge, ConfirmButton, Empty, ErrorState, Field, FormError, Kpi, Loading, PageHead, Segmented, SubmitButton, fieldError } from "../../components/ui";
import { formatDate, todayIso } from "../../lib/format";
import { useUrlState } from "../../lib/hooks";
import { staffEmployer } from "../../lib/labels";
import { P, useSite } from "../../site/SiteContext";

/**
 * Servis istekleri 18 ve 35 (IK-01). Maaş, T.C. kimlik no burada TUTULMAZ (KVKK); bordro sicil no ile bordroyu yapan
 * sistemde eşleşir. K29: kart sitedeki bir giriş hesabına bağlanır, ayrılış tarihi geçince erişim kendiliğinden kapanır.
 */
type StaffMember = Schemas["StaffOut"];
type Linkable = Schemas["LinkableUserOut"];
type OpenItems = Schemas["StaffOpenItemsOut"];

const digits = (v: string) => v.replace(/\D/g, "").replace(/^90/, "").replace(/^0/, "").slice(0, 10);
const maskPhone = (d: string) => [d.slice(0, 3), d.slice(3, 6), d.slice(6, 8), d.slice(8, 10)].filter(Boolean).join(" ");
const formatPhone = (e164: string) => e164.replace(/^\+90(\d{3})(\d{3})(\d{2})(\d{2})$/, "+90 $1 $2 $3 $4");
const nextDay = (d: string) => { const x = new Date(d + "T00:00:00"); x.setDate(x.getDate() + 1); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; };

/** Site personeli (Apsiyon "Personel"): kapı görevlisi, temizlik, bahçıvan — kadro ya da taşeron. */
export function StaffPage() {
  const { can } = useSite();
  const [s, set] = useUrlState({ durum: "aktif" });
  // Çalışan ve ayrılan listeleri ayrı okunur: üst sayılar çalışanlardan, tablo seçili sekmeden
  const active = useSiteGet<StaffMember[]>("/staff", { active: "true" });
  const left = useSiteGet<StaffMember[]>("/staff", { active: "false" });
  const q = s.durum === "aktif" ? active : left;
  const [editing, setEditing] = useState<StaffMember | "new" | null>(null);
  const manage = can(P.staffManage);
  const a = active.data ?? [];
  const count = (f: (m: StaffMember) => boolean) => (active.data ? a.filter(f).length : "—");
  return (
    <div className="stack">
      <PageHead
        title="Personel"
        subtitle="Sitede çalışanlar ve görevleri. Sisteme giriş hesabı Kullanıcılar ekranından açılır; burada karta bağlanır ve ayrılışta kendiliğinden kapanır."
        actions={manage && <button className="btn btn--primary" type="button" onClick={() => setEditing("new")}><Plus aria-hidden="true" /> Personel ekle</button>}
      />
      <div className="grid grid--kpi rise">
        <Kpi label="Çalışan" icon={<Users aria-hidden="true" />} value={active.data ? a.length : "—"} note={left.data ? `${left.data.length} ayrılan` : undefined} />
        <Kpi label="Kadrolu" icon={<Building2 aria-hidden="true" />} value={count((m) => m.employer === "site")} note="site kadrosunda" />
        <Kpi label="Taşeron" icon={<Truck aria-hidden="true" />} value={count((m) => m.employer === "contractor")} note="firma personeli" />
        <Kpi label="Giriş hesabı bağlı" tone="accent" icon={<KeyRound aria-hidden="true" />} value={count((m) => !!m.user_id && !m.access_closed_at)} note="Vardiyam ve izin talebi açık" />
      </div>
      {editing && <StaffForm m={editing === "new" ? null : editing} onDone={() => setEditing(null)} />}
      <Segmented label="Personel durumu" value={s.durum} onChange={(k) => set({ durum: k })} options={[{ value: "aktif", label: "Çalışan" }, { value: "ayrilan", label: "Ayrılan" }]} />
      <div className="card">
        <div className="card__body card__body--flush">
          {q.isPending ? <Loading /> : q.isError ? <div className="card__body"><ErrorState error={q.error} /></div> : q.data.length === 0 ? (
            <Empty title={s.durum === "aktif" ? "Personel eklenmemiş" : "Ayrılan personel yok"} icon={<IdCard aria-hidden="true" />} />
          ) : (
            <div className="table-wrap">
              <table className="data">
                <caption className="visually-hidden">Personel</caption>
                <thead><tr><th scope="col">Ad soyad</th><th scope="col">Görev</th><th scope="col">Kadro</th><th scope="col">Telefon</th><th scope="col">Giriş hesabı</th><th scope="col">Çalışma</th><th scope="col"><span className="visually-hidden">İşlem</span></th></tr></thead>
                <tbody>
                  {q.data.map((m) => (
                    <tr key={m.id}>
                      <td>
                        <div className="cell-person">
                          <Avatar name={m.full_name} size="sm" soft />
                          <div><div className="cell-main">{m.full_name}</div>{m.payroll_no ? <div className="cell-sub mono">Sicil {m.payroll_no}</div> : <div className="cell-sub">sicil no yok</div>}</div>
                        </div>
                      </td>
                      <td className="small">{m.position}{m.shift && <div className="cell-sub">{m.shift}</div>}</td>
                      <td>{m.employer === "site" ? <Badge tone="info">{staffEmployer(m.employer)}</Badge> : <span className="small">{m.contractor_name}<div className="cell-sub">{staffEmployer(m.employer)}</div></span>}</td>
                      <td className="small nowrap">{m.phone ? formatPhone(m.phone) : "—"}</td>
                      <td className="small">{m.user_name ?? "—"}{m.access_closed_at && <div className="cell-sub">erişim kapandı</div>}</td>
                      <td className="small nowrap">{m.end_date ? `${formatDate(m.start_date)} – ${formatDate(m.end_date)}` : `Başlangıç ${formatDate(m.start_date)}`}</td>
                      <td className="right nowrap">{manage && <StaffActions m={m} onEdit={() => setEditing(m)} />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StaffActions({ m, onEdit }: { m: StaffMember; onEdit: () => void }) {
  const [date, setDate] = useState(todayIso());
  const open = useSiteGet<OpenItems>(`/staff/${m.id}/open-items`, { after: date ? nextDay(date) : undefined }, { enabled: !m.end_date });
  const leave = useSiteMutation<{ end_date: string }, StaffMember>("PATCH", `/staff/${m.id}`);
  return (
    <span className="row" style={{ gap: "var(--s-1)", justifyContent: "flex-end" }}>
      <button className="btn btn--ghost btn--sm" type="button" onClick={onEdit}>Düzenle</button>
      {!m.end_date && (
        <ConfirmButton className="btn btn--ghost btn--sm" title={`${m.full_name} — ayrılış`} confirmLabel="Ayrılışı kaydet"
          body={<div className="stack" style={{ gap: "var(--s-3)" }}>
            <div className="field"><label className="field__label" htmlFor={`leave-${m.id}`}>Ayrılış tarihi (son çalışma günü)</label><input id={`leave-${m.id}`} className="field__input" type="date" min={m.start_date} value={date} onChange={(e) => setDate(e.target.value)} /></div>
            {open.data && (open.data.future_shifts > 0 || open.data.pending_leaves > 0) && <p className="small field__error mb-0">Ayrılıştan sonra {open.data.future_shifts > 0 ? `${open.data.future_shifts} vardiyası (ilki ${formatDate(open.data.first_shift)})` : ""}{open.data.future_shifts > 0 && open.data.pending_leaves > 0 ? " ve " : ""}{open.data.pending_leaves > 0 ? `${open.data.pending_leaves} bekleyen izni` : ""} var; vardiya planından başka personele devredin.</p>}
            <p className="small muted mb-0">Kart silinmez; geçmiş puantaj korunur. {m.user_id ? "Bağlı giriş hesabının site erişimi ayrılış gününden sonra kendiliğinden kapanır." : "Karta bağlı giriş hesabı yok."}</p>
          </div>}
          onConfirm={() => leave.mutateAsync({ end_date: date })}>
          Ayrıldı
        </ConfirmButton>
      )}
    </span>
  );
}

function StaffForm({ m, onDone }: { m: StaffMember | null; onDone: () => void }) {
  const [f, setF] = useState({
    full_name: m?.full_name ?? "", position: m?.position ?? "", employer: m?.employer ?? "site", contractor_name: m?.contractor_name ?? "",
    phone: m?.phone ? m.phone.slice(3) : "", start_date: m?.start_date ?? todayIso(), shift: m?.shift ?? "", payroll_no: m?.payroll_no ?? "", user_id: m?.user_id ?? "",
  });
  const [phoneErr, setPhoneErr] = useState<string>();
  const users = useSiteGet<Linkable[]>("/staff/linkable-users");
  const mut = useSiteMutation<Record<string, unknown>, StaffMember>(m ? "PATCH" : "POST", m ? `/staff/${m.id}` : "/staff", { onSuccess: onDone });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const checkPhone = () => {
    const d = digits(f.phone);
    const e = d && !/^5\d{9}$/.test(d) ? "Cep telefonu 5 ile başlayan 10 hane olmalı (5XX XXX XX XX)." : undefined;
    setPhoneErr(e);
    return e;
  };
  function submit(e: FormEvent) {
    e.preventDefault();
    if (checkPhone()) return;
    const d = digits(f.phone);
    mut.mutate({ ...f, phone: d ? `+90${d}` : null, contractor_name: f.employer === "contractor" ? f.contractor_name : null, payroll_no: f.payroll_no.trim() || null, user_id: f.user_id || null });
  }
  const options = (users.data ?? []).filter((u) => !u.staff_id || u.staff_id === m?.id);
  return (
    <form className="card" onSubmit={submit} noValidate>
      <div className="card__head"><span className="card__title">{m ? `${m.full_name} — düzenle` : "Personel ekle"}</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={mut.error} />
        <div className="grid grid--kpi">
          <Field label="Ad soyad" required error={fieldError(mut.error, "full_name")}>{(p) => <input {...p} className="field__input" autoComplete="off" maxLength={60} value={f.full_name} onChange={set("full_name")} />}</Field>
          <Field label="Görev" required error={fieldError(mut.error, "position")}>{(p) => <input {...p} className="field__input" list="staff-positions" value={f.position} onChange={set("position")} />}</Field>
          <Field label="Kadro" required error={fieldError(mut.error, "employer")}>{(p) => <select {...p} className="field__input" value={f.employer} onChange={set("employer")}><option value="site">{staffEmployer("site")}</option><option value="contractor">{staffEmployer("contractor")}</option></select>}</Field>
          {f.employer === "contractor" && <Field label="Firma" required error={fieldError(mut.error, "contractor_name")}>{(p) => <input {...p} className="field__input" value={f.contractor_name} onChange={set("contractor_name")} />}</Field>}
          <Field label="Cep telefonu" hint="İsteğe bağlı" error={phoneErr ?? fieldError(mut.error, "phone")}>{(p) => <input {...p} className="field__input" type="tel" inputMode="tel" placeholder="5XX XXX XX XX" value={maskPhone(digits(f.phone))} onChange={set("phone")} onBlur={checkPhone} />}</Field>
          <Field label="İşe başlama" required error={fieldError(mut.error, "start_date")}>{(p) => <input {...p} className="field__input" type="date" value={f.start_date} onChange={set("start_date")} />}</Field>
          <Field label="Vardiya / çalışma saati" hint="ör. Hafta içi 08:00–17:00">{(p) => <input {...p} className="field__input" value={f.shift} onChange={set("shift")} />}</Field>
          <Field label="Bordro sicil no" hint="Harf, rakam, tire; puantaj aktarımında kullanılır" error={fieldError(mut.error, "payroll_no")}>{(p) => <input {...p} className="field__input mono" maxLength={20} value={f.payroll_no} onChange={set("payroll_no")} />}</Field>
          <Field label="Giriş hesabı" hint="Vardiyam, izin talebi ve giriş-çıkış için" error={fieldError(mut.error, "user_id")}>{(p) => (
            <select {...p} className="field__input" value={f.user_id} onChange={set("user_id")}>
              <option value="">Bağlı değil</option>
              {options.map((u) => <option key={u.user_id} value={u.user_id}>{u.full_name} · {u.role_name}</option>)}
            </select>
          )}</Field>
        </div>
        <datalist id="staff-positions">{["Kapı görevlisi", "Güvenlik görevlisi", "Temizlik görevlisi", "Bahçıvan", "Teknik görevli", "Havuz görevlisi", "Site müdürü"].map((g) => <option key={g} value={g} />)}</datalist>
        <p className="small muted mb-0">Maaş ve T.C. kimlik numarası burada tutulmaz; bordro, sicil no ile bordroyu yapan sistemde. Sağlık bilgisi tutulmaz. Hesap listesinde yoksa önce Kullanıcılar ekranından ekleyin.</p>
      </div>
      <div className="card__foot row" style={{ gap: "var(--s-2)" }}>
        <SubmitButton busy={mut.isPending}>{m ? "Kaydet" : "Ekle"}</SubmitButton>
        <button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button>
      </div>
    </form>
  );
}
