import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import Decimal from "decimal.js";
import { ChevronRight, Copy, FileText, Package, Receipt, Wrench } from "lucide-react";
import { ApiError, openDocument } from "../../api/client";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { AccountStatement, Page, Schemas } from "../../api/types";
import { useToast } from "../../components/toast";
import { Alert, Badge, Empty, ErrorState, Field, FormError, Loading, Money, Pager, SubmitButton, fieldError, useDocumentTitle } from "../../components/ui";
import { formatDate, formatDateTime, formatMoney } from "../../lib/format";
import { CATEGORIES, accountKind, importance, importanceTone, ledgerSource, priorityTone, requestCategory, requestPriority, requestStatus, requestStatusTone } from "../../lib/labels";
import { useSite } from "../../site/SiteContext";

type Home = Schemas["HomeOut"];
type Ann = Schemas["AnnouncementOut"];
type Req = Schemas["RequestOut"];
type MyPackage = Schemas["MyPackage"];
type SiteExpenses = Schemas["SiteExpensesOut"];

/** Personel sakin ekranını açarsa servis 403/404 döner; ne olduğunu açıkça söyle. */
function StaffNotice({ error }: { error: unknown }) {
  if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
    return (
      <Alert tone="info" title="Bu ekran sakin hesabıyla görülür">
        Sakin, giriş yaptığında yalnızca kendi dairesinin borcunu, duyurularını ve taleplerini görür. Önizleme için gösterim hesabıyla
        (sakin@demo.local) giriş yapabilirsiniz.
      </Alert>
    );
  }
  return <ErrorState error={error} />;
}

export function ResidentHomePage() {
  useDocumentTitle("Ana sayfa");
  const { site } = useSite();
  const toast = useToast();
  const q = useSiteGet<Home>("/resident/home");
  const pk = useSiteGet<MyPackage[]>("/resident/packages", undefined, { enabled: q.isSuccess });
  if (q.isPending) return <Loading />;
  if (q.isError) return <StaffNotice error={q.error} />;
  const h = q.data;
  const balance = new Decimal(h.total_balance);
  const nextDue = h.accounts.map((a) => a.oldest_open_due_date).filter(Boolean).sort()[0];
  const base = `/sakin/${site.slug}`;

  return (
    <>
      {/* Borç kartı — sakinin uygulamayı açma sebebinin çoğu bu */}
      <div className="balance">
        <div className="balance__label">Güncel bakiyeniz</div>
        <div className="balance__value">{formatMoney(balance.abs().toFixed(2))}</div>
        <div className="balance__due">
          {balance.gt(0.005) ? <>Ödenmesi gereken{nextDue && <> · En eski vade {formatDate(nextDue)}</>}</> : balance.lt(-0.005) ? "Lehinize alacak — sonraki borca sayılır" : "Borcunuz bulunmuyor"}
        </div>
        <div className="balance__actions">
          <Link className="balance__btn" to={`${base}/borcum`}><Receipt aria-hidden="true" /> Detay</Link>
          {h.accounts[0] && (
            <button
              type="button"
              className="balance__btn"
              onClick={() => navigator.clipboard?.writeText(h.accounts.map((a) => a.reference_code).join(", ")).then(() => toast("Referans kodu kopyalandı."))}
            >
              <Copy aria-hidden="true" /> Referansı kopyala
            </button>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card__body">
          <div className="section-title">Hesaplarınız</div>
          {h.accounts.map((a) => (
            <div key={a.id} className="kv">
              <span className="kv__k">{a.unit_name} · {accountKind(a.kind)} <span className="mono xs">{a.reference_code}</span></span>
              <span className="kv__v"><Money value={a.balance} tone="balance" /></span>
            </div>
          ))}
          <div className="calc">Havale açıklamasına referans kodunu yazmanız ödemenizin doğru hesaba işlenmesini kolaylaştırır.</div>
        </div>
      </div>

      {pk.data && pk.data.length > 0 && (
        <Alert tone="info" title={`${pk.data.length} kargonuz güvenlikte bekliyor`}>
          {pk.data.map((p) => (
            <div key={p.id}>{p.carrier ?? "Kargo"} · {formatDateTime(p.received_at)} · Teslim kodu <strong className="mono">{p.pickup_code}</strong></div>
          ))}
        </Alert>
      )}

      {/* Modül kapalıysa servis null döner; bölüm gösterilmez */}
      {h.announcements && (
        <div>
          <div className="section-title">Duyurular</div>
          <div className="stack" style={{ gap: "var(--s-3)" }}>
            {h.announcements.length === 0 && <p className="small muted">Duyuru yok.</p>}
            {h.announcements.map((a) => <AnnouncementItem key={a.id} a={a} short />)}
          </div>
          <Link className="btn mt-4" style={{ width: "100%" }} to={`${base}/duyurular`}>Tüm duyurular <ChevronRight aria-hidden="true" /></Link>
        </div>
      )}

      {h.open_requests && <div>
        <div className="section-title">Taleplerim</div>
        {h.open_requests.length > 0 ? (
          <Alert tone="info" title={`${h.open_requests.length} açık talebiniz var`}>Durumunu Taleplerim sekmesinden izleyebilirsiniz.</Alert>
        ) : (
          <div className="r-item"><div style={{ flex: 1 }}><div className="r-item__title">Açık talebiniz yok</div><div className="r-item__body">Arıza ya da isteğinizi buradan iletebilirsiniz.</div></div></div>
        )}
        <Link className="btn btn--primary mt-4" style={{ width: "100%" }} to={`${base}/taleplerim`}><Wrench aria-hidden="true" /> Talep oluştur</Link>
      </div>}
    </>
  );
}

function AnnouncementItem({ a, short }: { a: Ann; short?: boolean }) {
  const body = short && a.body.length > 110 ? a.body.slice(0, 110) + "…" : a.body;
  return (
    <div className="r-item">
      <div style={{ flex: 1 }}>
        <div className="r-item__title">{a.title}</div>
        <div className="r-item__meta">
          {formatDateTime(a.published_at)} {a.importance !== "normal" && <Badge tone={importanceTone(a.importance)}>{importance(a.importance)}</Badge>}
        </div>
        <div className="r-item__body" style={{ whiteSpace: "pre-wrap" }}>{body}</div>
      </div>
    </div>
  );
}

export function ResidentStatementPage() {
  useDocumentTitle("Borcum");
  const home = useSiteGet<Home>("/resident/home");
  const [account, setAccount] = useState("");
  const [page, setPage] = useState(1);
  // Önce oturan (aidat) hesabı: sakinin asıl merak ettiği borç bu
  const accounts = [...(home.data?.accounts ?? [])].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "occupant" ? -1 : 1));
  const accountId = account || accounts[0]?.id || "";
  const q = useSiteGet<AccountStatement>("/resident/statement", { account_id: accountId, page, page_size: 30 }, { enabled: !!accountId });

  if (home.isPending) return <Loading />;
  if (home.isError) return <StaffNotice error={home.error} />;

  return (
    <>
      {accounts.length > 1 && (
        <div className="row" role="group" aria-label="Hesap" style={{ gap: "var(--s-2)" }}>
          {accounts.map((a) => (
            <button key={a.id} type="button" className={`btn btn--sm${a.id === accountId ? " btn--primary" : ""}`} aria-pressed={a.id === accountId} onClick={() => { setAccount(a.id); setPage(1); }}>
              {a.unit_name} · {accountKind(a.kind)}
            </button>
          ))}
        </div>
      )}
      {q.isPending ? <Loading /> : q.isError ? <ErrorState error={q.error} /> : (
        <>
          <div className="balance">
            <div className="balance__label">{q.data.account.unit_name} · {accountKind(q.data.account.kind)}</div>
            <div className="balance__value">{formatMoney(new Decimal(q.data.account.balance).abs().toFixed(2))}</div>
            <div className="balance__due">{Number(q.data.account.balance) > 0 ? "borç" : Number(q.data.account.balance) < 0 ? "alacak" : "borç yok"} · <span className="mono">{q.data.account.reference_code}</span></div>
          </div>

          {q.data.last_charge && (
            <details className="card">
              <summary className="card__head" style={{ cursor: "pointer" }}><span className="card__title">Son aidat nasıl hesaplandı? ({q.data.last_charge.period})</span></summary>
              <div className="card__body">
                {q.data.last_charge.lines.map((l) => (
                  <div key={l.budget_item_id} className="kv">
                    <span className="kv__k">{l.description}<div className="calc">{l.explanation}</div></span>
                    <span className="kv__v"><Money value={l.amount} /></span>
                  </div>
                ))}
                <div className="kv"><span className="kv__k strong">Toplam</span><span className="kv__v strong"><Money value={q.data.last_charge.amount} /></span></div>
              </div>
            </details>
          )}

          <div>
            <div className="section-title">Hareketler</div>
            <div className="stack" style={{ gap: "var(--s-2)" }}>
              {q.data.entries.items.map((e) => (
                <div key={e.id} className="r-item">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="r-item__title">{e.description}</div>
                    <div className="r-item__meta">{formatDate(e.date)} · {ledgerSource(e.source)}{e.due_date ? ` · son ödeme ${formatDate(e.due_date)}` : ""}</div>
                  </div>
                  <div className="right">
                    {Number(e.debit) !== 0 ? <Money value={e.debit} className="amount-pos" /> : <Money value={`-${e.credit}`} className="amount-neg" />}
                    <div className="xs muted">bakiye <Money value={e.running_balance} /></div>
                  </div>
                </div>
              ))}
            </div>
            <Pager page={q.data.entries.page} pageSize={q.data.entries.page_size} total={q.data.entries.total} onPage={setPage} />
          </div>
        </>
      )}
    </>
  );
}

export function ResidentAnnouncementsPage() {
  useDocumentTitle("Duyurular");
  const [page, setPage] = useState(1);
  const q = useSiteGet<Page<Ann>>("/resident/announcements", { page, page_size: 20 });
  if (q.isPending) return <Loading />;
  if (q.isError) return <StaffNotice error={q.error} />;
  return (
    <div className="stack" style={{ gap: "var(--s-3)" }}>
      {q.data.items.length === 0 && <Empty title="Duyuru yok" />}
      {q.data.items.map((a) => <AnnouncementItem key={a.id} a={a} />)}
      <Pager page={q.data.page} pageSize={q.data.page_size} total={q.data.total} onPage={setPage} />
    </div>
  );
}

export function ResidentRequestsPage() {
  useDocumentTitle("Taleplerim");
  const [page, setPage] = useState(1);
  const q = useSiteGet<Page<Req>>("/resident/requests", { page, page_size: 20 });
  const [f, setF] = useState({ title: "", description: "", category: "other" });
  const m = useSiteMutation<Record<string, unknown>, Schemas["RequestDetail"]>("POST", "/resident/requests", { onSuccess: () => setF({ title: "", description: "", category: "other" }) });

  function submit(e: FormEvent) {
    e.preventDefault();
    m.mutate({ title: f.title.trim(), description: f.description.trim() || null, category: f.category, priority: "normal" });
  }

  if (q.isError) return <StaffNotice error={q.error} />;
  return (
    <>
      <form className="card" onSubmit={submit} noValidate>
        <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
          <div className="section-title" style={{ margin: 0 }}>Yeni talep</div>
          <FormError error={m.error} />
          <Field label="Konu" required error={fieldError(m.error, "title")}>{(p) => <input {...p} className="field__input" value={f.title} onChange={(e) => setF((x) => ({ ...x, title: e.target.value }))} placeholder="ör. Banyoda su sızıntısı" />}</Field>
          <Field label="Kategori">{(p) => <select {...p} className="field__input" value={f.category} onChange={(e) => setF((x) => ({ ...x, category: e.target.value }))}>{CATEGORIES.map((c) => <option key={c} value={c}>{requestCategory(c)}</option>)}</select>}</Field>
          <Field label="Açıklama">{(p) => <textarea {...p} className="field__input" rows={3} value={f.description} onChange={(e) => setF((x) => ({ ...x, description: e.target.value }))} />}</Field>
          <SubmitButton busy={m.isPending} disabled={!f.title.trim()}>Talebi gönder</SubmitButton>
        </div>
      </form>

      <div>
        <div className="section-title">Taleplerim</div>
        {q.isPending ? <Loading /> : q.data.items.length === 0 ? <p className="small muted">Henüz talebiniz yok.</p> : (
          <div className="stack" style={{ gap: "var(--s-2)" }}>
            {q.data.items.map((r) => (
              <div key={r.id} className="r-item">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="r-item__title">#{r.number} {r.title}</div>
                  <div className="r-item__meta">{requestCategory(r.category)} · {formatDateTime(r.created_at)}</div>
                  {r.resolution && <div className="r-item__body">Çözüm: {r.resolution}</div>}
                </div>
                <div className="stack" style={{ gap: 4, alignItems: "flex-end" }}>
                  <Badge tone={requestStatusTone(r.status)}>{r.status_label || requestStatus(r.status)}</Badge>
                  {(r.priority === "high" || r.priority === "urgent") && <Badge tone={priorityTone(r.priority)}>{requestPriority(r.priority)}</Badge>}
                </div>
              </div>
            ))}
            <Pager page={q.data.page} pageSize={q.data.page_size} total={q.data.total} onPage={setPage} />
          </div>
        )}
      </div>
    </>
  );
}

/** Şeffaflık: sitenin gerçekleşen giderleri ve fatura görüntüsü. */
export function ResidentExpensesPage() {
  useDocumentTitle("Giderler");
  const { site } = useSite();
  const toast = useToast();
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [page, setPage] = useState(1);
  const q = useSiteGet<SiteExpenses>("/resident/expenses", { year, page, page_size: 30 });
  if (q.isError) return <StaffNotice error={q.error} />;
  return (
    <>
      <div className="row row--between">
        <div className="section-title" style={{ margin: 0 }}>Sitenin giderleri</div>
        <select aria-label="Yıl" className="field__input" style={{ width: "auto" }} value={year} onChange={(e) => { setYear(e.target.value); setPage(1); }}>
          {[0, 1, 2].map((i) => String(new Date().getFullYear() - i)).map((y) => <option key={y}>{y}</option>)}
        </select>
      </div>
      {q.isPending ? <Loading /> : (
        <>
          <div className="balance">
            <div className="balance__label">{year} yılı toplam gider</div>
            <div className="balance__value">{formatMoney(q.data.total_amount)}</div>
            <div className="balance__due">{q.data.total} kayıt · aidatlarınızın nereye harcandığı</div>
          </div>
          <div className="stack" style={{ gap: "var(--s-2)" }}>
            {q.data.items.length === 0 && <Empty title="Bu yıl gider kaydı yok" icon={<Package aria-hidden="true" />} />}
            {q.data.items.map((e) => (
              <div key={e.id} className="r-item">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="r-item__title">{e.description}</div>
                  <div className="r-item__meta">{formatDate(e.date)} · {e.category}{e.vendor ? ` · ${e.vendor}` : ""}</div>
                  {e.document_id && (
                    <button className="btn btn--ghost btn--sm" type="button" style={{ paddingLeft: 0 }} onClick={() => openDocument(`/sites/${site.slug}/resident/files/${e.document_id}`).catch(() => toast("Belge açılamadı.", "danger"))}>
                      <FileText aria-hidden="true" /> Faturayı gör
                    </button>
                  )}
                </div>
                <Money value={e.amount} />
              </div>
            ))}
            <Pager page={q.data.page} pageSize={q.data.page_size} total={q.data.total} onPage={setPage} />
          </div>
        </>
      )}
    </>
  );
}
