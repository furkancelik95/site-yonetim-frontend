import { useEffect, useState, type FormEvent } from "react";
import { Archive, DoorOpen, Package, Pencil, Plus, UserRoundPlus } from "lucide-react";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { Page, Schemas } from "../../api/types";
import { Alert, Badge, Empty, ErrorState, Field, FormError, Kpi, Loading, PageHead, SubmitButton, fieldError } from "../../components/ui";
import { gateKind, parcelMethod, unannouncedMethod } from "../../lib/labels";

type Gate = Schemas["GateOut"];
type Settings = Schemas["SecuritySettingsOut"];

/** Kapılar ve güvenlik ayarları (GUV-08): kapı tanımları, habersiz ziyaretçi yöntemi, kargo teslimi, saklama süresi. */
export function SecuritySettingsPage() {
  const gates = useSiteGet<Gate[]>("/gates");
  const blocks = useSiteGet<Page<Schemas["BlockOut"]>>("/blocks", { page_size: 200 });
  const [editing, setEditing] = useState<Gate | "new" | null>(null);
  const st = useSiteGet<Settings>("/settings/security");
  const g = gates.data ?? [];
  return (
    <div className="stack">
      <PageHead title="Güvenlik ayarları" subtitle="Kapılar ve kapıdaki süreçlerin yöntemleri. Değişiklik kapı ekranlarına hemen yansır." actions={<button className="btn btn--primary" type="button" onClick={() => setEditing("new")}><Plus aria-hidden="true" /> Kapı ekle</button>} />
      {gates.data && st.data ? (
        <div className="grid grid--kpi rise">
          <Kpi label="Etkin kapı" icon={<DoorOpen aria-hidden="true" />} value={g.filter((x) => x.is_active).length} note={`${g.length} tanımlı kapı`} />
          <Kpi label="Habersiz ziyaretçi" icon={<UserRoundPlus aria-hidden="true" />} value={unannouncedMethod(st.data.unannounced_method)} small note={st.data.unannounced_method === "approval" ? `${st.data.approval_timeout_seconds} sn bekleme` : `${Object.keys(st.data.gate_methods).length} kapı istisnası`} />
          <Kpi label="Kargo teslimi" icon={<Package aria-hidden="true" />} value={parcelMethod(st.data.parcel_method)} small note={`${st.data.parcel_long_wait_days} günde uzun bekleyen`} />
          <Kpi label="Veri saklama" tone={st.data.retention_months > 24 ? "danger" : undefined} icon={<Archive aria-hidden="true" />} value={`${st.data.retention_months} ay`} small note="sonra kayıt anonimleşir" />
        </div>
      ) : !gates.isError && <div className="grid grid--kpi">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton skel__kpi" />)}</div>}
      {editing && <GateForm g={editing === "new" ? null : editing} blocks={blocks.data?.items ?? []} onDone={() => setEditing(null)} />}
      <div className="card">
        <div className="card__head"><span className="card__icon card__icon--accent"><DoorOpen aria-hidden="true" /></span><span className="card__title">Kapılar</span>{gates.data && <span className="card__meta ml-auto">{g.length} kapı</span>}</div>
        <div className="card__body card__body--flush">
          {gates.isPending ? <Loading /> : gates.isError ? <div className="card__body"><ErrorState error={gates.error} /></div> : gates.data.length === 0 ? <Empty title="Kapı tanımlı değil">Tek girişli sitede de bir kapı tanımlamak, kayıtların hangi kapıdan yapıldığını gösterir.</Empty> : (
            <div className="table-wrap"><table className="data">
              <caption className="visually-hidden">Kapılar</caption>
              <thead><tr><th scope="col">Kapı</th><th scope="col">Tip</th><th scope="col">Bloklar</th><th scope="col">Durum</th><th scope="col"><span className="visually-hidden">İşlem</span></th></tr></thead>
              <tbody>{gates.data.map((g) => (
                <tr key={g.id}>
                  <td className="cell-main">{g.name}{g.always_open && <div className="cell-sub">7/24</div>}</td>
                  <td className="small">{gateKind(g.kind)}</td>
                  <td className="small">{g.block_ids.length ? g.block_ids.map((id) => blocks.data?.items.find((b) => b.id === id)?.name ?? "?").join(", ") : "Tümü"}</td>
                  <td>{g.is_active ? <Badge tone="ok">Etkin</Badge> : <Badge>Kapalı</Badge>}</td>
                  <td className="right"><button className="btn btn--ghost btn--sm btn--icon" type="button" aria-label={`${g.name} düzenle`} onClick={() => setEditing(g)}><Pencil aria-hidden="true" /></button></td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </div>
      </div>
      <SettingsForm gates={gates.data ?? []} />
    </div>
  );
}

function GateForm({ g, blocks, onDone }: { g: Gate | null; blocks: Schemas["BlockOut"][]; onDone: () => void }) {
  const [f, setF] = useState({ name: g?.name ?? "", kind: g?.kind ?? "vehicle", block_ids: g?.block_ids ?? [], always_open: g?.always_open ?? true, is_active: g?.is_active ?? true });
  const m = useSiteMutation<Record<string, unknown>, Gate>(g ? "PATCH" : "POST", g ? `/gates/${g.id}` : "/gates", { onSuccess: onDone });
  return (
    <form className="card" noValidate onSubmit={(e) => { e.preventDefault(); m.mutate(f); }}>
      <div className="card__head"><span className="card__icon card__icon--accent"><DoorOpen aria-hidden="true" /></span><span className="card__title">{g ? `${g.name} — düzenle` : "Kapı ekle"}</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        <div className="grid grid--kpi">
          <Field label="Ad" required error={fieldError(m.error, "name")}>{(p) => <input {...p} className="field__input" maxLength={40} placeholder="ör. Ana kapı" value={f.name} onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))} />}</Field>
          <Field label="Tip" required error={fieldError(m.error, "kind")}>{(p) => <select {...p} className="field__input" value={f.kind} onChange={(e) => setF((x) => ({ ...x, kind: e.target.value as Gate["kind"] }))}>{["vehicle", "pedestrian", "service"].map((k) => <option key={k} value={k}>{gateKind(k)}</option>)}</select>}</Field>
        </div>
        {blocks.length > 0 && <fieldset style={{ border: 0, padding: 0, margin: 0 }}><legend className="field__label">Bağlı bloklar (boş: tümü)</legend><div className="row" style={{ gap: "var(--s-2) var(--s-4)" }}>{blocks.map((b) => <label key={b.id} className="check"><input type="checkbox" checked={f.block_ids.includes(b.id)} onChange={(e) => setF((x) => ({ ...x, block_ids: e.target.checked ? [...x.block_ids, b.id] : x.block_ids.filter((i) => i !== b.id) }))} /><span>{b.name}</span></label>)}</div></fieldset>}
        <div className="row" style={{ gap: "var(--s-2) var(--s-4)" }}>
          <label className="check"><input type="checkbox" checked={f.always_open} onChange={(e) => setF((x) => ({ ...x, always_open: e.target.checked }))} /><span>7/24 açık</span></label>
          {g && <label className="check"><input type="checkbox" checked={f.is_active} onChange={(e) => setF((x) => ({ ...x, is_active: e.target.checked }))} /><span>Etkin</span></label>}
        </div>
      </div>
      <div className="card__foot row" style={{ gap: "var(--s-2)" }}><SubmitButton busy={m.isPending} disabled={!f.name.trim()}>{g ? "Kaydet" : "Ekle"}</SubmitButton><button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button></div>
    </form>
  );
}

function SettingsForm({ gates }: { gates: Gate[] }) {
  const q = useSiteGet<Settings>("/settings/security");
  const m = useSiteMutation<Settings, Settings>("PUT", "/settings/security");
  const [s, setS] = useState<Settings | null>(null);
  useEffect(() => { if (q.data) setS(q.data); }, [q.data]);
  if (!s) return <Loading />;
  const num = (k: keyof Settings) => (e: { target: { value: string } }) => setS((x) => (x ? { ...x, [k]: Number(e.target.value.replace(/\D/g, "").slice(0, 3)) } : x));
  function submit(e: FormEvent) { e.preventDefault(); if (s) m.mutate(s); }
  const dirty = JSON.stringify(s) !== JSON.stringify(q.data);
  return (
    <form className="stack" noValidate onSubmit={submit}>
      <FormError error={m.error} />
      <div className="card">
        <div className="card__head"><span className="card__icon card__icon--info"><UserRoundPlus aria-hidden="true" /></span><span className="card__title">Habersiz ziyaretçi</span></div>
        <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
          <label className="check check--rich"><input type="radio" name="um" checked={s.unannounced_method === "info"} onChange={() => setS({ ...s, unannounced_method: "info" })} /><span><span className="strong">{unannouncedMethod("info")}</span><br /><span className="small muted">Görevli kaydeder, ziyaretçi girer; sakine bilgi gider.</span></span></label>
          <label className="check check--rich"><input type="radio" name="um" checked={s.unannounced_method === "approval"} onChange={() => setS({ ...s, unannounced_method: "approval" })} /><span><span className="strong">{unannouncedMethod("approval")}</span><br /><span className="small muted">Sakine onay/ret isteği gider; süre dolarsa görevli diafon/telefonla ulaşır ve gerekçeli karar verir.</span></span></label>
          {s.unannounced_method === "approval" && <Field label="Onay bekleme süresi (sn)" hint="30–600" error={fieldError(m.error, "approval_timeout_seconds")}>{(p) => <input {...p} className="field__input" inputMode="numeric" style={{ maxWidth: "8rem" }} value={s.approval_timeout_seconds} onChange={num("approval_timeout_seconds")} />}</Field>}
          {gates.length > 0 && (
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="field__label">Kapı istisnası</legend>
              <div className="grid grid--kpi">{gates.map((g) => <div key={g.id} className="field"><label className="field__label" htmlFor={`gm-${g.id}`}>{g.name}</label><select id={`gm-${g.id}`} className="field__input" value={s.gate_methods[g.id] ?? ""} onChange={(e) => { const gm = { ...s.gate_methods }; if (e.target.value) gm[g.id] = e.target.value as "info"; else delete gm[g.id]; setS({ ...s, gate_methods: gm }); }}><option value="">Site ayarı</option><option value="info">{unannouncedMethod("info")}</option><option value="approval">{unannouncedMethod("approval")}</option></select></div>)}</div>
            </fieldset>
          )}
        </div>
      </div>
      <div className="card">
        <div className="card__head"><span className="card__icon card__icon--warn"><Package aria-hidden="true" /></span><span className="card__title">Kargo ve ziyaretçi verisi</span></div>
        <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
          <div className="grid grid--kpi">
            <Field label="Kargo teslim doğrulaması">{(p) => <select {...p} className="field__input" value={s.parcel_method} onChange={(e) => setS({ ...s, parcel_method: e.target.value as Settings["parcel_method"] })}>{["both", "code", "qr"].map((k) => <option key={k} value={k}>{parcelMethod(k)}</option>)}</select>}</Field>
            <Field label="Uzun bekleyen kargo (gün)" hint="Sakine hatırlatma, yönetime rapor" error={fieldError(m.error, "parcel_long_wait_days")}>{(p) => <input {...p} className="field__input" inputMode="numeric" value={s.parcel_long_wait_days} onChange={num("parcel_long_wait_days")} />}</Field>
            <Field label="Ziyaretçi verisi saklama (ay)" hint="En fazla 24 ay; süre dolunca kayıt anonimleşir" error={fieldError(m.error, "retention_months")}>{(p) => <input {...p} className="field__input" inputMode="numeric" value={s.retention_months} onChange={num("retention_months")} />}</Field>
            <Field label="Misafir parkı kapasitesi" hint="Plakalı ön davetlerde uygulanır" error={fieldError(m.error, "guest_parking_capacity")}>{(p) => <input {...p} className="field__input" inputMode="numeric" value={s.guest_parking_capacity} onChange={num("guest_parking_capacity")} />}</Field>
          </div>
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="field__label">Ziyaretçiden alınacak alanlar (ad soyad ve bölüm her zaman)</legend>
            <div className="row" style={{ gap: "var(--s-2) var(--s-4)" }}>
              {([["plate", "Plaka"], ["phone", "Telefon"], ["id_seen", "\"Kimlik görüldü\" işareti"]] as const).map(([k, l]) => <label key={k} className="check"><input type="checkbox" checked={s.visitor_fields[k]} onChange={(e) => setS({ ...s, visitor_fields: { ...s.visitor_fields, [k]: e.target.checked } })} /><span>{l}</span></label>)}
            </div>
            <span className="field__hint">Tam T.C. kimlik no hiçbir seçenekte tutulmaz; kapalı alan kaydedilmez.</span>
          </fieldset>
          <label className="check check--rich"><input type="checkbox" checked={s.auto_anonymize} onChange={(e) => setS({ ...s, auto_anonymize: e.target.checked })} /><span><span className="strong">Süresi dolan kayıtları gece anonimleştir</span><br /><span className="small muted">Ziyaretçi adı, plaka ve notlar saklama süresi dolunca silinir. Saklama süreleri hukuk onayı bekliyor (K8); onay gelene kadar kapalı tutun.</span></span></label>
          {s.version > 0 && <p className="xs muted mb-0">Sürüm {s.version}{s.updated_by && ` · ${s.updated_by}`}</p>}
        </div>
      </div>
      {s.retention_months > 24 && <Alert tone="danger">Saklama süresi en fazla 24 ay olabilir.</Alert>}
      <div className="row"><SubmitButton busy={m.isPending} disabled={!dirty}>Ayarları kaydet</SubmitButton></div>
    </form>
  );
}
