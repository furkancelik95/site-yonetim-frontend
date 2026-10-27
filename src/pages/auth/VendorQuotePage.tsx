import { useState, type FormEvent } from "react";
import { useParams } from "react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import Decimal from "decimal.js";
import { api, get } from "../../api/client";
import type { Schemas, Written } from "../../api/types";
import { Alert, ErrorState, Field, FormError, Loading, SubmitButton, fieldError, useDocumentTitle } from "../../components/ui";
import { formatDateTime, formatMoney, parseMoneyInput, todayIso } from "../../lib/format";

/** Oturumsuz uç (backend `api/v1/purchasing.py`, servis isteği 64). */
type LinkInfo = Schemas["PublicQuoteLinkOut"];
type QuoteResult = Schemas["PublicQuoteResult"];

/**
 * Tedarikçi teklif formu (/teklif/:token, SAT-02). Tedarikçi hesap açmaz; link tek kullanımlık, süreli ve tek talebe bağlıdır.
 * Tedarikçi yalnız talep kalemlerini görür; site verisinin başka hiçbir parçasına erişemez.
 */
export function VendorQuotePage() {
  useDocumentTitle("Teklif formu");
  const { token = "" } = useParams();
  const q = useQuery({ queryKey: ["public-quote-link", token], queryFn: () => get<LinkInfo>(`/public/quote-links/${token}`), retry: false });
  const [prices, setPrices] = useState<string[]>([]);
  const [f, setF] = useState({ delivery_days: "", payment_terms: "", valid_until: "", note: "" });
  const [file, setFile] = useState<File | null>(null);
  const [fileNote, setFileNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [ack, setAck] = useState(false);
  const m = useMutation({
    mutationFn: (body: Record<string, unknown>) => api<Written<QuoteResult>>("POST", `/public/quote-links/${token}`, { body }),
    // Teklif kaydedildikten sonra belge (varsa) aynı bağlantıyla bir kez eklenir.
    onSuccess: async () => {
      if (!file) return;
      const form = new FormData();
      form.append("file", file, file.name);
      try {
        const res = await api<Written<{ id: string; file_name: string }>>("POST", `/public/quote-links/${token}/file`, { form });
        setFileNote({ ok: true, text: res.message });
      } catch (e) {
        setFileNote({ ok: false, text: `Belge eklenemedi (${e instanceof Error ? e.message : "hata"}); teklifiniz kaydedildi, belgeyi e-postayla iletebilirsiniz.` });
      }
    },
  });
  const items = q.data?.items ?? [];
  const total = items.reduce((s, it, k) => { try { return s.plus(new Decimal(it.qty).times(parseMoneyInput(prices[k] ?? "") ?? "0")); } catch { return s; } }, new Decimal(0)).toFixed(2);

  function submit(e: FormEvent) {
    e.preventDefault();
    m.mutate({ lines: items.map((_, k) => ({ unit_price: parseMoneyInput(prices[k] ?? "") })), delivery_days: f.delivery_days === "" ? null : Number(f.delivery_days), payment_terms: f.payment_terms, valid_until: f.valid_until || null, note: f.note || null, terms_ack: ack });
  }

  return (
    <main id="main" className="auth" style={{ gridTemplateColumns: "1fr", maxWidth: 640 }}>
      <div className="auth__panel">
        {q.isPending ? <Loading /> : q.isError ? (
          <div className="stack"><h1 className="auth__title">Teklif formu</h1><ErrorState error={q.error} /></div>
        ) : m.isSuccess ? (
          <div className="stack">
            <h1 className="auth__title">Teşekkürler</h1>
            <Alert tone="ok" title="Teklifiniz iletildi">{m.data.message} Toplam: {formatMoney(m.data.data.total)}.</Alert>
            {fileNote && <Alert tone={fileNote.ok ? "ok" : "warn"} title="Teklif belgesi">{fileNote.text}</Alert>}
          </div>
        ) : (
          <form className="stack" noValidate onSubmit={submit} style={{ gap: "var(--s-4)" }}>
            <div>
              <div className="small muted">{q.data.site_name} · {q.data.number}</div>
              <h1 className="auth__title" style={{ marginBottom: 4 }}>{q.data.title}</h1>
              <p className="small mb-0">Sayın {q.data.vendor_name}, aşağıdaki kalemler için teklifinizi bekliyoruz. Bu bağlantı yalnız bir kez kullanılabilir; son geçerlilik {formatDateTime(q.data.expires_at)}.</p>
            </div>
            <FormError error={m.error} />
            <fieldset style={{ border: 0, padding: 0, margin: 0 }} className="stack">
              <legend className="field__label">Birim fiyatlar (KDV dahil, ₺)</legend>
              {fieldError(m.error, "lines") && <span className="field__error" role="alert">{fieldError(m.error, "lines")}</span>}
              {items.map((it, k) => (
                <Field key={k} label={it.description} hint={`${it.qty.replace(".", ",")} ${it.unit}`} error={fieldError(m.error, `lines.${k}`)}>{(p) => <input {...p} className="field__input" inputMode="decimal" autoComplete="off" value={prices[k] ?? ""} onChange={(e) => setPrices((x) => { const n = [...x]; n[k] = e.target.value; return n; })} />}</Field>
              ))}
              <div className="kv"><span className="kv__k strong">Toplam</span><span className="kv__v strong">{formatMoney(total)}</span></div>
            </fieldset>
            <div className="grid grid--2">
              <Field label="Teslim süresi (gün)" required error={fieldError(m.error, "delivery_days")}>{(p) => <input {...p} className="field__input" inputMode="numeric" value={f.delivery_days} onChange={(e) => setF((x) => ({ ...x, delivery_days: e.target.value.replace(/\D/g, "") }))} />}</Field>
              <Field label="Teklif geçerliliği" required error={fieldError(m.error, "valid_until")}>{(p) => <input {...p} className="field__input" type="date" min={todayIso()} value={f.valid_until} onChange={(e) => setF((x) => ({ ...x, valid_until: e.target.value }))} />}</Field>
            </div>
            <Field label="Ödeme koşulu" required hint="ör. peşin, 30 gün vadeli" error={fieldError(m.error, "payment_terms")}>{(p) => <input {...p} className="field__input" maxLength={80} value={f.payment_terms} onChange={(e) => setF((x) => ({ ...x, payment_terms: e.target.value }))} />}</Field>
            <Field label="Not" hint="İsteğe bağlı">{(p) => <textarea {...p} className="field__input" rows={2} maxLength={500} value={f.note} onChange={(e) => setF((x) => ({ ...x, note: e.target.value }))} />}</Field>
            <Field label="Teklif belgesi" hint="İsteğe bağlı · PDF, JPG, PNG ya da WEBP · en çok 10 MB">{(p) => <input {...p} className="field__input" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />}</Field>
            <div className="stack" style={{ gap: 4 }}>
              <label className="check"><input id="vq-ack" type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /><span>Teklifin doğruluğunu ve <a href="/aydinlatma" target="_blank" rel="noopener noreferrer">aydınlatma metnini</a> okuduğumu onaylıyorum.</span></label>
              {fieldError(m.error, "terms_ack") && <span className="field__error" role="alert">{fieldError(m.error, "terms_ack")}</span>}
            </div>
            <SubmitButton busy={m.isPending}>Teklifi gönder</SubmitButton>
          </form>
        )}
      </div>
    </main>
  );
}
