import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import type { Schemas, Written } from "../../api/types";
import { ExcelButton } from "../../components/ExcelButton";
import { useToast } from "../../components/toast";
import { Alert, Badge, ConfirmButton, FormError, Kpi, PageHead, SubmitButton } from "../../components/ui";
import { formatDateTime, formatDecimal } from "../../lib/format";
import { unitUsage } from "../../lib/labels";
import { useSite } from "../../site/SiteContext";

type Preview = Schemas["ImportPreviewOut"];
type Result = Schemas["ImportResultOut"];

const MAX_BYTES = 5 * 1024 * 1024; // backend: .xlsx, en fazla 5 MB

export function ImportPage() {
  const { site } = useSite();
  const qc = useQueryClient();
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [fileErr, setFileErr] = useState<string>();
  const [result, setResult] = useState<Result | null>(null);

  const upload = useMutation({
    mutationFn: (f: File) => {
      const fd = new FormData();
      fd.set("file", f);
      return api<Preview>("POST", `/sites/${site.slug}/imports/units`, { form: fd });
    },
    onSuccess: () => setResult(null),
  });
  const preview = upload.data;

  const confirm = useMutation({
    mutationFn: (id: string) => api<Written<Result>>("POST", `/sites/${site.slug}/imports/units/${id}/confirm`),
    onSuccess: (res) => {
      toast(res.message);
      setResult(res.data);
      upload.reset();
      setFile(null);
      qc.invalidateQueries({ queryKey: ["site", site.slug] });
    },
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
    <div className="stack">
      <PageHead
        title="Excel'den daire aktarımı"
        subtitle="Şablonu indirin, doldurun, yükleyin. Önce önizleme gösterilir; onaylamadan hiçbir şey kaydedilmez."
        actions={<ExcelButton path={`/sites/${site.slug}/imports/units/template.xlsx`} fileName="daire-aktarim-sablonu.xlsx" label="Şablonu indir" />}
      />

      {result && (
        <Alert tone="ok" title="Aktarım tamamlandı">
          {result.created_units} bölüm, {result.created_people} kişi, {result.created_accounts} cari hesap oluşturuldu
          {result.created_blocks > 0 && `, ${result.created_blocks} blok`}
          {result.created_unit_types > 0 && `, ${result.created_unit_types} daire tipi`}.
          {result.skipped.length > 0 && <> Atlanan: {result.skipped.join(", ")}.</>} <Link to={`/s/${site.slug}/daireler`}>Dairelere git</Link>
        </Alert>
      )}

      <form className="card" onSubmit={submit} noValidate>
        <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
          <FormError error={upload.error} />
          <div className="field">
            <label className="field__label" htmlFor="imp-file">Excel dosyası</label>
            <input
              id="imp-file"
              className="field__input"
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              aria-invalid={fileErr ? true : undefined}
              aria-describedby="imp-hint"
              onChange={(e) => { setFile(e.target.files?.[0] ?? null); upload.reset(); }}
            />
            <span className="field__hint" id="imp-hint">.xlsx, en fazla 5 MB. Var olan bölümler değiştirilmez, atlanır.</span>
            {fileErr && <span className="field__error" role="alert">{fileErr}</span>}
          </div>
        </div>
        <div className="card__foot">
          <SubmitButton busy={upload.isPending} className="btn" disabled={!file}>Önizle</SubmitButton>
        </div>
      </form>

      {preview && (
        <>
          <div className="grid grid--kpi">
            <Kpi label="Satır" value={preview.total_rows} />
            <Kpi label="Aktarılacak" tone="ok" value={preview.importable_count} note={`${preview.new_count} yeni · ${preview.existing_count} zaten var`} />
            <Kpi label="Hata" tone={preview.error_count > 0 ? "danger" : undefined} value={preview.error_count} />
            <Kpi label="Uyarı" tone={preview.warning_count > 0 ? "warn" : undefined} value={preview.warning_count} />
          </div>

          {preview.issues.length > 0 && (
            <div className="card">
              <div className="card__head"><span className="card__title">Sorunlar</span><span className="card__meta ml-auto">hatalı satırlar aktarılmaz</span></div>
              <div className="card__body card__body--flush">
                <div className="table-wrap">
                  <table className="data">
                    <caption className="visually-hidden">Satır satır hata ve uyarılar</caption>
                    <thead><tr><th scope="col">Satır</th><th scope="col">Sütun</th><th scope="col">Açıklama</th><th scope="col">Tür</th></tr></thead>
                    <tbody>
                      {preview.issues.map((i, n) => (
                        <tr key={n} className={i.severity === "error" ? "is-overdue" : undefined}>
                          <td className="num">{i.row_number ?? "—"}</td>
                          <td className="small">{i.column ?? "—"}</td>
                          <td>{i.message}</td>
                          <td><Badge tone={i.severity === "error" ? "danger" : "warn"}>{i.severity === "error" ? "Hata" : "Uyarı"}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          <div className="card">
            <div className="card__head"><span className="card__title">Önizleme</span></div>
            <div className="card__body card__body--flush">
              <div className="table-wrap">
                <table className="data">
                  <caption className="visually-hidden">Aktarılacak bölümler</caption>
                  <thead><tr><th scope="col">Satır</th><th scope="col">Bölüm</th><th scope="col">Tip</th><th scope="col" className="right">Brüt m²</th><th scope="col">Malik</th><th scope="col">Kiracı</th><th scope="col" /></tr></thead>
                  <tbody>
                    {preview.rows.map((r) => (
                      <tr key={r.row_number}>
                        <td className="num">{r.row_number}</td>
                        <td><div className="cell-main">{r.display_name}</div><div className="cell-sub">{unitUsage(r.usage)}{r.floor !== null && r.floor !== undefined ? ` · ${r.floor}. kat` : ""}</div></td>
                        <td className="small">{r.unit_type ?? "—"}</td>
                        <td className="right num">{formatDecimal(r.gross_area)}</td>
                        <td className="small">{r.owner.first_name} {r.owner.last_name}</td>
                        <td className="small">{r.tenant ? `${r.tenant.first_name} ${r.tenant.last_name}` : "—"}</td>
                        <td>{r.already_exists ? <Badge>Zaten var</Badge> : <Badge tone="ok">Yeni</Badge>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="card__foot row row--between">
              <span className="small muted">{preview.expires_at ? `Önizleme ${formatDateTime(preview.expires_at)} tarihine kadar geçerli.` : ""}</span>
              {preview.import_id && preview.new_count > 0 ? (
                <ConfirmButton
                  className="btn btn--primary"
                  title="Aktarımı onayla"
                  confirmLabel="Aktar"
                  body={`${preview.new_count} yeni bölüm ve kişileri kaydedilecek. Hatalı satırlar atlanır.`}
                  onConfirm={() => confirm.mutateAsync(preview.import_id!)}
                >
                  {preview.new_count} bölümü aktar
                </ConfirmButton>
              ) : (
                <span className="small">Aktarılacak yeni bölüm yok.</span>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
