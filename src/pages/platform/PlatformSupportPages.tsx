import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, BookOpen, LifeBuoy, ShieldCheck, Siren, Smile, ThumbsUp, Timer } from "lucide-react";
import { api, get } from "../../api/client";
import type { Schemas, Written } from "../../api/types";
import { useToast } from "../../components/toast";
import { Badge, Empty, ErrorState, Field, FormError, Kpi, Loading, PageHead, SubmitButton, fieldError } from "../../components/ui";
import { formatDateTime } from "../../lib/format";
import { S_ST, T_CAT, T_PRI, T_ST, type Article, type Session, type Ticket } from "../site/SupportPages";

type Overview = Schemas["OverviewOut"];

/** Platform destek (PYN-06, PYN-04): tüm tesislerin biletleri, SLA durumu, yanıt; müşteri onaylı destek oturumu talebi. */
export function PlatformSupportPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [st, setSt] = useState("");
  const t = useQuery({ queryKey: ["platform", "tickets", st], queryFn: () => get<Ticket[]>("/platform/support-tickets", { status: st || undefined }) });
  const sessions = useQuery({ queryKey: ["platform", "sessions"], queryFn: () => get<Session[]>("/platform/support-sessions") });
  const ov = useQuery({ queryKey: ["platform", "overview", "all"], queryFn: () => get<Overview>("/platform/overview", { page: 1, page_size: 200 }) });
  const siteList = ov.data?.sites.items ?? [];
  const [f, setF] = useState({ site_slug: "", reason: "", hours: "4" });
  const req = useMutation({
    mutationFn: () => { const s = siteList.find((x) => x.slug === (f.site_slug || siteList[0]?.slug)); return api<Written<Session>>("POST", "/platform/support-sessions", { body: { site_slug: s?.slug, site_name: s?.name, reason: f.reason, hours: Number(f.hours) } }); },
    onSuccess: (r) => { toast(r.message); setF((x) => ({ ...x, reason: "" })); qc.invalidateQueries({ queryKey: ["platform", "sessions"] }); },
  });
  const open = (t.data ?? []).filter((x) => !["resolved", "closed"].includes(x.status));
  return (
    <div className="stack">
      <PageHead title="Destek" subtitle="Bilet SLA'sı varsayılan hedeflerle izleniyor (kritik 1/8 saat, yüksek 4/24, normal 8/72); paket bazlı SLA paket kararıyla." />
      <div className="grid grid--kpi rise">
        <Kpi label="Açık bilet" icon={<LifeBuoy aria-hidden="true" />} value={open.length} />
        <Kpi label="İlk yanıtı geciken" icon={<Timer aria-hidden="true" />} value={open.filter((x) => !x.first_response_at && x.sla.first_breached).length} tone={open.some((x) => !x.first_response_at && x.sla.first_breached) ? "danger" : "ok"} />
        <Kpi label="Kritik" icon={<Siren aria-hidden="true" />} value={open.filter((x) => x.priority === "critical").length} tone={open.some((x) => x.priority === "critical") ? "warn" : undefined} />
        <Kpi label="Destek oturumu" icon={<ShieldCheck aria-hidden="true" />} value={(sessions.data ?? []).filter((s) => s.status === "active").length}
          tone={(sessions.data ?? []).some((s) => s.status === "active") ? "danger" : undefined}
          note={`aktif · ${(sessions.data ?? []).filter((s) => s.status === "pending").length} onay bekliyor`} />
      </div>
      <div className="card">
        <div className="card__head">
          <span className="card__icon card__icon--accent"><LifeBuoy aria-hidden="true" /></span>
          <div>
            <div className="card__title">Biletler</div>
            {t.data && <div className="card__meta">{t.data.length} bilet</div>}
          </div>
          <div className="card__tools">
            <div className="field"><label className="field__label" htmlFor="pt-st">Durum</label><select id="pt-st" className="field__input" value={st} onChange={(e) => setSt(e.target.value)}><option value="">Tümü</option>{Object.entries(T_ST).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select></div>
          </div>
        </div>
        <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
          {t.isPending ? <Loading /> : t.isError ? <ErrorState error={t.error} /> : t.data.length === 0 ? <Empty title="Bilet yok" icon={<LifeBuoy aria-hidden="true" />} /> : t.data.map((x) => <PTicket key={x.id} t={x} />)}
        </div>
      </div>
      <form className="card" noValidate onSubmit={(e) => { e.preventDefault(); req.mutate(); }}>
        <div className="card__head"><span className="card__icon card__icon--warn"><ShieldCheck aria-hidden="true" /></span><span className="card__title">Destek oturumu talebi</span></div>
        <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
          <FormError error={req.error} />
          <div className="grid grid--kpi">
            <Field label="Tesis" error={fieldError(req.error, "site_slug")}>{(p) => <select {...p} className="field__input" value={f.site_slug || siteList[0]?.slug || ""} onChange={(e) => setF((x) => ({ ...x, site_slug: e.target.value }))}>{siteList.map((s) => <option key={s.slug} value={s.slug}>{s.name}</option>)}</select>}</Field>
            <Field label="Süre (saat)" error={fieldError(req.error, "hours")}>{(p) => <input {...p} className="field__input" inputMode="numeric" value={f.hours} onChange={(e) => setF((x) => ({ ...x, hours: e.target.value.replace(/\D/g, "") }))} />}</Field>
          </div>
          <Field label="Gerekçe" hint="Bilet numarasıyla" error={fieldError(req.error, "reason")}>{(p) => <input {...p} className="field__input" maxLength={300} value={f.reason} onChange={(e) => setF((x) => ({ ...x, reason: e.target.value }))} />}</Field>
          <p className="xs muted mb-0">Oturum tesis yöneticisi onaylamadan açılmaz; en çok 24 saat, salt okunur; işlemler denetim kaydına "destek oturumu" olarak yazılır.</p>
        </div>
        <div className="card__foot"><SubmitButton busy={req.isPending}>Onaya gönder</SubmitButton></div>
      </form>
      {(sessions.data ?? []).length > 0 && (
        <ul className="session-list" aria-label="Destek oturumları">
          {(sessions.data ?? []).map((s) => (
            <li key={s.id}>
              <Badge tone={S_ST[s.status]![1]}>{S_ST[s.status]![0]}</Badge>
              <span className="strong">{s.site_name}</span>
              <span className="session-list__meta">{s.hours} saat · {s.reason} · {formatDateTime(s.requested_at)}{s.ends_at && ` · bitiş ${formatDateTime(s.ends_at)}`}{s.decided_by && ` · ${s.decided_by}`}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PTicket({ t }: { t: Ticket }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [f, setF] = useState({ body: "", status: "answered" });
  const m = useMutation({
    mutationFn: () => api<Written<Ticket>>("POST", `/platform/support-tickets/${t.id}/messages`, { body: f }),
    onSuccess: (r) => { toast(r.message); setF({ body: "", status: "answered" }); qc.invalidateQueries({ queryKey: ["platform", "tickets"] }); },
  });
  const late = !t.first_response_at && t.sla.first_breached;
  return (
    <details className="card" style={{ borderColor: late ? "var(--danger-line)" : undefined }}>
      <summary className="card__head" style={{ cursor: "pointer" }}><span className="card__title">{t.number} · {t.site_name} · {t.title}</span><span className="ml-auto row" style={{ gap: 4 }}><Badge tone={T_PRI[t.priority]![1]}>{T_PRI[t.priority]![0]}</Badge><Badge tone={T_ST[t.status]![1]}>{T_ST[t.status]![0]}</Badge>{late && <Badge tone="danger">İlk yanıt gecikti</Badge>}</span></summary>
      <div className="card__body stack" style={{ gap: "var(--s-2)" }}>
        <div className="xs muted">{T_CAT[t.category]} · {t.created_by}, {formatDateTime(t.created_at)} · ekran {t.context.path} · sürüm {t.context.app_version} · iz {t.context.correlation_id} · ilk yanıt hedefi {formatDateTime(t.sla.first_due)}, çözüm hedefi {formatDateTime(t.sla.resolve_due)}</div>
        {t.messages.map((x, i) => <div key={i} className="small" style={{ background: x.side === "support" ? "var(--info-bg)" : "var(--bg-sunken)", borderRadius: 8, padding: "var(--s-2)" }}><strong>{x.by}</strong> · {formatDateTime(x.at)}<div style={{ whiteSpace: "pre-wrap" }}>{x.body}</div></div>)}
        {t.status !== "closed" && <>
          <FormError error={m.error} />
          <Field label="Yanıt" error={fieldError(m.error, "body")}>{(p) => <textarea {...p} className="field__input" rows={3} value={f.body} onChange={(e) => setF((x) => ({ ...x, body: e.target.value }))} />}</Field>
          <div className="row" style={{ gap: "var(--s-2)", alignItems: "flex-end", flexWrap: "wrap" }}>
            <Field label="Durum">{(p) => <select {...p} className="field__input" value={f.status} onChange={(e) => setF((x) => ({ ...x, status: e.target.value }))}><option value="answered">Yanıtlandı</option><option value="waiting_customer">Müşteri yanıtı bekleniyor</option><option value="resolved">Çözüldü</option></select>}</Field>
            <button className="btn btn--primary btn--sm" type="button" disabled={!f.body.trim() || m.isPending} onClick={() => m.mutate()}>Gönder</button>
          </div>
        </>}
      </div>
    </details>
  );
}

/** Bilgi bankası yönetimi (PYN-06): makale, okuyucu (personel/sakin), ilgili ekranlar; faydalı/faydasız sayıları. */
export function KnowledgeAdminPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ["platform", "kb"], queryFn: () => get<Article[]>("/knowledge-articles") });
  const [edit, setEdit] = useState<Article | null>(null);
  const [f, setF] = useState({ title: "", body: "", audience: "staff", screens: "" });
  const m = useMutation({
    mutationFn: () => api<Written<Article>>(edit ? "PATCH" : "POST", edit ? `/platform/knowledge-articles/${edit.id}` : "/platform/knowledge-articles", { body: { ...f, screens: f.screens.split(",").map((s) => s.trim()).filter(Boolean) } }),
    onSuccess: (r) => { toast(r.message); setEdit(null); setF({ title: "", body: "", audience: "staff", screens: "" }); qc.invalidateQueries({ queryKey: ["platform", "kb"] }); },
  });
  function startEdit(a: Article) { setEdit(a); setF({ title: a.title, body: a.body, audience: a.audience, screens: a.screens.join(", ") }); }
  const low = (q.data ?? []).filter((a) => a.not_helpful > a.helpful);
  return (
    <div className="stack">
      <PageHead title="Bilgi bankası" subtitle="Makaleler ilgili ekranlarda bağlamsal yardım olarak görünür. Faydasız bulunan makaleler güncelleme listesine düşer." />
      {q.isError ? null : !q.data ? (
        <div className="grid grid--kpi">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton skel__kpi" />)}</div>
      ) : (() => {
        const yes = q.data.reduce((a, x) => a + x.helpful, 0);
        const no = q.data.reduce((a, x) => a + x.not_helpful, 0);
        const staff = q.data.filter((a) => a.audience === "staff").length;
        return (
          <div className="grid grid--kpi rise">
            <Kpi label="Makale" tone="accent" icon={<BookOpen aria-hidden="true" />} value={q.data.length} note={`${staff} personel · ${q.data.length - staff} sakin`} />
            <Kpi label="Faydalı bulundu" tone="ok" icon={<ThumbsUp aria-hidden="true" />} value={yes} note={`${no} kez faydasız`} />
            <Kpi label="Memnuniyet" icon={<Smile aria-hidden="true" />} value={yes + no > 0 ? `%${Math.round((yes / (yes + no)) * 100)}` : "—"} note={yes + no > 0 ? `${yes + no} geri bildirim` : "geri bildirim yok"} />
            <Kpi label="Güncellenmeli" tone={low.length > 0 ? "warn" : undefined} icon={<AlertTriangle aria-hidden="true" />} value={low.length} note="faydasız oyu faydalıdan fazla" />
          </div>
        );
      })()}
      {low.length > 0 && <div className="small"><Badge tone="warn">Güncellenmeli</Badge> {low.map((a) => a.title).join(", ")}</div>}
      <form className="card" noValidate onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
        <div className="card__head"><span className="card__icon card__icon--accent"><BookOpen aria-hidden="true" /></span><span className="card__title">{edit ? `Düzenle: ${edit.title}` : "Yeni makale"}</span></div>
        <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
          <FormError error={m.error} />
          <div className="grid grid--2">
            <Field label="Başlık" error={fieldError(m.error, "title")}>{(p) => <input {...p} className="field__input" maxLength={120} value={f.title} onChange={(e) => setF((x) => ({ ...x, title: e.target.value }))} />}</Field>
            <Field label="Okuyucu">{(p) => <select {...p} className="field__input" value={f.audience} onChange={(e) => setF((x) => ({ ...x, audience: e.target.value }))}><option value="staff">Yönetim ve personel</option><option value="resident">Sakin (SSS)</option></select>}</Field>
          </div>
          <Field label="İlgili ekranlar" hint="Virgülle; ör. satin-alma, rezervasyon, iceri-aktar">{(p) => <input {...p} className="field__input" value={f.screens} onChange={(e) => setF((x) => ({ ...x, screens: e.target.value }))} />}</Field>
          <Field label="Metin" error={fieldError(m.error, "body")}>{(p) => <textarea {...p} className="field__input" rows={6} value={f.body} onChange={(e) => setF((x) => ({ ...x, body: e.target.value }))} />}</Field>
        </div>
        <div className="card__foot row" style={{ gap: "var(--s-2)" }}><SubmitButton busy={m.isPending}>{edit ? "Güncelle" : "Yayınla"}</SubmitButton>{edit && <button className="btn btn--ghost" type="button" onClick={() => { setEdit(null); setF({ title: "", body: "", audience: "staff", screens: "" }); }}>Vazgeç</button>}</div>
      </form>
      {q.isPending ? <Loading /> : q.isError ? <ErrorState error={q.error} /> : (q.data ?? []).length === 0 ? <Empty title="Makale yok" /> : q.data!.map((a) => (
        <div key={a.id} className="card"><div className="card__body row row--between" style={{ gap: "var(--s-2)", flexWrap: "wrap" }}>
          <div><div className="strong">{a.title}</div><div className="small muted">{a.audience === "staff" ? "Personel" : "Sakin"} · ekranlar: {a.screens.join(", ") || "—"} · faydalı {a.helpful} · faydasız {a.not_helpful} · {a.updated_by}, {formatDateTime(a.updated_at)}</div></div>
          <button className="btn btn--sm" type="button" onClick={() => startEdit(a)}>Düzenle</button>
        </div></div>
      ))}
    </div>
  );
}
