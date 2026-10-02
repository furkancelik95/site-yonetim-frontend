import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import { api, get } from "../../api/client";
import type { Page, Schemas, Written } from "../../api/types";
import { useToast } from "../../components/toast";
import { Alert, Badge, ErrorState, Field, FormError, Kpi, Loading, PageHead, Pager, SubmitButton, fieldError } from "../../components/ui";
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
          <div className="grid grid--kpi">
            <Kpi label="Müşteri" value={formatInt(q.data.customer_count)} />
            <Kpi label="Site" value={formatInt(q.data.site_count)} />
            <Kpi label="Bağımsız bölüm" tone="accent" value={formatInt(q.data.unit_count)} />
            <Kpi label="Tavanı aşan site" tone={q.data.over_cap_sites.length > 0 ? "danger" : "ok"} value={q.data.over_cap_sites.length} />
          </div>

          {q.data.over_cap_sites.length > 0 && (
            <Alert tone="warn" title="Plan tavanını aşan siteler">
              {q.data.over_cap_sites.map((s) => `${s.name} (${s.units}/${s.max_units})`).join(", ")}. Planı yükseltmeyi değerlendirin.
            </Alert>
          )}

          <div className="card">
            <div className="card__head"><span className="card__title">Müşteriler</span></div>
            <div className="card__body card__body--flush">
              <div className="table-wrap">
                <table className="data">
                  <caption className="visually-hidden">Müşteriler</caption>
                  <thead><tr><th scope="col">Müşteri</th><th scope="col">Plan</th><th scope="col" className="right">Site</th><th scope="col" className="right">Bölüm</th></tr></thead>
                  <tbody>
                    {q.data.customers.items.map((c) => (
                      <tr key={c.id}><td className="cell-main">{c.name}</td><td className="small">{c.plan_name ?? "—"}</td><td className="right num">{c.site_count}</td><td className="right num">{formatInt(c.units)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="card__foot"><Pager page={q.data.customers.page} pageSize={q.data.customers.page_size} total={q.data.customers.total} onPage={setPage} /></div>
          </div>

          <div className="card">
            <div className="card__head"><span className="card__title">Siteler</span></div>
            <div className="card__body card__body--flush">
              <div className="table-wrap">
                <table className="data">
                  <caption className="visually-hidden">Siteler ve kullanım</caption>
                  <thead><tr><th scope="col">Site</th><th scope="col">Müşteri</th><th scope="col" className="right">Bölüm / tavan</th><th scope="col">Plan</th></tr></thead>
                  <tbody>
                    {q.data.sites.items.map((s) => (
                      <tr key={s.id} className={s.over_cap ? "is-overdue" : undefined}>
                        <td><div className="cell-main">{s.name}</div><div className="cell-sub mono">{s.slug}</div></td>
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
      <PageHead title="Site aç" />
      <Alert tone="info" title="Açılışta kurulanlar">Kasa ve banka hesabı, standart gider kategorileri, tahakkuk tipleri, dağıtım kuralları ve planın izin verdiği modüller otomatik kurulur.</Alert>
      <form className="card" onSubmit={submit} noValidate>
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
