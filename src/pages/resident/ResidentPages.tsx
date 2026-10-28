import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import Decimal from "decimal.js";
import { CalendarCheck, Car, Hammer, KeyRound, ShieldCheck, Siren, UserRoundCheck, ChevronRight, Copy, FileText, Inbox, Megaphone, Receipt, Users, Wrench } from "lucide-react";
import { ApiError } from "../../api/client";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { AccountStatement, Page, Schemas } from "../../api/types";
import { PollResults, pollPrivacy } from "../../components/PollResults";
import { useToast } from "../../components/toast";
import { Alert, Badge, Empty, ErrorState, Field, FormError, IconChip, Loading, Money, Pager, Segmented, SubmitButton, fieldError, todayLong, useDocumentTitle } from "../../components/ui";
import { heroUrl } from "../../lib/cover";
import { formatDate, formatDateTime, formatIban, formatMoney } from "../../lib/format";
import { categoryIcon } from "../../lib/icons";
import { installmentStatus, installmentTone, planStatus, planStatusTone } from "../../lib/labels";
import { accountKind, importance, importanceTone, ledgerSource, priorityTone, requestCategory, requestPriority, requestStatus, requestStatusTone } from "../../lib/labels";
import { M, useSite } from "../../site/SiteContext";
import { NotificationsPage } from "../NotificationsPage";
import { ProfilePage } from "../ProfilePage";
import { AckButton, ResidentAlerts } from "./ResidentCommPages";

type Home = Schemas["HomeOut"];
type Ann = Schemas["AnnouncementOut"];
type Req = Schemas["RequestOut"];
type MyPackage = Schemas["MyPackage"];

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
  const { site, shows } = useSite();
  const toast = useToast();
  const q = useSiteGet<Home>("/resident/home");
  const pk = useSiteGet<MyPackage[]>("/resident/packages", undefined, { enabled: q.isSuccess });
  if (q.isPending) return <Loading />;
  if (q.isError) return <StaffNotice error={q.error} />;
  const h = q.data;
  const balance = new Decimal(h.total_balance);
  const nextDue = h.accounts.map((a) => a.oldest_open_due_date).filter(Boolean).sort()[0];
  const base = `/sakin/${site.slug}`;
  // Bant alt satırı: sakinin bölümleri (gerçek veri; selamlama ya da uydurma metin yok)
  const unitNames = [...new Set(h.accounts.map((a) => a.unit_name))].join(" · ");

  return (
    <>
      {/* Site fotoğraflı açık bant: yazı koyu, fotoğraf alta doğru zemine erir */}
      <section className="r-hero" aria-label={site.name}>
        <img className="r-hero__photo" src={heroUrl(site.id)} alt="" decoding="async" fetchPriority="high" />
        <div className="r-hero__veil" aria-hidden="true" />
        <div className="r-hero__eyebrow">{todayLong()}</div>
        <div className="r-hero__title">{site.name}</div>
        {unitNames && <div className="r-hero__sub">{unitNames}</div>}
      </section>
      <ResidentAlerts />
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
        </div>
      </div>

      {/* Ödeme bilgileri (servis isteği 05): sitenin kendi hesabı — platform parayı tutmaz */}
      <div className="card">
        <div className="card__body">
          <div className="section-title">Ödeme bilgileri</div>
          {h.payment_info ? (
            <>
              {h.payment_info.account_holder && (
                <div className="kv"><span className="kv__k">Alıcı</span><span className="kv__v">{h.payment_info.account_holder}</span></div>
              )}
              {h.payment_info.bank_name && (
                <div className="kv"><span className="kv__k">Banka</span><span className="kv__v">{h.payment_info.bank_name}</span></div>
              )}
              <div className="kv">
                <span className="kv__k">IBAN</span>
                <span className="kv__v">
                  <span className="mono xs">{formatIban(h.payment_info.iban)}</span>{" "}
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => navigator.clipboard?.writeText(h.payment_info!.iban.replace(/\s/g, "")).then(() => toast("IBAN kopyalandı."))}
                  >
                    <Copy aria-hidden="true" /> Kopyala
                  </button>
                </span>
              </div>
              <div className="kv">
                <span className="kv__k">Açıklamaya yazın</span>
                <span className="kv__v mono strong">{h.accounts.map((a) => a.reference_code).join(", ")}</span>
              </div>
              <div className="calc">Havale açıklamasına referans kodunu yazmanız ödemenizin doğru hesaba işlenmesini kolaylaştırır.</div>
            </>
          ) : (
            <p className="small muted mb-0">Ödeme bilgisi için site yönetimiyle görüşün.</p>
          )}
        </div>
      </div>

      {/* Hane üyeleri ve araçlar (YAP-04/05): sakin kendisi yönetir — daire ikonlu kutular */}
      <div>
        <div className="section-title">Hanem</div>
        <nav className="quick" aria-label="Hanem">
          <Link className="quick__tile" to={`${base}/hane`}><span className="quick__icon" aria-hidden="true"><Users /></span><span className="quick__label">Hane üyeleri</span></Link>
          <Link className="quick__tile" to={`${base}/araclar`}><span className="quick__icon" aria-hidden="true"><Car /></span><span className="quick__label">Araçlarım</span></Link>
          <Link className="quick__tile" to={`${base}/ziyaretci`}><span className="quick__icon" aria-hidden="true"><UserRoundCheck /></span><span className="quick__label">Ziyaretçiler</span></Link>
          <Link className="quick__tile" to={`${base}/tadilat`}><span className="quick__icon" aria-hidden="true"><Hammer /></span><span className="quick__label">Tadilat ve taşınma</span></Link>
          <Link className="quick__tile" to={`${base}/emanet`}><span className="quick__icon" aria-hidden="true"><KeyRound /></span><span className="quick__label">Emanet ve sayaçlar</span></Link>
          <Link className="quick__tile" to={`${base}/rezervasyon`}><span className="quick__icon" aria-hidden="true"><CalendarCheck /></span><span className="quick__label">Rezervasyon</span></Link>
          <Link className="quick__tile" to={`${base}/acil-durum`}><span className="quick__icon" aria-hidden="true"><Siren /></span><span className="quick__label">Acil durum bilgileri</span></Link>
          {shows(M.documents) && <Link className="quick__tile" to={`${base}/belgeler`}><span className="quick__icon" aria-hidden="true"><FileText /></span><span className="quick__label">Belgeler</span></Link>}
          <Link className="quick__tile" to={`${base}/kvkk`}><span className="quick__icon" aria-hidden="true"><ShieldCheck /></span><span className="quick__label">Kişisel verilerim</span></Link>
        </nav>
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
          <div className="r-section__head">
            <div className="section-title">Duyurular</div>
            <Link className="card__more" to={`${base}/duyurular`}>Tümü <ChevronRight aria-hidden="true" size={14} /></Link>
          </div>
          <div className="stack" style={{ gap: "var(--s-3)" }}>
            {h.announcements.length === 0 && <p className="small muted">Duyuru yok.</p>}
            {h.announcements.map((a) => <AnnouncementItem key={a.id} a={a} short />)}
          </div>
        </div>
      )}

      {h.open_requests && <div>
        <div className="section-title">Taleplerim</div>
        {h.open_requests.length > 0 ? (
          <Link className="attn__card attn__card--info" to={`${base}/taleplerim`}>
            <span className="attn__icon" aria-hidden="true"><Wrench /></span>
            <span className="attn__main">
              <span className="attn__title">{h.open_requests.length} açık talebiniz var</span>
              <span className="attn__body">Durumunu Taleplerim sekmesinden izleyebilirsiniz.</span>
              <span className="attn__link">Taleplerime git <ChevronRight aria-hidden="true" /></span>
            </span>
          </Link>
        ) : (
          <div className="attn__card attn__card--ok" role="status">
            <span className="attn__icon" aria-hidden="true"><Wrench /></span>
            <span className="attn__main">
              <span className="attn__title">Açık talebiniz yok</span>
              <span className="attn__body">Arıza ya da isteğinizi buradan iletebilirsiniz.</span>
            </span>
          </div>
        )}
        <Link className="btn btn--primary mt-4" style={{ width: "100%" }} to={`${base}/taleplerim`}><Wrench aria-hidden="true" /> Talep oluştur</Link>
      </div>}
    </>
  );
}

function AnnouncementItem({ a, short }: { a: Ann; short?: boolean }) {
  const body = short && a.body.length > 110 ? a.body.slice(0, 110) + "…" : a.body;
  const tone = a.importance === "normal" ? undefined : importanceTone(a.importance);
  return (
    <article className="ann">
      <IconChip tone={tone === "danger" || tone === "warn" ? tone : undefined}><Megaphone /></IconChip>
      <div className="ann__main">
        <div className="ann__title">{a.title}</div>
        <div className="ann__meta">
          <span>{formatDateTime(a.published_at)}</span>
          {a.importance !== "normal" && <Badge tone={importanceTone(a.importance)}>{importance(a.importance)}</Badge>}
          {a.is_pinned && <Badge tone="muted">Sabit</Badge>}
        </div>
        <div className="ann__body">{body}</div>
        {!short && a.requires_ack && <div className="mt-2"><AckButton id={a.id} ackedAt={a.acked_at} /></div>}
      </div>
    </article>
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
        <Segmented
          label="Hesap"
          value={accountId}
          onChange={(v) => { setAccount(v); setPage(1); }}
          options={accounts.map((a) => ({ value: a.id, label: `${a.unit_name} · ${accountKind(a.kind)}` }))}
        />
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
            <div className="card">
              <div className="card__body card__body--flush">
                {q.data.entries.items.length === 0 ? (
                  <p className="small muted" style={{ padding: "var(--s-5)", margin: 0 }}>Bu hesapta hareket yok.</p>
                ) : (
                  <ul className="txn">
                    {q.data.entries.items.map((e) => {
                      const debit = Number(e.debit) !== 0;
                      return (
                        <li key={e.id}>
                          <span className={`txn__icon ${debit ? "txn__icon--warn" : "txn__icon--ok"}`} aria-hidden="true">
                            {debit ? <Receipt /> : <Inbox />}
                          </span>
                          <div className="txn__main">
                            <div className="txn__title">{e.description}</div>
                            <div className="txn__sub">{formatDate(e.date)} · {e.source === "late_fee" ? <Badge tone="warn">Gecikme tazminatı</Badge> : ledgerSource(e.source)}{e.due_date ? ` · son ödeme ${formatDate(e.due_date)}` : ""}</div>
                            {Number(e.advance_applied) > 0 && <div className="xs muted">Avanstan mahsup: {formatMoney(e.advance_applied)} (önceki fazla ödemenizden düşüldü)</div>}
                          </div>
                          <div className="txn__right">
                            <span className="txn__amount">{debit ? <Money value={e.debit} className="amount-pos" /> : <Money value={`-${e.credit}`} className="amount-neg" />}</span>
                            <span className="xs muted">bakiye <Money value={e.running_balance} /></span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <Pager page={q.data.entries.page} pageSize={q.data.entries.page_size} total={q.data.entries.total} onPage={setPage} />
            </div>
          </div>
        </>
      )}
      <ResidentPlans />
    </>
  );
}

/** Ödeme planım (FIN-15): sakin yalnız kendi hesabının planını ve taksitlerini görür (servis isteği 30). */
function ResidentPlans() {
  const q = useSiteGet<Schemas["ResidentPaymentPlanOut"][]>("/resident/payment-plans");
  if (!q.data || q.data.length === 0) return null;
  return (
    <div>
      <div className="section-title">Ödeme planım</div>
      <div className="stack" style={{ gap: "var(--s-2)" }}>
        {q.data.map((p) => (
          <div key={p.id} className="card"><div className="card__body stack" style={{ gap: "var(--s-2)" }}>
            <div className="row row--between"><span className="strong">{p.unit_name} · {p.installment_count} taksit</span><Badge tone={planStatusTone(p.status)}>{planStatus(p.status)}</Badge></div>
            <div className="small muted">Toplam {formatMoney(p.total)}{p.status === "broken" && " · geciken taksit var, lütfen site yönetimiyle görüşün"}</div>
            {p.installments.map((i) => (
              <div key={i.no} className="kv">
                <span className="kv__k">{i.no}. taksit · {formatDate(i.due_date)}</span>
                <span className="kv__v"><Money value={i.amount} /> <Badge tone={installmentTone(i.status)}>{installmentStatus(i.status)}</Badge></span>
              </div>
            ))}
          </div></div>
        ))}
      </div>
    </div>
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
      <ResidentPolls />
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
  const categories = useRequestCategories(true);
  const home = useSiteGet<Home>("/resident/home");
  const units = home.data?.units ?? [];
  // Yer: bölüm içi (bölüm seçilir) ya da ortak alan (konum yazılır) — HIZ-01
  const [f, setF] = useState({ title: "", description: "", category: "other", place: "unit", unit_id: "", location: "" });
  const m = useSiteMutation<Record<string, unknown>, Schemas["RequestDetail"]>("POST", "/resident/requests", { onSuccess: () => setF((x) => ({ ...x, title: "", description: "", location: "" })) });

  function submit(e: FormEvent) {
    e.preventDefault();
    const unitId = f.place === "unit" ? f.unit_id || units[0]?.unit_id || null : null;
    m.mutate({ title: f.title.trim(), description: f.description.trim() || null, category: f.category, unit_id: unitId, location: f.location.trim() || null });
  }

  if (q.isError) return <StaffNotice error={q.error} />;
  return (
    <>
      <form className="card" onSubmit={submit} noValidate>
        <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
          <div className="section-title" style={{ margin: 0 }}>Yeni talep</div>
          <FormError error={m.error} />
          <Field label="Konu" required error={fieldError(m.error, "title")}>{(p) => <input {...p} className="field__input" value={f.title} onChange={(e) => setF((x) => ({ ...x, title: e.target.value }))} placeholder="ör. Banyoda su sızıntısı" />}</Field>
          <Field label="Kategori" hint="Öncelik ve hedef süre kategoriye göre belirlenir" error={fieldError(m.error, "category")}>{(p) => <select {...p} className="field__input" value={f.category} onChange={(e) => setF((x) => ({ ...x, category: e.target.value }))}>{categories.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}</select>}</Field>
          <Field label="Yer" error={fieldError(m.error, "unit_id")}>{(p) => <select {...p} className="field__input" value={f.place === "unit" ? f.unit_id || units[0]?.unit_id || "unit" : "common"} onChange={(e) => setF((x) => (e.target.value === "common" ? { ...x, place: "common" } : { ...x, place: "unit", unit_id: e.target.value }))}>{units.map((u) => <option key={u.unit_id} value={u.unit_id}>Bölümüm ({u.unit_name})</option>)}<option value="common">Ortak alan</option></select>}</Field>
          <Field label={f.place === "common" ? "Konum" : "Bölüm içinde nerede?"} hint={f.place === "common" ? "ör. B blok asansör, otopark girişi" : "İsteğe bağlı; ör. mutfak, banyo"} error={fieldError(m.error, "location")}>{(p) => <input {...p} className="field__input" maxLength={120} value={f.location} onChange={(e) => setF((x) => ({ ...x, location: e.target.value }))} />}</Field>
          <Field label="Açıklama">{(p) => <textarea {...p} className="field__input" rows={3} value={f.description} onChange={(e) => setF((x) => ({ ...x, description: e.target.value }))} />}</Field>
          <SubmitButton busy={m.isPending} disabled={!f.title.trim()}>Talebi gönder</SubmitButton>
        </div>
      </form>

      <div>
        <div className="section-title">Taleplerim</div>
        {q.isPending ? <Loading /> : q.data.items.length === 0 ? <p className="small muted">Henüz talebiniz yok.</p> : (
          <div className="stack" style={{ gap: "var(--s-2)" }}>
            {q.data.items.map((r) => {
              const Icon = categoryIcon(r.category);
              const done = r.status === "resolved" || r.status === "closed";
              return (
                <article key={r.id} className="ann">
                  <IconChip tone={done ? "ok" : r.priority === "urgent" ? "danger" : r.priority === "high" ? "warn" : undefined}><Icon /></IconChip>
                  <div className="ann__main">
                    <div className="ann__title">#{r.number} {r.title}</div>
                    <div className="ann__meta"><span>{r.category_name || requestCategory(r.category)}</span><span>·</span><span>{formatDateTime(r.created_at)}</span></div>
                    {r.resolution && <div className="ann__body">Çözüm: {r.resolution}</div>}
                    <RequestExtrasBlock r={r} />
                  </div>
                  <div className="ann__side">
                    <Badge tone={requestStatusTone(r.status)}>{r.status_label || requestStatus(r.status)}</Badge>
                    {(r.priority === "high" || r.priority === "urgent") && <Badge tone={priorityTone(r.priority)}>{requestPriority(r.priority)}</Badge>}
                  </div>
                </article>
              );
            })}
            <Pager page={q.data.page} pageSize={q.data.page_size} total={q.data.total} onPage={setPage} />
          </div>
        )}
      </div>
    </>
  );
}

/** Servis isteği 15 + ILT-03 (K31): bölüm ya da kişi başına yanıt; sonuç yanıt verdikten ya da anket kapanınca görünür. */
type ResidentPoll = Schemas["ResidentPollOut"];
type Answer = { option_ids: string[]; rating: number | null; text: string };

function ResidentPolls() {
  // Anket modülü kapalı sitede uç 404 döner; hiç sorulmaz
  const q = useSiteGet<ResidentPoll[]>("/resident/polls", undefined, { enabled: useSite().shows(M.surveys) });
  if (!q.data || q.data.length === 0) return null;
  return (
    <section className="stack" style={{ gap: "var(--s-3)" }} aria-label="Anketler">
      {q.data.map((p) => <ResidentPollCard key={p.id} p={p} />)}
    </section>
  );
}

function ResidentPollCard({ p }: { p: ResidentPoll }) {
  const pending = p.status === "open" && p.one_per_unit ? p.my_votes.filter((v) => !v.voted) : [];
  const [unitId, setUnitId] = useState(pending[0]?.unit_id ?? "");
  const empty = (): Record<string, Answer> => Object.fromEntries(p.questions.map((x) => [x.id, { option_ids: [], rating: null, text: "" }]));
  const [answers, setAnswers] = useState(empty);
  const vote = useSiteMutation<Record<string, unknown>, { option_id: string | null }>("POST", `/resident/polls/${p.id}/vote`, { onSuccess: () => setAnswers(empty()) });
  const voted = p.my_votes.find((v) => v.option_id)?.option_id ?? null;
  const unit = pending.find((v) => v.unit_id === unitId) ?? pending[0];
  const set = (qid: string, patch: Partial<Answer>) => setAnswers((a) => ({ ...a, [qid]: { ...a[qid]!, ...patch } }));
  const filled = p.questions.every((x) => !x.required || (x.kind === "rating" ? answers[x.id]?.rating : x.kind === "text" ? answers[x.id]?.text.trim() : answers[x.id]?.option_ids.length));
  function submit(e: FormEvent) {
    e.preventDefault();
    vote.mutate({
      unit_id: p.one_per_unit ? unit?.unit_id ?? null : null,
      answers: p.questions.map((x) => ({ question_id: x.id, option_ids: answers[x.id]!.option_ids, rating: answers[x.id]!.rating, text: answers[x.id]!.text.trim() || null })),
    });
  }
  return (
    <div className="card">
      <div className="card__head">
        <span className="card__title">{p.question}</span>
        <span className="ml-auto">{p.status === "open" ? <Badge tone="info">Anket</Badge> : <Badge>Sonuçlandı</Badge>}</span>
      </div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        {p.description && <p className="small mb-0">{p.description}</p>}
        <p className="xs muted mb-0">{pollPrivacy(p)}. {p.notice}</p>
        {p.can_respond ? (
          <form className="stack" style={{ gap: "var(--s-3)" }} onSubmit={submit} noValidate>
            {p.one_per_unit && pending.length > 1 && unit && (
              <Field label="Hangi bölüm adına">{(fp) => <select {...fp} className="field__input" value={unit.unit_id} onChange={(e) => setUnitId(e.target.value)}>{pending.map((v) => <option key={v.unit_id} value={v.unit_id}>{v.unit_name}</option>)}</select>}</Field>
            )}
            {p.questions.map((x) => {
              const a = answers[x.id]!;
              const err = fieldError(vote.error, `answers.${x.id}`);
              return (
                <fieldset key={x.id} className="stack" style={{ gap: "var(--s-1)", border: 0, padding: 0, margin: 0 }}>
                  <legend className={p.questions.length > 1 ? "field__label" : "visually-hidden"}>{p.questions.length > 1 ? `${x.order}. ${x.text}` : p.question}{x.required ? "" : " (isteğe bağlı)"}</legend>
                  {x.kind === "single" && x.options.map((o) => (
                    <label key={o.id} className="check" style={{ minHeight: 44 }}><input type="radio" name={`poll-${p.id}-${x.id}`} checked={a.option_ids[0] === o.id} onChange={() => set(x.id, { option_ids: [o.id] })} /><span>{o.label}</span></label>
                  ))}
                  {x.kind === "multiple" && x.options.map((o) => (
                    <label key={o.id} className="check" style={{ minHeight: 44 }}><input type="checkbox" checked={a.option_ids.includes(o.id)} onChange={() => set(x.id, { option_ids: a.option_ids.includes(o.id) ? a.option_ids.filter((y) => y !== o.id) : [...a.option_ids, o.id] })} /><span>{o.label}</span></label>
                  ))}
                  {x.kind === "rating" && (
                    <div className="row" style={{ gap: "var(--s-1)" }} role="radiogroup" aria-label={x.text}>
                      {[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" role="radio" aria-checked={a.rating === n} className={`btn btn--sm${a.rating === n ? " btn--primary" : ""}`} style={{ minWidth: 44, minHeight: 44 }} onClick={() => set(x.id, { rating: n })}>{n}</button>)}
                    </div>
                  )}
                  {x.kind === "text" && <textarea className="field__input" aria-label={x.text} rows={2} maxLength={1000} value={a.text} onChange={(e) => set(x.id, { text: e.target.value })} />}
                  {err && <span className="field__error" role="alert">{err}</span>}
                </fieldset>
              );
            })}
            <FormError error={vote.error} />
            <SubmitButton busy={vote.isPending} disabled={!filled}>{p.one_per_unit && pending.length > 1 && unit ? `${unit.unit_name} adına gönder` : "Gönder"}</SubmitButton>
            <span className="small muted">Bitiş {formatDate(p.ends_on)} · Yanıtınızı gönderdikten sonra değiştiremezsiniz.</span>
          </form>
        ) : p.total_votes != null ? (
          <PollResults p={p} mine={voted} />
        ) : (
          <span className="small muted">{p.responded ? "Yanıtınız alındı; sonuç anket kapanınca açılır." : "Bu anket bölümünüzdeki rolünüze açık değil."}</span>
        )}
      </div>
    </div>
  );
}

/** Sakinin bildirimleri ve profili: personel ekranıyla aynı bileşen, kayda bağlantı yok. */
export const ResidentNotificationsPage = () => <NotificationsPage staff={false} />;
export const ResidentProfilePage = () => <ProfilePage />;
export { ResidentHouseholdPage, ResidentVehiclesPage } from "./ResidentHouseholdPages";
export { ResidentVisitorsPage } from "./ResidentVisitorsPage";
export { ResidentKeysMetersPage, ResidentPermitsPage } from "./ResidentServicePages";
export { ResidentReservationPage } from "./ResidentReservationPage";
export { ResidentEmergencyPage } from "./ResidentCommPages";
export { ResidentTransparencyPage } from "./ResidentTransparencyPage";
export { ResidentDocumentsPage, ResidentPrivacyPage } from "./ResidentRecordsPages";
import { RequestExtrasBlock } from "./ResidentServicePages";
import { useRequestCategories } from "../site/requestCategories";
