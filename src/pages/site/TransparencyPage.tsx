import { useState, type FormEvent } from "react";
import { FileBarChart, Plus } from "lucide-react";
import { Link } from "react-router";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { Page, Schemas } from "../../api/types";
import { TransparencyContentView } from "../../components/TransparencyReport";
import { Alert, Badge, ConfirmButton, Empty, ErrorState, Field, FormError, Loading, PageHead, Pager, SubmitButton, fieldError } from "../../components/ui";
import { formatDateTime } from "../../lib/format";
import { useUrlState } from "../../lib/hooks";
import { P, useSite } from "../../site/SiteContext";

type Report = Schemas["TransparencyReportOut"];
type PublishOut = Schemas["TransparencyPublishOut"];

const STATUS: Record<string, [string, "muted" | "info" | "ok" | "danger"]> = {
  draft: ["Taslak", "muted"],
  pending: ["Onay bekliyor", "info"],
  published: ["Yayında", "ok"],
  rejected: ["Reddedildi", "danger"],
};
const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

/** Şeffaflık raporu (RAP-02, K32): kişi/bölüm içermeyen aylık özet hazırlanır, "Şeffaflık raporu"
 * onay kuralından geçer (kural yoksa yönetici yayınlar) ve sakin uygulamasında yayınlanır. */
export function TransparencyPage() {
  const { can } = useSite();
  const manage = can(P.transparencyManage);
  const [s, set] = useUrlState({ page: "1" });
  const q = useSiteGet<Page<Report>>("/transparency-reports", { page: s.page, page_size: 12 });
  const [adding, setAdding] = useState(false);
  return (
    <div className="stack">
      <PageHead
        title="Şeffaflık raporu"
        subtitle="Sakinler tek tek gideri ve faturayı görmez; yönetimin onayladığı aylık gelir–gider özetini görür. Raporda kişi ve bölüm bilgisi yoktur."
        actions={manage && <button className="btn btn--primary" type="button" aria-expanded={adding} onClick={() => setAdding((v) => !v)}><Plus aria-hidden="true" /> Rapor hazırla</button>}
      />
      {adding && <NewReport onDone={() => setAdding(false)} />}
      {q.isPending ? <Loading /> : q.isError ? <ErrorState error={q.error} /> : q.data.items.length === 0 ? (
        <div className="card"><Empty title="Henüz rapor yok" icon={<FileBarChart aria-hidden="true" />} /></div>
      ) : (
        <div className="stack" style={{ gap: "var(--s-3)" }}>
          {q.data.items.map((r) => <ReportCard key={r.id} r={r} manage={manage} />)}
          <Pager page={q.data.page} pageSize={q.data.page_size} total={q.data.total} onPage={(p) => set({ page: String(p) })} />
        </div>
      )}
    </div>
  );
}

function ReportCard({ r, manage }: { r: Report; manage: boolean }) {
  const { site, can } = useSite();
  const [pending, setPending] = useState<string | null>(null);
  const publish = useSiteMutation<Record<string, never>, PublishOut>("POST", `/transparency-reports/${r.id}/publish`, {
    onSuccess: (d) => setPending(d.approval_request_id ?? null),
    onPending: (d) => setPending(d.approval_request_id),
  });
  const remove = useSiteMutation<string, unknown>("DELETE", (id) => `/transparency-reports/${id}`);
  const [label, tone] = STATUS[r.status] ?? [r.status, "muted"];
  const approvalId = pending ?? r.approval_request_id;
  return (
    <article className="card">
      <div className="card__head">
        <h2 className="card__title" style={{ margin: 0 }}>{MONTHS[r.month - 1]} {r.year}</h2>
        <Badge tone={tone}>{label}</Badge>
        <span className="card__meta ml-auto">{r.prepared_by} hazırladı · {formatDateTime(r.created_at)}</span>
      </div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        {r.status === "rejected" && <Alert tone="danger" title="Onaycı reddetti">{r.rejection_reason} Aynı dönem için yeni taslak hazırlayabilirsiniz.</Alert>}
        {r.status === "pending" && approvalId && <Alert tone="info">Onay bekliyor. <Link to={`/s/${site.slug}/onaylar/${approvalId}`}>Onay talebini aç</Link></Alert>}
        <TransparencyContentView c={r.content} note={r.note} />
        <FormError error={publish.error ?? remove.error} />
      </div>
      <div className="card__foot row small muted" style={{ gap: "var(--s-2)", flexWrap: "wrap" }}>
        <span>Kapsam: {[r.scope.include_categories && "gider kategorileri", r.scope.include_collection && "tahsilat oranı", r.scope.include_cash_balance && "kasa + banka bakiyesi"].filter(Boolean).join(", ") || "yalnız toplamlar"}</span>
        {r.published_at && <span>· {r.published_by} yayınladı, {formatDateTime(r.published_at)}</span>}
        {manage && r.status === "draft" && (
          <span className="ml-auto row" style={{ gap: "var(--s-2)" }}>
            <ConfirmButton className="btn btn--sm btn--ghost" title="Taslağı sil" confirmLabel="Sil" danger body={<p className="mb-0">Taslak silinir; dönem için yeniden hazırlanabilir.</p>} onConfirm={() => remove.mutateAsync(r.id)}>Sil</ConfirmButton>
            <ConfirmButton className="btn btn--sm btn--primary" title="Yayına gönder" confirmLabel="Gönder"
              body={<p className="mb-0">"Şeffaflık raporu" onay kuralı varsa rapor onaya gider; yoksa {can(P.transparencyPublish) ? "hemen sakinlere yayınlanır" : "yalnız site yöneticisi yayınlayabilir"}. Tutarlar taslaktaki gibi kalır.</p>}
              onConfirm={() => publish.mutateAsync({})}>Yayına gönder</ConfirmButton>
          </span>
        )}
        {manage && r.status === "rejected" && <span className="ml-auto"><ConfirmButton className="btn btn--sm btn--ghost" title="Reddedilen raporu sil" confirmLabel="Sil" danger body={<p className="mb-0">Reddedilen rapor listeden kalkar.</p>} onConfirm={() => remove.mutateAsync(r.id)}>Sil</ConfirmButton></span>}
      </div>
    </article>
  );
}

function NewReport({ onDone }: { onDone: () => void }) {
  const now = new Date();
  const last = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const [f, setF] = useState({ year: String(last.getFullYear()), month: String(last.getMonth() + 1), note: "" });
  const [scope, setScope] = useState({ include_categories: true, include_collection: true, include_cash_balance: false });
  const m = useSiteMutation<Record<string, unknown>, Report>("POST", "/transparency-reports", { onSuccess: onDone });
  function submit(e: FormEvent) {
    e.preventDefault();
    m.mutate({ year: Number(f.year), month: Number(f.month), note: f.note.trim() || null, scope });
  }
  const years = [0, 1, 2].map((i) => String(now.getFullYear() - i));
  return (
    <form className="card" onSubmit={submit} noValidate>
      <div className="card__head"><span className="card__title">Rapor hazırla</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        <div className="grid grid--2">
          <Field label="Yıl">{(p) => <select {...p} className="field__input" value={f.year} onChange={(e) => setF((x) => ({ ...x, year: e.target.value }))}>{years.map((y) => <option key={y}>{y}</option>)}</select>}</Field>
          <Field label="Ay" error={fieldError(m.error, "month")}>{(p) => <select {...p} className="field__input" value={f.month} onChange={(e) => setF((x) => ({ ...x, month: e.target.value }))}>{MONTHS.map((l, i) => <option key={l} value={String(i + 1)}>{l}</option>)}</select>}</Field>
        </div>
        <fieldset className="stack" style={{ gap: "var(--s-1)", border: 0, padding: 0, margin: 0 }}>
          <legend className="field__label">Kapsam (yönetim kurulunun belirlediği)</legend>
          <label className="check"><input type="checkbox" checked={scope.include_categories} onChange={(e) => setScope((x) => ({ ...x, include_categories: e.target.checked }))} /> Gider kategorileri dökümü</label>
          <label className="check"><input type="checkbox" checked={scope.include_collection} onChange={(e) => setScope((x) => ({ ...x, include_collection: e.target.checked }))} /> Aidat tahsilat oranı</label>
          <label className="check"><input type="checkbox" checked={scope.include_cash_balance} onChange={(e) => setScope((x) => ({ ...x, include_cash_balance: e.target.checked }))} /> Kasa + banka toplam bakiyesi</label>
        </fieldset>
        <Field label="Not" hint="İsteğe bağlı; sakinler görür. Kişi ya da bölüm adı yazmayın." error={fieldError(m.error, "note")}>{(p) => <textarea {...p} className="field__input" rows={2} maxLength={1000} value={f.note} onChange={(e) => setF((x) => ({ ...x, note: e.target.value }))} />}</Field>
        <p className="xs muted mb-0">Tutarlar hazırlama anında hesaplanıp dondurulur; tedarikçi, gider açıklaması ve fatura rapora girmez.</p>
      </div>
      <div className="card__foot row" style={{ gap: "var(--s-2)" }}>
        <SubmitButton busy={m.isPending}>Taslak hazırla</SubmitButton>
        <button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button>
      </div>
    </form>
  );
}
