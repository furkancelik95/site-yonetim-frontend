import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, AlertTriangle, CheckCircle2, Download, History, Rows3, Undo2, Wallet } from "lucide-react";
import { api } from "../../api/client";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { Schemas, Written } from "../../api/types";
import { ExcelButton } from "../../components/ExcelButton";
import { useToast } from "../../components/toast";
import { Alert, Badge, ConfirmButton, Empty, Field, FormError, Kpi, Loading, PageHead, SubmitButton, fieldError } from "../../components/ui";
import { formatDate, formatDateTime, formatDecimal, formatMoney, parseMoneyInput } from "../../lib/format";
import { downloadCsv } from "../../lib/csv";
import { useUrlState } from "../../lib/hooks";
import { importStatus, importType, unitUsage } from "../../lib/labels";
import { useSite } from "../../site/SiteContext";

type Preview = Schemas["ImportPreviewOut"];
type Result = Schemas["ImportResultOut"];
/** Servis isteği 25'teki şekiller. */
interface CsvIssue { row_number: number; column: string | null; message: string; severity: "error" | "warning" }
interface CsvPreview { import_id: string; type: "vehicles" | "opening_balances"; rows: Record<string, unknown>[]; issues: CsvIssue[]; total_rows: number; importable_count: number; total_amount: string | null; expires_at: string }
interface CsvResult { created: number; skipped: string[]; total_amount: string | null }
interface ImportBatch { id: string; type: "units" | "vehicles" | "opening_balances"; file_name: string; status: "previewed" | "imported" | "rolled_back"; row_count: number; created_count: number; created_by: string; created_at: string; rollback_until: string | null; rollback_blocked_by: string | null; total_amount: string | null; can_rollback: boolean }

const MAX_BYTES = 5 * 1024 * 1024; // backend: en fazla 5 MB
const TABS = [["daireler", "Bölümler ve kişiler"], ["araclar", "Araçlar"], ["acilis", "Açılış bakiyeleri"]] as const;
const CSV = {
  vehicles: { file: "arac-aktarim-sablonu.csv", header: ["Bölüm", "Plaka", "Marka", "Renk"], sample: ["A-4", "34ABC123", "Renault Clio", "Beyaz"], hint: "Sütunlar: Bölüm (kod, ör. A-4), Plaka, Marka, Renk. Plaka başka bölümde kayıtlıysa yine de eklenir; önizlemede görürsünüz." },
  "opening-balances": { file: "acilis-bakiyesi-sablonu.csv", header: ["Referans", "Tutar", "Tarih"], sample: ["REFERANS-KODU", "1250,00", "2026-10-01"], hint: "Sütunlar: Referans (cari hesabın referans kodu), Tutar (borç artı, alacak eksi), Tarih. Toplam, eski sistemdeki toplamla tutmadan aktarılamaz." },
} as const;


/** İçeri aktarım (YAP-06): bölümler (gerçek uç), araçlar ve açılış bakiyeleri (istek 25); geçmiş ve geri alma. */
export function ImportPage() {
  const [s, set] = useUrlState({ tip: "daireler" });
  return (
    <div className="stack">
      <PageHead title="İçeri aktarım" subtitle="Eski sistemden veri taşıma. Şablonu indirin, doldurun, yükleyin; önce önizleme gösterilir, onaylamadan hiçbir şey kaydedilmez." />
      <ImportKpis />
      <div className="tabs" role="tablist" aria-label="Aktarım türü">
        {TABS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={s.tip === k} onClick={() => set({ tip: k })}>{l}</button>)}
      </div>
      {s.tip === "araclar" ? <CsvImport key="v" type="vehicles" /> : s.tip === "acilis" ? <CsvImport key="o" type="opening-balances" /> : <UnitsImport />}
      <ImportHistory />
    </div>
  );
}

/** Bandın altındaki göstergeler: aktarım geçmişinden (/imports) okunur. */
function ImportKpis() {
  const q = useSiteGet<ImportBatch[]>("/imports");
  if (q.isError) return null;
  if (!q.data) return <div className="grid grid--kpi">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton skel__kpi" />)}</div>;
  const done = q.data.filter((b) => b.status === "imported");
  const lastB = [...q.data].sort((a, b) => a.created_at.localeCompare(b.created_at)).at(-1);
  const last = lastB?.created_at;
  return (
    <div className="grid grid--kpi rise">
      <Kpi label="Tamamlanan aktarım" tone="ok" icon={<CheckCircle2 aria-hidden="true" />} value={done.length} note={`${q.data.length} dosya yüklendi`} />
      <Kpi label="Oluşturulan kayıt" icon={<Rows3 aria-hidden="true" />} value={done.reduce((t, b) => t + b.created_count, 0)} note="bölüm, araç, bakiye" />
      <Kpi label="Geri alınabilir" tone={q.data.some((b) => b.can_rollback) ? "accent" : undefined} icon={<Undo2 aria-hidden="true" />} value={q.data.filter((b) => b.can_rollback).length} note="7 gün içinde" />
      <Kpi label="Son aktarım" icon={<History aria-hidden="true" />} value={last ? formatDate(last) : "—"} small note={lastB ? `${importType(lastB.type)} · ${lastB.created_by}` : "henüz yok"} />
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
            <Kpi label="Satır" icon={<Rows3 aria-hidden="true" />} value={preview.total_rows} note="dosyada" />
            <Kpi label="Aktarılacak" icon={<CheckCircle2 aria-hidden="true" />} tone="ok" value={preview.importable_count} note={`${preview.new_count} yeni · ${preview.existing_count} zaten var`} />
            <Kpi label="Hata" icon={<AlertTriangle aria-hidden="true" />} tone={preview.error_count > 0 ? "danger" : undefined} value={preview.error_count} note="aktarılmaz" />
            <Kpi label="Uyarı" icon={<AlertCircle aria-hidden="true" />} tone={preview.warning_count > 0 ? "warn" : undefined} value={preview.warning_count} note="aktarılır, kontrol edin" />
          </div>
          <Issues issues={preview.issues} />
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
    mutationFn: (f: File) => { const fd = new FormData(); fd.set("file", f); return api<CsvPreview>("POST", `/sites/${site.slug}/imports/${type}`, { form: fd }); },
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
    if (!/\.csv$/i.test(file.name)) return setFileErr("Yalnız .csv dosyası yüklenebilir (Excel'de Farklı Kaydet › CSV UTF-8).");
    if (file.size > MAX_BYTES) return setFileErr("Dosya en fazla 5 MB olabilir.");
    setFileErr(undefined);
    upload.mutate(file);
  }
  return (
    <>
      <div className="row row--between" style={{ gap: "var(--s-2)" }}>
        <p className="small muted mb-0">{tpl.hint}</p>
        <button className="btn" type="button" onClick={() => downloadCsv(tpl.file, [tpl.header, tpl.sample])}><Download aria-hidden="true" /> Şablonu indir</button>
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
            <label className="field__label" htmlFor={`imp-${type}`}>CSV dosyası</label>
            <input id={`imp-${type}`} className="field__input" type="file" accept=".csv,text/csv" aria-invalid={fileErr ? true : undefined} aria-describedby={`imp-${type}-hint`} onChange={(e) => { setFile(e.target.files?.[0] ?? null); upload.reset(); }} />
            <span className="field__hint" id={`imp-${type}-hint`}>.csv (noktalı virgül ya da virgül), en fazla 5 MB.</span>
            {fileErr && <span className="field__error" role="alert">{fileErr}</span>}
          </div>
        </div>
        <div className="card__foot"><SubmitButton busy={upload.isPending} className="btn" disabled={!file}>Önizle</SubmitButton></div>
      </form>
      {p && (
        <>
          <div className="grid grid--kpi">
            <Kpi label="Satır" icon={<Rows3 aria-hidden="true" />} value={p.total_rows} note="dosyada" />
            <Kpi label="Aktarılacak" icon={<CheckCircle2 aria-hidden="true" />} tone="ok" value={p.importable_count} />
            <Kpi label="Hata" icon={<AlertTriangle aria-hidden="true" />} tone={errors > 0 ? "danger" : undefined} value={errors} note="aktarılmaz" />
            {opening && <Kpi label="Yüklenen toplam" icon={<Wallet aria-hidden="true" />} value={formatMoney(p.total_amount)} small />}
          </div>
          <Issues issues={p.issues} />
          <div className="card">
            <div className="card__head"><span className="card__title">Önizleme</span></div>
            <div className="card__body card__body--flush"><div className="table-wrap"><table className="data">
              <caption className="visually-hidden">Aktarılacak satırlar</caption>
              {opening ? (
                <>
                  <thead><tr><th scope="col">Satır</th><th scope="col">Hesap</th><th scope="col" className="right">Tutar</th><th scope="col">Yön</th><th scope="col">Tarih</th><th scope="col" /></tr></thead>
                  <tbody>{p.rows.map((r) => (
                    <tr key={String(r.row_number)}>
                      <td className="num">{String(r.row_number)}</td>
                      <td><div className="cell-main mono">{String(r.reference_code ?? "")}</div><div className="cell-sub">{[r.unit_name, r.person_name].filter(Boolean).join(" · ")}</div></td>
                      <td className="right num">{r.amount != null ? formatMoney(String(r.amount)) : "—"}</td>
                      <td className="small">{r.direction === "credit" ? "Alacak" : "Borç"}</td>
                      <td className="small nowrap">{String(r.date ?? "")}</td>
                      <td>{r.ok ? <Badge tone="ok">Hazır</Badge> : <Badge tone="danger">Hatalı</Badge>}</td>
                    </tr>
                  ))}</tbody>
                </>
              ) : (
                <>
                  <thead><tr><th scope="col">Satır</th><th scope="col">Bölüm</th><th scope="col">Plaka</th><th scope="col">Marka / renk</th><th scope="col" /></tr></thead>
                  <tbody>{p.rows.map((r) => (
                    <tr key={String(r.row_number)}>
                      <td className="num">{String(r.row_number)}</td>
                      <td className="small">{String(r.unit_name ?? "")}</td>
                      <td className="mono">{String(r.plate_display ?? "")}</td>
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
  const q = useSiteGet<ImportBatch[]>("/imports");
  return (
    <div className="card">
      <div className="card__head"><span className="card__icon"><History aria-hidden="true" /></span><span className="card__title">Aktarım geçmişi</span><span className="card__meta ml-auto">7 gün içinde geri alınabilir</span></div>
      <div className="card__body card__body--flush">
        {q.isPending ? <Loading /> : !q.data || q.data.length === 0 ? <Empty title="Henüz aktarım yok" /> : (
          <div className="table-wrap"><table className="data">
            <caption className="visually-hidden">Aktarım geçmişi</caption>
            <thead><tr><th scope="col">Tarih</th><th scope="col">Tür</th><th scope="col">Dosya</th><th scope="col" className="right">Satır → kayıt</th><th scope="col">Yapan</th><th scope="col">Durum</th><th scope="col"><span className="visually-hidden">İşlem</span></th></tr></thead>
            <tbody>{q.data.map((b) => (
              <tr key={b.id} style={b.status === "rolled_back" ? { opacity: 0.6 } : undefined}>
                <td className="small nowrap">{formatDateTime(b.created_at)}</td>
                <td className="small">{importType(b.type)}</td>
                <td className="small">{b.file_name}{b.total_amount && <div className="cell-sub">{formatMoney(b.total_amount)}</div>}</td>
                <td className="right num">{b.row_count} → {b.created_count}</td>
                <td className="small">{b.created_by}</td>
                <td><Badge tone={b.status === "imported" ? "ok" : b.status === "rolled_back" ? "muted" : "info"}>{importStatus(b.status)}</Badge></td>
                <td className="right">{b.can_rollback ? <RollbackButton b={b} /> : b.status === "imported" ? <span className="small muted" title={b.rollback_blocked_by ?? undefined}>{b.rollback_blocked_by ? "Geri alma backend'de" : "Süre doldu"}</span> : null}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}

function RollbackButton({ b }: { b: ImportBatch }) {
  const m = useSiteMutation<Record<string, never>, ImportBatch>("POST", `/imports/${b.id}/rollback`);
  return <ConfirmButton className="btn btn--ghost btn--sm" danger title="Aktarımı geri al" confirmLabel="Geri al" body={`${b.file_name} dosyasıyla oluşturulan ${b.created_count} kayıt kaldırılır. Geri alma ${b.rollback_until ? formatDateTime(b.rollback_until) : ""} tarihine kadar mümkündür.`} onConfirm={() => m.mutateAsync({})}><Undo2 aria-hidden="true" /> Geri al</ConfirmButton>;
}
