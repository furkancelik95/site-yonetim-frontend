import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, BarChart3, Building2, CalendarDays, Copy, Layers, ListOrdered, Plus, TrendingUp, Users } from "lucide-react";
import { api, get } from "../../api/client";
import type { Page, Schemas, Written } from "../../api/types";
import { BarChart, Donut } from "../../components/charts";
import { useToast } from "../../components/toast";
import { Alert, Avatar, Badge, Empty, ErrorState, Field, FormError, IconChip, Kpi, Loading, PageHead, Pager, SubmitButton, fieldError } from "../../components/ui";
import { formatInt } from "../../lib/format";
import { moduleName, propertyKind } from "../../lib/labels";

type Overview = Schemas["OverviewOut"];
type Plan = Schemas["PlanOut"];
type Customer = Schemas["CustomerOut"];
type SiteOut = Schemas["SiteOut"];

const usePlans = () => useQuery({ queryKey: ["platform", "plans"], queryFn: () => get<Page<Plan>>("/platform/plans", { page_size: 100 }) });

export function PlatformOverviewPage() {
  const qc = useQueryClient();
  const toast = useToast();
  // Uç tek `page` parametresiyle iki listeyi (müşteri, site) birlikte sayfalar
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ["platform", "overview", page],
    queryFn: () => get<Overview>("/platform/overview", { page, page_size: 50 }),
    placeholderData: keepPreviousData,
  });
  const plans = usePlans();
  const changePlan = useMutation({
    mutationFn: ({ siteId, planId }: { siteId: string; planId: string }) => api<Written<SiteOut>>("PATCH", `/platform/sites/${siteId}/plan`, { body: { plan_id: planId } }),
    onSuccess: (r) => { toast(r.message); qc.invalidateQueries({ queryKey: ["platform"] }); },
    onError: () => toast("Plan değiştirilemedi.", "danger"),
  });

  return (
    <div className="stack">
      <PageHead
        title="Genel bakış"
        subtitle="Yalnız kullanım ölçüsü görünür; sitelerin finans ve kişi verisi platform paneline açık değildir."
        actions={<><Link className="btn" to="musteri-ekle">Müşteri ekle</Link><Link className="btn btn--primary" to="site-ac">Site aç</Link></>}
      />
      {q.isPending ? <Loading /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : (
        <>
          <div className="grid grid--kpi rise">
            <Kpi label="Müşteri" icon={<Users aria-hidden="true" />} value={formatInt(q.data.customer_count)} />
            <Kpi label="Site" icon={<Building2 aria-hidden="true" />} value={formatInt(q.data.site_count)} />
            <Kpi label="Bağımsız bölüm" tone="accent" icon={<Layers aria-hidden="true" />} value={formatInt(q.data.unit_count)} />
            <Kpi label="Tavanı aşan site" tone={q.data.over_cap_sites.length > 0 ? "danger" : "ok"} icon={<AlertTriangle aria-hidden="true" />} value={q.data.over_cap_sites.length} note={q.data.over_cap_sites.length === 0 ? "tüm siteler plan içinde" : "plan yükseltmesi gerekebilir"} />
          </div>

          {q.data.over_cap_sites.length > 0 && (
            <Alert tone="warn" title="Plan tavanını aşan siteler">
              {q.data.over_cap_sites.map((s) => `${s.name} (${s.units}/${s.max_units})`).join(", ")}. Planı yükseltmeyi değerlendirin.
            </Alert>
          )}

          <div className="plt-grid">
            <div className="card">
              <div className="card__head"><span className="card__icon card__icon--accent"><Users aria-hidden="true" /></span><span className="card__title">Müşteriler</span></div>
              <div className="card__body card__body--flush">
                <div className="table-wrap">
                  <table className="data">
                    <caption className="visually-hidden">Müşteriler</caption>
                    <thead><tr><th scope="col">Müşteri</th><th scope="col">Plan</th><th scope="col" className="right">Site</th><th scope="col" className="right">Bölüm</th></tr></thead>
                    <tbody>
                      {q.data.customers.items.map((c) => (
                        <tr key={c.id}>
                          <td><div className="cell-person"><Avatar name={c.name} size="sm" soft /><div className="cell-main">{c.name}</div></div></td>
                          <td>{c.plan_name ? <Badge tone="info">{c.plan_name}</Badge> : <span className="subtle">—</span>}</td>
                          <td className="right num">{c.site_count}</td>
                          <td className="right num">{formatInt(c.units)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="card__foot"><Pager page={q.data.customers.page} pageSize={q.data.customers.page_size} total={q.data.customers.total} onPage={setPage} /></div>
            </div>

            {/* Plan dağılımı: listelenen sitelerden sayılır (gerçek veri, sayfa kapsamı) */}
            <div className="card">
              <div className="card__head"><span className="card__icon card__icon--info"><Layers aria-hidden="true" /></span><span className="card__title">Plan dağılımı</span></div>
              <div className="card__body">
                <Donut
                  label="Sitelerin plan dağılımı"
                  centerSub="site"
                  segments={Object.entries(
                    q.data.sites.items.reduce<Record<string, number>>((acc, s) => {
                      const k = s.plan_name ?? "Plan yok";
                      acc[k] = (acc[k] ?? 0) + 1;
                      return acc;
                    }, {}),
                  ).map(([label, value]) => ({ label, value }))}
                />
                {q.data.sites.total > q.data.sites.items.length && <p className="xs muted mb-0 mt-2">Bu sayfada listelenen {q.data.sites.items.length} site sayıldı.</p>}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card__head"><span className="card__icon card__icon--accent"><Building2 aria-hidden="true" /></span><span className="card__title">Siteler</span></div>
            <div className="card__body card__body--flush">
              <div className="table-wrap">
                <table className="data">
                  <caption className="visually-hidden">Siteler ve kullanım</caption>
                  <thead><tr><th scope="col">Site</th><th scope="col">Müşteri</th><th scope="col" className="right">Bölüm / tavan</th><th scope="col">Plan</th></tr></thead>
                  <tbody>
                    {q.data.sites.items.map((s) => (
                      <tr key={s.id} className={s.over_cap ? "is-overdue" : undefined}>
                        <td><div className="cell-person"><IconChip tone={s.over_cap ? "danger" : undefined}><Building2 /></IconChip><div><div className="cell-main">{s.name}</div><div className="cell-sub mono">{s.slug}</div></div></div></td>
                        <td className="small">{s.organization_name ?? "—"}</td>
                        <td className="right num">{formatInt(s.units)} / {s.max_units ?? "∞"} {s.over_cap && <Badge tone="danger">Aşıldı</Badge>}</td>
                        <td>
                          <select
                            aria-label={`${s.name} planı`}
                            className="field__input"
                            style={{ minHeight: 36, padding: "4px 8px" }}
                            value={plans.data?.items.find((p) => p.name === s.plan_name)?.id ?? ""}
                            disabled={changePlan.isPending || !plans.data}
                            onChange={(e) => changePlan.mutate({ siteId: s.id, planId: e.target.value })}
                          >
                            {!s.plan_name && <option value="">Plan yok</option>}
                            {plans.data?.items.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="card__foot"><Pager page={q.data.sites.page} pageSize={q.data.sites.page_size} total={q.data.sites.total} onPage={setPage} /></div>
          </div>
        </>
      )}
    </div>
  );
}

function PlanSelect({ value, onChange, error }: { value: string; onChange: (v: string) => void; error?: string }) {
  const plans = usePlans();
  const selected = plans.data?.items.find((p) => p.id === value);
  return (
    <Field label="Plan" required error={error} hint={selected ? `${selected.max_units ? `En fazla ${selected.max_units} bölüm · ` : ""}${selected.allowed_modules.map(moduleName).join(", ")}` : undefined}>
      {(p) => (
        <select {...p} className="field__input" value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Seçin</option>
          {plans.data?.items.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      )}
    </Field>
  );
}

export function NewCustomerPage() {
  const qc = useQueryClient();
  const [f, setF] = useState({ name: "", tax_number: "", plan_id: "", admin_full_name: "", admin_email: "" });
  const [copied, setCopied] = useState(false);
  const m = useMutation({
    mutationFn: (body: Record<string, unknown>) => api<Written<Customer>>("POST", "/platform/customers", { body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["platform"] }),
  });
  const up = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  function submit(e: FormEvent) {
    e.preventDefault();
    m.mutate({ name: f.name.trim(), tax_number: f.tax_number.trim() || null, plan_id: f.plan_id, admin_full_name: f.admin_full_name.trim(), admin_email: f.admin_email.trim().toLocaleLowerCase("tr-TR") });
  }

  // Geçici parola yalnız bir kez gösterilir; sayfadan çıkınca bir daha görülemez.
  if (m.data) {
    const c = m.data.data;
    return (
      <div className="stack page--narrow">
        <PageHead title="Müşteri açıldı" />
        <Alert tone="ok" title={c.name}>{m.data.message}</Alert>
        <div className="card">
          <div className="card__body">
            <div className="kv"><span className="kv__k">Yetkili</span><span className="kv__v">{c.admin.full_name}</span></div>
            <div className="kv"><span className="kv__k">E-posta</span><span className="kv__v mono">{c.admin.email}</span></div>
            <div className="kv">
              <span className="kv__k">Geçici parola</span>
              <span className="kv__v">
                <span className="mono strong">{c.temporary_password}</span>{" "}
                <button className="btn btn--ghost btn--sm" type="button" onClick={() => navigator.clipboard?.writeText(c.temporary_password).then(() => setCopied(true))}>
                  <Copy aria-hidden="true" /> {copied ? "Kopyalandı" : "Kopyala"}
                </button>
              </span>
            </div>
            <Alert tone="warn" title="Bu parola bir daha gösterilmez">Yetkiliye güvenli bir kanaldan iletin. İlk girişte kendi parolasını belirlemesi istenir.</Alert>
          </div>
          <div className="card__foot row" style={{ gap: "var(--s-2)" }}>
            <Link className="btn btn--primary" to={`/yonetim/site-ac?musteri=${c.organization_id}`}>Bu müşteriye site aç</Link>
            <Link className="btn" to="/yonetim">Genel bakış</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="stack page--narrow">
      <PageHead title="Müşteri ekle" subtitle="Yönetim şirketi ya da kendi kendini yöneten site. İlk yetkili kullanıcı da açılır." />
      <form className="card" onSubmit={submit} noValidate>
        <div className="card__head"><span className="card__icon card__icon--accent"><Building2 aria-hidden="true" /></span><span className="card__title">Müşteri ve ilk yetkili</span></div>
        <div className="card__body stack" style={{ gap: "var(--s-4)" }}>
          <FormError error={m.error} />
          <Field label="Müşteri adı" required error={fieldError(m.error, "name")}>{(p) => <input {...p} className="field__input" value={f.name} onChange={up("name")} />}</Field>
          <Field label="Vergi no" error={fieldError(m.error, "tax_number")}>{(p) => <input {...p} className="field__input" inputMode="numeric" value={f.tax_number} onChange={up("tax_number")} />}</Field>
          <PlanSelect value={f.plan_id} onChange={(v) => setF((x) => ({ ...x, plan_id: v }))} error={fieldError(m.error, "plan_id")} />
          <div className="grid grid--2">
            <Field label="Yetkili ad soyad" required error={fieldError(m.error, "admin_full_name")}>{(p) => <input {...p} className="field__input" value={f.admin_full_name} onChange={up("admin_full_name")} />}</Field>
            <Field label="Yetkili e-posta" required error={fieldError(m.error, "admin_email")}>{(p) => <input {...p} className="field__input" type="email" inputMode="email" value={f.admin_email} onChange={up("admin_email")} />}</Field>
          </div>
        </div>
        <div className="card__foot"><SubmitButton busy={m.isPending} disabled={!f.name.trim() || !f.plan_id || !f.admin_full_name.trim() || !f.admin_email.trim()}>Müşteriyi aç</SubmitButton></div>
      </form>
    </div>
  );
}

export function NewSitePage() {
  const qc = useQueryClient();
  const preset = new URLSearchParams(window.location.search).get("musteri") ?? "";
  const customers = useQuery({ queryKey: ["platform", "overview", "customers"], queryFn: () => get<Overview>("/platform/overview", { page_size: 200 }) });
  const [f, setF] = useState({ name: "", slug: "", plan_id: "", organization_id: preset, property_kind: "residential", city: "", district: "", address: "", bank_name: "", iban: "" });
  const m = useMutation({
    mutationFn: (body: Record<string, unknown>) => api<Written<SiteOut>>("POST", "/platform/sites", { body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["platform"] }),
  });
  const up = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  function submit(e: FormEvent) {
    e.preventDefault();
    m.mutate({
      name: f.name.trim(),
      slug: f.slug.trim() || null,
      plan_id: f.plan_id,
      organization_id: f.organization_id || null,
      property_kind: f.property_kind,
      city: f.city.trim() || null,
      district: f.district.trim() || null,
      address: f.address.trim() || null,
      bank_name: f.bank_name.trim() || null,
      iban: f.iban.replace(/\s/g, "").toLocaleUpperCase("tr-TR") || null,
    });
  }

  if (m.data) {
    const s = m.data.data;
    return (
      <div className="stack page--narrow">
        <PageHead title="Site açıldı" />
        <Alert tone="ok" title={s.name}>{m.data.message}</Alert>
        <div className="card">
          <div className="card__body">
            <div className="kv"><span className="kv__k">Adres</span><span className="kv__v mono">/s/{s.slug}</span></div>
            <div className="kv"><span className="kv__k">Tür</span><span className="kv__v">{propertyKind(s.property_kind)}</span></div>
            <div className="kv"><span className="kv__k">Açık modüller</span><span className="kv__v">{s.modules.map(moduleName).join(", ")}</span></div>
          </div>
          <div className="card__foot row" style={{ gap: "var(--s-2)" }}>
            <button className="btn btn--primary" type="button" onClick={() => { m.reset(); setF((x) => ({ ...x, name: "", slug: "" })); }}>Bir site daha aç</button>
            <Link className="btn" to="/yonetim">Genel bakış</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="stack page--narrow">
      <PageHead title="Site aç" subtitle="Yeni tesis bir müşteriye bağlanır; plan, açılacak modülleri belirler." />
      <Alert tone="info" title="Açılışta kurulanlar">Kasa ve banka hesabı, standart gider kategorileri, tahakkuk tipleri, dağıtım kuralları ve planın izin verdiği modüller otomatik kurulur.</Alert>
      <form className="card" onSubmit={submit} noValidate>
        <div className="card__head"><span className="card__icon card__icon--accent"><Building2 aria-hidden="true" /></span><span className="card__title">Site bilgileri</span></div>
        <div className="card__body stack" style={{ gap: "var(--s-4)" }}>
          <FormError error={m.error} />
          <div className="grid grid--2">
            <Field label="Site adı" required error={fieldError(m.error, "name")}>{(p) => <input {...p} className="field__input" value={f.name} onChange={up("name")} />}</Field>
            <Field label="Adres kısaltması" hint="Boşsa addan üretilir (ör. aksu-konaklari)." error={fieldError(m.error, "slug")}>{(p) => <input {...p} className="field__input mono" value={f.slug} onChange={up("slug")} />}</Field>
            <Field label="Müşteri" error={fieldError(m.error, "organization_id")}>
              {(p) => (
                <select {...p} className="field__input" value={f.organization_id} onChange={up("organization_id")}>
                  <option value="">Bağımsız site (müşterisiz)</option>
                  {customers.data?.customers.items.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
            </Field>
            <PlanSelect value={f.plan_id} onChange={(v) => setF((x) => ({ ...x, plan_id: v }))} error={fieldError(m.error, "plan_id")} />
            <Field label="Tür">{(p) => <select {...p} className="field__input" value={f.property_kind} onChange={up("property_kind")}>{["residential", "mixed", "office", "shopping_center"].map((k) => <option key={k} value={k}>{propertyKind(k)}</option>)}</select>}</Field>
            <Field label="İl">{(p) => <input {...p} className="field__input" value={f.city} onChange={up("city")} />}</Field>
            <Field label="İlçe">{(p) => <input {...p} className="field__input" value={f.district} onChange={up("district")} />}</Field>
            <Field label="Banka">{(p) => <input {...p} className="field__input" value={f.bank_name} onChange={up("bank_name")} />}</Field>
          </div>
          <Field label="IBAN" hint="Sakinlerin aidatı yatıracağı sitenin kendi hesabı. Platform parayı tutmaz." error={fieldError(m.error, "iban")}>{(p) => <input {...p} className="field__input mono" value={f.iban} onChange={up("iban")} placeholder="TR00 0000 …" />}</Field>
          <Field label="Açık adres">{(p) => <textarea {...p} className="field__input" rows={2} value={f.address} onChange={up("address")} />}</Field>
        </div>
        <div className="card__foot"><SubmitButton busy={m.isPending} disabled={!f.name.trim() || !f.plan_id}>Siteyi aç</SubmitButton></div>
      </form>
    </div>
  );
}

/** Servis isteği 70 — backend şeması; oranlar ondalık metin ("33.50"). */
type IndexValueRow = Schemas["IndexValueOut"];
type IndexValue = Omit<IndexValueRow, "tufe" | "ufe"> & { tufe: number; ufe: number };

/** Endeks değerleri (SAT-06, 15.3): TÜFE/ÜFE yıllık değişim oranı aylık girilir; tüm tesislerde sözleşme artışında kullanılır. */
export function IndexValuesPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({
    queryKey: ["platform", "index-values"],
    queryFn: async () => (await get<Page<IndexValueRow>>("/platform/index-values", { page_size: 200 })).items.map((v): IndexValue => ({ ...v, tufe: Number(v.tufe), ufe: Number(v.ufe) })),
  });
  const missing = useQuery({ queryKey: ["platform", "index-values", "missing"], queryFn: () => get<Schemas["IndexMissingOut"][]>("/platform/index-values/missing") });
  const now = new Date();
  const [f, setF] = useState({ period: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`, tufe: "", ufe: "" });
  const m = useMutation({
    mutationFn: () => api<Written<IndexValueRow>>("PUT", `/platform/index-values/${f.period}`, { body: { tufe: f.tufe.replace(",", ".").trim() || null, ufe: f.ufe.replace(",", ".").trim() || null } }),
    onSuccess: (r) => { toast(r.message); setF((x) => ({ ...x, tufe: "", ufe: "" })); qc.invalidateQueries({ queryKey: ["platform", "index-values"] }); },
  });
  function submit(e: FormEvent) { e.preventDefault(); m.mutate(); }
  return (
    <div className="stack">
      <PageHead title="Endeks değerleri" subtitle="Sözleşmelerdeki TÜFE / ÜFE artış kuralları bu tablodan hesaplanır. Değer, TÜİK'in açıkladığı yıllık değişim oranıdır (%). TÜİK'ten otomatik çekme Faz 2." />
      {missing.data && missing.data.length > 0 && <Alert tone="warn" title="Endeks değeri eksik">{missing.data.map((m) => `${m.period}: ${m.contracts} sözleşme (${m.sites} tesis)`).join(" · ")} — 30 gün içindeki artışlar bu dönemin değerini bekliyor.</Alert>}
      {q.isError ? null : !q.data ? (
        <div className="grid grid--kpi">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton skel__kpi" />)}</div>
      ) : (() => {
        const sorted = [...q.data].sort((a, b) => a.period.localeCompare(b.period));
        const last = sorted[sorted.length - 1];
        const prev = sorted[sorted.length - 2];
        const pct = (v: number) => `%${v.toLocaleString("tr-TR")}`;
        const dir = (a?: number, b?: number) => (a == null || b == null ? undefined : a > b ? "up" as const : a < b ? "down" as const : "flat" as const);
        return (
          <div className="grid grid--kpi rise">
            <Kpi label="Son dönem" tone="accent" icon={<CalendarDays aria-hidden="true" />} value={last ? last.period : "—"} small note={last ? `${last.entered_by} girdi` : "henüz değer yok"} />
            <Kpi label="TÜFE yıllık" icon={<TrendingUp aria-hidden="true" />} value={last ? pct(last.tufe) : "—"} note={last ? undefined : "henüz değer yok"}
              delta={last && prev ? { tone: "muted", dir: dir(last.tufe, prev.tufe), label: `önceki ${pct(prev.tufe)}` } : undefined} />
            <Kpi label="ÜFE yıllık" icon={<TrendingUp aria-hidden="true" />} value={last ? pct(last.ufe) : "—"} note={last ? undefined : "henüz değer yok"}
              delta={last && prev ? { tone: "muted", dir: dir(last.ufe, prev.ufe), label: `önceki ${pct(prev.ufe)}` } : undefined} />
            <Kpi label="Girilen dönem" icon={<ListOrdered aria-hidden="true" />} value={q.data.length} note="tüm tesislerde kullanılır" />
          </div>
        );
      })()}
      {q.data && q.data.length > 1 && (
        <div className="card">
          <div className="card__head"><span className="card__icon card__icon--accent"><BarChart3 aria-hidden="true" /></span><span className="card__title">TÜFE yıllık değişim</span><span className="card__meta ml-auto">son {Math.min(12, q.data.length)} dönem</span></div>
          <div className="card__body">
            <BarChart label="TÜFE yıllık değişim" format={(v) => `%${v.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}`}
              data={[...q.data].sort((a, b) => a.period.localeCompare(b.period)).slice(-12).map((v) => ({ label: v.period.slice(2).replace("-", "/"), value: v.tufe, sub: `ÜFE %${v.ufe.toLocaleString("tr-TR")}` }))}
              highlight={Math.min(12, q.data.length) - 1} />
          </div>
        </div>
      )}
      <form className="card" noValidate onSubmit={submit}>
        <div className="card__head"><span className="card__icon card__icon--accent"><Plus aria-hidden="true" /></span><span className="card__title">Değer gir</span></div>
        <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
          <FormError error={m.error} />
          <div className="grid grid--kpi">
            <Field label="Dönem" error={fieldError(m.error, "period")}>{(p) => <input {...p} className="field__input" type="month" value={f.period} onChange={(e) => setF((x) => ({ ...x, period: e.target.value }))} />}</Field>
            <Field label="TÜFE yıllık (%)" error={fieldError(m.error, "tufe")}>{(p) => <input {...p} className="field__input" inputMode="decimal" value={f.tufe} onChange={(e) => setF((x) => ({ ...x, tufe: e.target.value }))} />}</Field>
            <Field label="ÜFE yıllık (%)" error={fieldError(m.error, "ufe")}>{(p) => <input {...p} className="field__input" inputMode="decimal" value={f.ufe} onChange={(e) => setF((x) => ({ ...x, ufe: e.target.value }))} />}</Field>
          </div>
        </div>
        <div className="card__foot"><SubmitButton busy={m.isPending}>Kaydet</SubmitButton></div>
      </form>
      <div className="card">
        <div className="card__head"><span className="card__icon card__icon--accent"><ListOrdered aria-hidden="true" /></span><span className="card__title">Girilen değerler</span>{q.data && <span className="card__meta ml-auto">{q.data.length} dönem</span>}</div>
        <div className="card__body card__body--flush">
        {q.isPending ? <Loading /> : q.isError ? <div className="card__body"><ErrorState error={q.error} /></div> : q.data.length === 0 ? <Empty title="Henüz değer girilmedi" icon={<TrendingUp aria-hidden="true" />}>TÜİK yıllık değişim oranını yukarıdan dönem dönem girin.</Empty> : (
          <div className="table-wrap"><table className="data"><caption className="visually-hidden">Endeks değerleri</caption>
            <thead><tr><th scope="col">Dönem</th><th scope="col" className="right">TÜFE %</th><th scope="col" className="right">ÜFE %</th><th scope="col">Giren</th></tr></thead>
            <tbody>{q.data.map((v) => <tr key={v.period}><td>{v.period}</td><td className="right num">{v.tufe.toLocaleString("tr-TR")}</td><td className="right num">{v.ufe.toLocaleString("tr-TR")}</td><td className="small">{v.entered_by}</td></tr>)}</tbody>
          </table></div>
        )}
      </div></div>
    </div>
  );
}

type TestInbox = Schemas["TestInboxOut"];

/**
 * Test gelen kutusu (yalnız geliştirme/demo): SMS/e-posta sağlayıcısı seçilene dek (K5) giriş
 * kodları, davet bağlantıları ve bildirimler dışarı gitmez; burada görünür. Üretimde backend 404.
 */
export function TestInboxPage() {
  const [to, setTo] = useState("");
  const q = useQuery({ queryKey: ["platform", "test-inbox", to], queryFn: () => get<TestInbox>("/platform/test-inbox", { to: to.trim() }), refetchInterval: 5000 });
  return (
    <div className="stack">
      <PageHead title="Test gelen kutusu" subtitle="Test sağlayıcısının son mesajları — SMS, e-posta ve mobil bildirim dışarı gönderilmedi." />
      <div className="field" style={{ maxWidth: "20rem" }}>
        <label className="field__label" htmlFor="ti-to">Alıcı (telefon E.164 ya da e-posta)</label>
        <input id="ti-to" className="field__input" value={to} placeholder="+905321234567" onChange={(e) => setTo(e.target.value)} />
      </div>
      {q.isPending ? <Loading /> : q.isError ? <ErrorState error={q.error} /> : (
        <div className="card">
          <div className="card__body card__body--flush">
            {q.data.items.length === 0 ? <div className="card__body small muted">Mesaj yok.</div> : (
              <div className="table-wrap">
                <table className="data">
                  <caption className="visually-hidden">Test sağlayıcısı mesajları</caption>
                  <thead><tr><th scope="col">Zaman</th><th scope="col">Kanal</th><th scope="col">Alıcı</th><th scope="col">Mesaj</th></tr></thead>
                  <tbody>{q.data.items.map((i) => (
                    <tr key={i.id}>
                      <td className="small nowrap">{new Date(i.at).toLocaleString("tr-TR")}</td>
                      <td className="small">{i.channel}</td>
                      <td className="mono small">{i.to}</td>
                      <td className="small" style={{ wordBreak: "break-word" }}>{i.subject && <div className="strong">{i.subject}</div>}{i.body}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>
          <div className="card__foot"><p className="xs muted mb-0">{q.data.note}</p></div>
        </div>
      )}
    </div>
  );
}
