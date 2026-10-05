import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { Printer } from "lucide-react";
import { api } from "../../api/client";
import { useSiteGet } from "../../api/hooks";
import type { AccountStatement, Page, Schemas } from "../../api/types";
import { Alert, ErrorState, Loading, useDocumentTitle } from "../../components/ui";
import { formatDate, formatDecimal, formatMoney, todayIso } from "../../lib/format";
import { accountKind } from "../../lib/labels";
import { useSite } from "../../site/SiteContext";

type Unit = Schemas["UnitListItem"];

function daysBetween(fromIso: string, toIso: string) {
  return Math.max(0, Math.round((new Date(toIso + "T00:00:00").getTime() - new Date(fromIso + "T00:00:00").getTime()) / 864e5));
}

/**
 * İhtar yazısı (Apsiyon "İhtar Yazısı"): borçlu hesap için yazdırılabilir ödeme ihtarı.
 * Yeni servis gerekmez — tutar ve en eski vade hesabın ekstresinden (backend hesaplar) gelir.
 * Yazı kaydedilmez; gönderim kaydı istenirse ayrı servis isteği olur.
 */
export function DunningLetterPage() {
  useDocumentTitle("İhtar yazısı");
  const { accountId = "" } = useParams();
  const { site } = useSite();
  const q = useSiteGet<AccountStatement>(`/accounts/${accountId}/statement`, { page_size: 1 });
  const [date, setDate] = useState(todayIso());
  const [days, setDays] = useState("7");

  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const a = q.data.account;
  const hasDebt = Number(a.balance) > 0.005;
  const overdue = a.oldest_open_due_date ? daysBetween(a.oldest_open_due_date, date) : 0;
  const place = [site.district, site.city].filter(Boolean).join(" / ");

  return (
    <div className="stack page--narrow">
      <div className="row row--between print-hide" style={{ gap: "var(--s-2)" }}>
        <Link className="btn" to={`/s/${site.slug}/cari/${a.id}`}>Geri</Link>
        <div className="row" style={{ gap: "var(--s-2)", alignItems: "flex-end" }}>
          <div className="field" style={{ minWidth: "9rem" }}>
            <label className="field__label" htmlFor="ih-date">Yazı tarihi</label>
            <input id="ih-date" className="field__input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field" style={{ minWidth: "7rem" }}>
            <label className="field__label" htmlFor="ih-days">Ödeme süresi (gün)</label>
            <input id="ih-days" className="field__input" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, "").slice(0, 2))} />
          </div>
          <button className="btn btn--primary" type="button" disabled={!hasDebt} onClick={() => window.print()}><Printer aria-hidden="true" /> Yazdır / PDF</button>
        </div>
      </div>

      {!hasDebt && <Alert tone="info" title="Bu hesabın borcu yok">İhtar yazısı yalnız borçlu hesap için düzenlenir.</Alert>}

      <article className="card doc-print" aria-label="İhtar yazısı">
        <div className="card__body stack" style={{ gap: "var(--s-5)", lineHeight: 1.75 }}>
          <header className="row row--between" style={{ alignItems: "flex-start" }}>
            <div>
              <div className="strong">{site.name} Yönetimi</div>
              {place && <div className="small muted">{place}</div>}
            </div>
            <div className="small right">{formatDate(date)}</div>
          </header>

          <div>
            <div className="small muted">Sayın</div>
            <div className="strong">{a.person_name ?? "—"}</div>
            <div className="small">{site.name} · {a.unit_name} numaralı bağımsız bölüm ({accountKind(a.kind).toLocaleLowerCase("tr-TR")}) · <span className="mono">{a.reference_code}</span></div>
          </div>

          <h1 style={{ textAlign: "center", margin: 0, fontSize: "1.25rem" }}>Konu: Ödenmemiş aidat ve gider payı borcu hk.</h1>

          <p className="mb-0">
            Site yönetimimizin kayıtlarına göre, {formatDate(date)} tarihi itibarıyla yukarıda belirtilen bağımsız bölüme ait{" "}
            <strong>{formatMoney(a.balance)}</strong> tutarında ödenmemiş aidat ve ortak gider payı borcunuz bulunmaktadır.
            {a.oldest_open_due_date && <> Ödenmemiş borcun en eski vadesi <strong>{formatDate(a.oldest_open_due_date)}</strong> olup bu tarihten itibaren {overdue} gün geçmiştir.</>}
          </p>
          <p className="mb-0">
            634 sayılı Kat Mülkiyeti Kanunu'nun 20. maddesi uyarınca kat malikleri ve bağımsız bölümde oturanlar, ortak giderlere
            katılmakla yükümlüdür; borcunu zamanında ödemeyen için gecikme tazminatı istenebilir. Borcunuzun bu yazının size ulaştığı
            tarihten itibaren <strong>{days || "7"} gün</strong> içinde site yönetiminin banka hesabına ödenmesini rica eder; ödeme
            yapılmaması hâlinde yasal yollara başvurulabileceğini bilgilerinize sunarız.
          </p>
          <p className="mb-0">Ödemenizi yaparken açıklama alanına <strong className="mono">{a.reference_code}</strong> referans kodunu yazmanız, ödemenin hesabınıza doğru işlenmesini sağlar. Bu yazıdan önce ödeme yaptıysanız yazıyı dikkate almayınız.</p>

          <footer className="row row--between" style={{ marginTop: "var(--s-8)" }}>
            <span className="small muted">Borç dökümü için: yönetim ofisi ya da sakin uygulaması → Borcum</span>
            <span className="small" style={{ borderTop: "1px solid var(--line-strong)", paddingTop: "var(--s-2)", minWidth: "12rem", textAlign: "center" }}>
              {site.name} Yönetimi<br />İmza / Kaşe
            </span>
          </footer>
        </div>
      </article>
    </div>
  );
}

/**
 * Hazirun listesi (genel kurul katılım cetveli): bağımsız bölüm, arsa payı, malik, vekil, imza.
 * Yeni servis gerekmez — bölüm listesi sayfa sayfa okunur. Toplantı bilgisi yalnız çıktı içindir, kaydedilmez.
 */
export function AttendanceListPage() {
  useDocumentTitle("Hazirun listesi");
  const { site } = useSite();
  const [units, setUnits] = useState<Unit[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [meta, setMeta] = useState({ kind: "Olağan", date: todayIso(), time: "14:00", place: "" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const all: Unit[] = [];
        for (let p = 1; ; p++) {
          const r = await api<Page<Unit>>("GET", `/sites/${site.slug}/units`, { query: { is_active: true, page: p, page_size: 200 } });
          all.push(...r.items);
          if (all.length >= r.total || r.items.length === 0) break;
        }
        if (!cancelled) setUnits(all);
      } catch (e) {
        if (!cancelled) setError(e);
      }
    })();
    return () => { cancelled = true; };
  }, [site.slug]);

  if (error) return <ErrorState error={error} />;
  if (!units) return <Loading label="Bölümler okunuyor…" />;
  const denom = units.find((u) => u.land_share_denominator)?.land_share_denominator ?? null;
  const shareSum = units.reduce((s, u) => s + (u.land_share_numerator ?? 0), 0);

  return (
    <div className="stack">
      <div className="row row--between print-hide" style={{ gap: "var(--s-2)", alignItems: "flex-end" }}>
        <Link className="btn" to={`/s/${site.slug}/daireler`}>Geri</Link>
        <div className="filters">
          <div className="field"><label className="field__label" htmlFor="hz-kind">Toplantı</label>
            <select id="hz-kind" className="field__input" value={meta.kind} onChange={(e) => setMeta((m) => ({ ...m, kind: e.target.value }))}><option>Olağan</option><option>Olağanüstü</option></select></div>
          <div className="field"><label className="field__label" htmlFor="hz-date">Tarih</label><input id="hz-date" className="field__input" type="date" value={meta.date} onChange={(e) => setMeta((m) => ({ ...m, date: e.target.value }))} /></div>
          <div className="field"><label className="field__label" htmlFor="hz-time">Saat</label><input id="hz-time" className="field__input" type="time" value={meta.time} onChange={(e) => setMeta((m) => ({ ...m, time: e.target.value }))} /></div>
          <div className="field"><label className="field__label" htmlFor="hz-place">Yer</label><input id="hz-place" className="field__input" value={meta.place} onChange={(e) => setMeta((m) => ({ ...m, place: e.target.value }))} placeholder="ör. Sosyal tesis" /></div>
        </div>
        <button className="btn btn--primary" type="button" onClick={() => window.print()}><Printer aria-hidden="true" /> Yazdır / PDF</button>
      </div>

      <article className="card doc-print" aria-label="Hazirun listesi">
        <div className="card__body stack" style={{ gap: "var(--s-4)" }}>
          <header style={{ textAlign: "center" }}>
            <div className="strong">{site.name}</div>
            <h1 style={{ margin: "var(--s-1) 0", fontSize: "1.25rem" }}>{meta.kind} Kat Malikleri Kurulu Toplantısı Hazirun Listesi</h1>
            <div className="small">{formatDate(meta.date)} · {meta.time}{meta.place ? ` · ${meta.place}` : ""}</div>
          </header>
          <div className="table-wrap">
            <table className="data">
              <caption className="visually-hidden">Bağımsız bölümlere göre katılım cetveli</caption>
              <thead>
                <tr>
                  <th scope="col" className="right">Sıra</th><th scope="col">Bağımsız bölüm</th><th scope="col" className="right">Arsa payı</th>
                  <th scope="col">Kat maliki</th><th scope="col">Vekil (varsa)</th><th scope="col" style={{ minWidth: "8rem" }}>İmza</th>
                </tr>
              </thead>
              <tbody>
                {units.map((u, i) => (
                  <tr key={u.id}>
                    <td className="right num">{i + 1}</td>
                    <td className="cell-main">{u.display_name}</td>
                    <td className="right num small">{u.land_share_numerator && u.land_share_denominator ? `${u.land_share_numerator}/${u.land_share_denominator}` : "—"}</td>
                    <td className="small">{u.owner_names.join(", ") || "—"}</td>
                    <td />
                    <td />
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr><td colSpan={2}>{units.length} bağımsız bölüm</td><td className="right num">{denom ? `${shareSum}/${denom}` : formatDecimal(shareSum)}</td><td colSpan={3} /></tr>
              </tfoot>
            </table>
          </div>
          <p className="small muted mb-0">KMK m.30: Kurul, kat maliklerinin sayı ve arsa payı çoğunluğuyla toplanır. Vekâletle katılanların vekâletnamesi listeye eklenir.</p>
          <footer className="row row--between" style={{ marginTop: "var(--s-6)" }}>
            <span className="small">Toplantı başkanı<br /><br />İmza</span>
            <span className="small">Yazman<br /><br />İmza</span>
            <span className="small">Oy toplayıcı<br /><br />İmza</span>
          </footer>
        </div>
      </article>
    </div>
  );
}
