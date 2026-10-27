import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { History, Undo2 } from "lucide-react";
import { api } from "../../api/client";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { Page, Schemas, Written } from "../../api/types";
import { ExcelButton } from "../../components/ExcelButton";
import { useToast } from "../../components/toast";
import { Alert, Badge, ConfirmButton, Empty, Field, FormError, Kpi, Loading, PageHead, Pager, SubmitButton, fieldError } from "../../components/ui";
import { formatDateTime, formatDecimal, formatMoney, parseMoneyInput } from "../../lib/format";
import { useUrlState } from "../../lib/hooks";
import { importStatus, importType, unitUsage } from "../../lib/labels";
import { useSite } from "../../site/SiteContext";

type Preview = Schemas["ImportPreviewOut"];
type Result = Schemas["ImportResultOut"];
type VehiclePreview = Schemas["VehicleImportPreviewOut"];
type OpeningPreview = Schemas["OpeningImportPreviewOut"];
type CsvResult = Schemas["ImportConfirmOut"];
type ImportBatch = Schemas["ImportBatchOut"];

const MAX_BYTES = 5 * 1024 * 1024; // backend: en fazla 5 MB
const TABS = [["daireler", "Bölümler ve kişiler"], ["araclar", "Araçlar"], ["acilis", "Açılış bakiyeleri"]] as const;
const CSV = {
  vehicles: { file: "arac-aktarim-sablonu.xlsx", hint: "Sütunlar: Bölüm (kod, ör. A-4), Plaka, Marka, Renk. Plaka başka bölümde kayıtlıysa yine de eklenir; önizlemede görürsünüz." },
  "opening-balances": { file: "acilis-bakiyesi-sablonu.xlsx", hint: "Sütunlar: Referans (cari hesabın referans kodu), Tutar (borç artı, alacak eksi; 1.250,00 olur), Tarih. Toplam, eski sistemdeki toplamla tutmadan aktarılamaz." },
} as const;


/** İçeri aktarım (YAP-06): bölümler ve kişiler (aynı ad + telefon tek kişi, K16), araçlar ve açılış bakiyeleri; geçmiş ve 7 gün içinde geri alma. */
export function ImportPage() {
  const [s, set] = useUrlState({ tip: "daireler" });
  return (
    <div className="stack">
      <PageHead title="İçeri aktarım" subtitle="Eski sistemden veri taşıma. Şablonu indirin, doldurun, yükleyin; önce önizleme gösterilir, onaylamadan hiçbir şey kaydedilmez." />
      <div className="row" role="tablist" aria-label="Aktarım türü" style={{ gap: "var(--s-2)" }}>
        {TABS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={s.tip === k} className={`btn btn--sm${s.tip === k ? " btn--primary" : ""}`} onClick={() => set({ tip: k })}>{l}</button>)}
      </div>
      {s.tip === "araclar" ? <CsvImport key="v" type="vehicles" /> : s.tip === "acilis" ? <CsvImport key="o" type="opening-balances" /> : <UnitsImport />}
      <ImportHistory />
    </div>
  );
}

function UnitsImport() {
  const { site } = useSite();
  const qc = useQueryClient();
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [fileErr, setFileErr] = useState<string>();
  const [result, setResult] = useState<Result | null>(null);
  const upload = useMutation({
    mutationFn: (f: File) => { const fd = new FormData(); fd.set("file", f); return api<Preview>("POST", `/sites/${site.slug}/imports/units`, { form: fd }); },
    onSuccess: () => setResult(null),
  });
  const preview = upload.data;
  const confirm = useMutation({
    mutationFn: (id: string) => api<Written<Result>>("POST", `/sites/${site.slug}/imports/units/${id}/confirm`),
    onSuccess: (res) => { toast(res.message); setResult(res.data); upload.reset(); setFile(null); qc.invalidateQueries({ queryKey: ["site", site.slug] }); },
  });
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!file) return setFileErr("Bir Excel dosyası seçin.");
    if (!file.name.toLocaleLowerCase("tr-TR").endsWith(".xlsx")) return setFileErr("Yalnız .xlsx dosyası yüklenebilir.");
    if (file.size > MAX_BYTES) return setFileErr("Dosya en fazla 5 MB olabilir.");
    setFileErr(undefined);
    upload.mutate(file);
  }
  return (
    <>
      <div className="row row--between" style={{ gap: "var(--s-2)" }}>
        <p className="small muted mb-0">Blok, bölüm, malik ve kiracı tek dosyada. Var olan bölümler değiştirilmez, atlanır.</p>
        <ExcelButton path={`/sites/${site.slug}/imports/units/template.xlsx`} fileName="daire-aktarim-sablonu.xlsx" label="Şablonu indir" />
      </div>
      {result && (
        <Alert tone="ok" title="Aktarım tamamlandı">
          {result.created_units} bölüm, {result.created_people} kişi, {result.created_accounts} cari hesap oluşturuldu
          {result.created_blocks > 0 && `, ${result.created_blocks} blok`}{result.created_unit_types > 0 && `, ${result.created_unit_types} daire tipi`}.
          {result.skipped.length > 0 && <> Atlanan: {result.skipped.join(", ")}.</>} <Link to={`/s/${site.slug}/daireler`}>Dairelere git</Link>
        </Alert>
      )}
      <form className="card" onSubmit={submit} noValidate>
        <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
          <FormError error={upload.error} />
          <div className="field">
            <label className="field__label" htmlFor="imp-file">Excel dosyası</label>
            <input id="imp-file" className="field__input" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" aria-invalid={fileErr ? true : undefined} aria-describedby="imp-hint" onChange={(e) => { setFile(e.target.files?.[0] ?? null); upload.reset(); }} />
            <span className="field__hint" id="imp-hint">.xlsx, en fazla 5 MB.</span>
            {fileErr && <span className="field__error" role="alert">{fileErr}</span>}
          </div>
        </div>
        <div className="card__foot"><SubmitButton busy={upload.isPending} className="btn" disabled={!file}>Önizle</SubmitButton></div>
      </form>
      {preview && (
        <>
          <div className="grid grid--kpi">
            <Kpi label="Satır" value={preview.total_rows} />
            <Kpi label="Aktarılacak" tone="ok" value={preview.importable_count} note={`${preview.new_count} yeni · ${preview.existing_count} zaten var`} />
            <Kpi label="Hata" tone={preview.error_count > 0 ? "danger" : undefined} value={preview.error_count} />
            <Kpi label="Uyarı" tone={preview.warning_count > 0 ? "warn" : undefined} value={preview.warning_count} />
          </div>
          <Issues issues={preview.issues} />
          {preview.person_merges.length > 0 && (
            <div className="card">
              <div className="card__head"><span className="card__title">Tek kişide birleşecek kayıtlar</span><span className="card__meta ml-auto">ad + telefon aynı (K16)</span></div>
              <div className="card__body card__body--flush"><div className="table-wrap"><table className="data">
                <caption className="visually-hidden">Birleştirilecek kişiler</caption>
                <thead><tr><th scope="col">Kişi</th><th scope="col">Telefon</th><th scope="col">Satırlar</th><th scope="col" /></tr></thead>
                <tbody>{preview.person_merges.map((m) => (
                  <tr key={`${m.full_name}-${m.row_numbers.join(",")}`}>
                    <td className="cell-main">{m.full_name}</td><td className="small mono">{m.phone ?? "—"}</td><td className="small num">{m.row_numbers.join(", ")}</td>
                    <td>{m.existing ? <Badge tone="info">Sitede kayıtlı kişi</Badge> : <Badge>Dosyada tekrar</Badge>}</td>
                  </tr>
                ))}</tbody>
              </table></div></div>
              <div className="card__foot small muted">Kişi tek kayıt olur, birden çok bölüme bağlanır. Farklı kişilerse telefonu düzeltip yeniden yükleyin.</div>
            </div>
          )}
          <div className="card">
            <div className="card__head"><span className="card__title">Önizleme</span></div>
            <div className="card__body card__body--flush"><div className="table-wrap"><table className="data">
              <caption className="visually-hidden">Aktarılacak bölümler</caption>
              <thead><tr><th scope="col">Satır</th><th scope="col">Bölüm</th><th scope="col">Tip</th><th scope="col" className="right">Brüt m²</th><th scope="col">Malik</th><th scope="col">Kiracı</th><th scope="col" /></tr></thead>
              <tbody>{preview.rows.map((r) => (
                <tr key={r.row_number}>
                  <td className="num">{r.row_number}</td>
                  <td><div className="cell-main">{r.display_name}</div><div className="cell-sub">{unitUsage(r.usage)}{r.floor !== null && r.floor !== undefined ? ` · ${r.floor}. kat` : ""}</div></td>
                  <td className="small">{r.unit_type ?? "—"}</td>
                  <td className="right num">{formatDecimal(r.gross_area)}</td>
                  <td className="small">{r.owner.first_name} {r.owner.last_name}</td>
                  <td className="small">{r.tenant ? `${r.tenant.first_name} ${r.tenant.last_name}` : "—"}</td>
                  <td>{r.already_exists ? <Badge>Zaten var</Badge> : <Badge tone="ok">Yeni</Badge>}</td>
                </tr>
              ))}</tbody>
            </table></div></div>
            <div className="card__foot row row--between">
              <span className="small muted">{preview.expires_at ? `Önizleme ${formatDateTime(preview.expires_at)} tarihine kadar geçerli.` : ""}</span>
              {preview.import_id && preview.new_count > 0 ? (
                <ConfirmButton className="btn btn--primary" title="Aktarımı onayla" confirmLabel="Aktar" body={`${preview.new_count} yeni bölüm ve kişileri kaydedilecek. Hatalı satırlar atlanır.`} onConfirm={() => confirm.mutateAsync(preview.import_id!)}>{preview.new_count} bölümü aktar</ConfirmButton>
              ) : <span className="small">Aktarılacak yeni bölüm yok.</span>}
            </div>
          </div>
        </>
      )}
    </>
  );
}

function Issues({ issues }: { issues: { row_number?: number | null; column?: string | null; message: string; severity: string }[] }) {
  if (issues.length === 0) return null;
  return (
    <div className="card">
      <div className="card__head"><span className="card__title">Sorunlar</span><span className="card__meta ml-auto">hatalı satırlar aktarılmaz</span></div>
      <div className="card__body card__body--flush"><div className="table-wrap"><table className="data">
        <caption className="visually-hidden">Satır satır hata ve uyarılar</caption>
        <thead><tr><th scope="col">Satır</th><th scope="col">Sütun</th><th scope="col">Açıklama</th><th scope="col">Tür</th></tr></thead>
        <tbody>{issues.map((i, n) => (
          <tr key={n} className={i.severity === "error" ? "is-overdue" : undefined}>
            <td className="num">{i.row_number ?? "—"}</td><td className="small">{i.column ?? "—"}</td><td>{i.message}</td>
            <td><Badge tone={i.severity === "error" ? "danger" : "warn"}>{i.severity === "error" ? "Hata" : "Uyarı"}</Badge></td>
          </tr>
        ))}</tbody>
      </table></div></div>
    </div>
  );
}

/** Araç ve açılış bakiyesi aktarımı (istek 25). Açılış bakiyesinde eski sistem toplamı girilir; tutmazsa aktarım olmaz. */
function CsvImport({ type }: { type: "vehicles" | "opening-balances" }) {
  const { site } = useSite();
  const qc = useQueryClient();
  const toast = useToast();
  const tpl = CSV[type];
  const opening = type === "opening-balances";
  const [file, setFile] = useState<File | null>(null);
  const [fileErr, setFileErr] = useState<string>();
  const [recon, setRecon] = useState("");
  const [result, setResult] = useState<CsvResult | null>(null);
  const upload = useMutation({
    mutationFn: (f: File) => { const fd = new FormData(); fd.set("file", f); return api<VehiclePreview | OpeningPreview>("POST", `/sites/${site.slug}/imports/${type}`, { form: fd }); },
    onSuccess: () => setResult(null),
  });
  const p = upload.data;
  const confirm = useMutation({
    mutationFn: (id: string) => api<Written<CsvResult>>("POST", `/sites/${site.slug}/imports/${id}/confirm`, { body: opening ? { reconciliation_total: parseMoneyInput(recon) } : {} }),
    onSuccess: (res) => { toast(res.message); setResult(res.data); upload.reset(); setFile(null); setRecon(""); qc.invalidateQueries({ queryKey: ["site", site.slug] }); },
  });
  const errors = p?.issues.filter((i) => i.severity === "error").length ?? 0;
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!file) return setFileErr("Bir dosya seçin.");
    if (!/\.(csv|xlsx)$/i.test(file.name)) return setFileErr("Yalnız .xlsx ya da .csv yüklenebilir.");
    if (file.size > MAX_BYTES) return setFileErr("Dosya en fazla 5 MB olabilir.");
    setFileErr(undefined);
    upload.mutate(file);
  }
  return (
    <>
      <div className="row row--between" style={{ gap: "var(--s-2)" }}>
        <p className="small muted mb-0">{tpl.hint}</p>
        <ExcelButton path={`/sites/${site.slug}/imports/${type}/template.xlsx`} fileName={tpl.file} label="Şablonu indir" />
      </div>
      {result && (
        <Alert tone="ok" title="Aktarım tamamlandı">
          {result.created} kayıt{opening && result.total_amount ? `, toplam ${formatMoney(result.total_amount)}` : ""}.{result.skipped.length > 0 && <> Atlanan: {result.skipped.join(", ")}.</>}{" "}
          <Link to={`/s/${site.slug}/${opening ? "borclular" : "araclar"}`}>{opening ? "Borçlulara git" : "Araçlara git"}</Link>
        </Alert>
      )}
      <form className="card" onSubmit={submit} noValidate>
        <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
          <FormError error={upload.error} />
          <div className="field">
            <label className="field__label" htmlFor={`imp-${type}`}>Excel ya da CSV dosyası</label>
            <input id={`imp-${type}`} className="field__input" type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" aria-invalid={fileErr ? true : undefined} aria-describedby={`imp-${type}-hint`} onChange={(e) => { setFile(e.target.files?.[0] ?? null); upload.reset(); }} />
            <span className="field__hint" id={`imp-${type}-hint`}>.xlsx ya da .csv (noktalı virgül ya da virgül), en fazla 5 MB.</span>
            {fileErr && <span className="field__error" role="alert">{fileErr}</span>}
          </div>
        </div>
        <div className="card__foot"><SubmitButton busy={upload.isPending} className="btn" disabled={!file}>Önizle</SubmitButton></div>
      </form>
      {p && (
        <>
          <div className="grid grid--kpi">
            <Kpi label="Satır" value={p.total_rows} />
            <Kpi label="Aktarılacak" tone="ok" value={p.importable_count} />
            <Kpi label="Hata" tone={errors > 0 ? "danger" : undefined} value={errors} />
            {p.type === "opening_balances" && <Kpi label="Yüklenen toplam" value={formatMoney(p.total_amount)} small />}
          </div>
          <Issues issues={p.issues} />
          <div className="card">
            <div className="card__head"><span className="card__title">Önizleme</span></div>
            <div className="card__body card__body--flush"><div className="table-wrap"><table className="data">
              <caption className="visually-hidden">Aktarılacak satırlar</caption>
              {p.type === "opening_balances" ? (
                <>
                  <thead><tr><th scope="col">Satır</th><th scope="col">Hesap</th><th scope="col" className="right">Tutar</th><th scope="col">Yön</th><th scope="col">Tarih</th><th scope="col" /></tr></thead>
                  <tbody>{p.rows.map((r) => (
                    <tr key={r.row_number}>
                      <td className="num">{r.row_number}</td>
                      <td><div className="cell-main mono">{r.reference_code}</div><div className="cell-sub">{[r.unit_name, r.person_name].filter(Boolean).join(" · ")}</div></td>
                      <td className="right num">{r.amount != null ? formatMoney(r.amount) : "—"}</td>
                      <td className="small">{r.direction === "credit" ? "Alacak" : "Borç"}</td>
                      <td className="small nowrap">{r.date}</td>
                      <td>{r.ok ? <Badge tone="ok">Hazır</Badge> : <Badge tone="danger">Hatalı</Badge>}</td>
                    </tr>
                  ))}</tbody>
                </>
              ) : (
                <>
                  <thead><tr><th scope="col">Satır</th><th scope="col">Bölüm</th><th scope="col">Plaka</th><th scope="col">Marka / renk</th><th scope="col" /></tr></thead>
                  <tbody>{p.rows.map((r) => (
                    <tr key={r.row_number}>
                      <td className="num">{r.row_number}</td>
                      <td className="small">{r.unit_name ?? ""}</td>
                      <td className="mono">{r.plate_display}</td>
                      <td className="small">{[r.brand_model, r.color].filter(Boolean).join(" · ") || "—"}</td>
                      <td>{r.ok ? <Badge tone="ok">Hazır</Badge> : <Badge tone="danger">Hatalı</Badge>}</td>
                    </tr>
                  ))}</tbody>
                </>
              )}
            </table></div></div>
            <div className="card__foot stack" style={{ gap: "var(--s-3)" }}>
              <FormError error={confirm.error} />
              {opening && (
                <div className="row" style={{ gap: "var(--s-4)", alignItems: "flex-end", flexWrap: "wrap" }}>
                  <Field label="Eski sistemdeki toplam bakiye (₺)" required hint="Mutabakat: yüklenen toplamla kuruşuna kadar eşit olmalı" error={fieldError(confirm.error, "reconciliation_total")}>{(x) => <input {...x} className="field__input" inputMode="decimal" style={{ minWidth: "12rem" }} value={recon} onChange={(e) => setRecon(e.target.value)} />}</Field>
                  <div className="small muted" style={{ paddingBottom: "var(--s-3)" }}>Yüklenen toplam: <strong className="num">{formatMoney(p.total_amount)}</strong></div>
                </div>
              )}
              <div className="row row--between">
                <span className="small muted">Önizleme {formatDateTime(p.expires_at)} tarihine kadar geçerli.</span>
                {p.importable_count > 0 && (!opening || errors === 0) ? (
                  <ConfirmButton className="btn btn--primary" disabled={opening && !parseMoneyInput(recon)} title="Aktarımı onayla" confirmLabel="Aktar" body={opening ? `${p.importable_count} hesaba açılış bakiyesi yazılacak (toplam ${formatMoney(p.total_amount)}). Bu kayıtlar cari ekstrelere girer.` : `${p.importable_count} araç kaydedilecek. Hatalı satırlar atlanır.`} onConfirm={() => confirm.mutateAsync(p.import_id)}>{p.importable_count} satırı aktar</ConfirmButton>
                ) : <span className="small">{opening && errors > 0 ? "Bakiye aktarımında hatalı satır olamaz; dosyayı düzeltin." : "Aktarılacak satır yok."}</span>}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function ImportHistory() {
  const [page, setPage] = useState(1);
  const q = useSiteGet<Page<ImportBatch>>("/imports", { page, page_size: 20 });
  return (
    <div className="card">
      <div className="card__head"><span className="card__icon"><History aria-hidden="true" /></span><span className="card__title">Aktarım geçmişi</span><span className="card__meta ml-auto">7 gün içinde geri alınabilir</span></div>
      <div className="card__body card__body--flush">
        {q.isPending ? <Loading /> : !q.data || q.data.items.length === 0 ? <Empty title="Henüz aktarım yok" /> : (
          <div className="table-wrap"><table className="data">
            <caption className="visually-hidden">Aktarım geçmişi</caption>
            <thead><tr><th scope="col">Tarih</th><th scope="col">Tür</th><th scope="col">Dosya</th><th scope="col" className="right">Satır → kayıt</th><th scope="col">Yapan</th><th scope="col">Durum</th><th scope="col"><span className="visually-hidden">İşlem</span></th></tr></thead>
            <tbody>{q.data.items.map((b) => (
              <tr key={b.id} style={b.status === "rolled_back" ? { opacity: 0.6 } : undefined}>
                <td className="small nowrap">{formatDateTime(b.created_at)}</td>
                <td className="small">{importType(b.type)}</td>
                <td className="small">{b.file_name}{b.total_amount && <div className="cell-sub">{formatMoney(b.total_amount)}</div>}</td>
                <td className="right num">{b.row_count} → {b.created_count}</td>
                <td className="small">{b.created_by ?? "—"}</td>
                <td><Badge tone={b.status === "imported" ? "ok" : b.status === "rolled_back" ? "muted" : "info"}>{importStatus(b.status)}</Badge></td>
                <td className="right">{b.can_rollback ? <RollbackButton b={b} /> : b.status === "imported" ? <span className="small muted">{b.rollback_blocked_by ?? "Süre doldu"}</span> : null}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
      {q.data && q.data.total > q.data.page_size && <div className="card__foot"><Pager page={q.data.page} pageSize={q.data.page_size} total={q.data.total} onPage={setPage} /></div>}
    </div>
  );
}

function RollbackButton({ b }: { b: ImportBatch }) {
  const m = useSiteMutation<Record<string, never>, ImportBatch>("POST", `/imports/${b.id}/rollback`);
  return <ConfirmButton className="btn btn--ghost btn--sm" danger title="Aktarımı geri al" confirmLabel="Geri al" body={`${b.file_name} dosyasıyla oluşturulan ${b.created_count} kayıt kaldırılır. Geri alma ${b.rollback_until ? formatDateTime(b.rollback_until) : ""} tarihine kadar mümkündür.`} onConfirm={() => m.mutateAsync({})}><Undo2 aria-hidden="true" /> Geri al</ConfirmButton>;
}
