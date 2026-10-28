import { useEffect, useState } from "react";
import { Link } from "react-router";
import QRCode from "qrcode";
import { Inbox, Layers, Link2, Printer, QrCode } from "lucide-react";
import { useSiteGet } from "../../api/hooks";
import type { Page, Schemas } from "../../api/types";
import { UnitPicker, type PickedUnit } from "../../components/UnitPicker";
import { Alert, Field, Kpi, Loading, PageHead } from "../../components/ui";
import { useUrlState } from "../../lib/hooks";
import { useSite } from "../../site/SiteContext";

type Block = Schemas["BlockOut"];
type Unit = Schemas["UnitListItem"];
type RegLink = Schemas["LinkOut"];
interface Poster { key: string; title: string; scope: string | null; url: string }

/**
 * QR kayıt afişi (YAP-07): tesis / blok / bölüm kapsamında yazdırılır. Blok ya da bölüm afişinden gelen
 * başvuruda form o blok/bölümle önseçili açılır. Bağlantı yönetimdeki kayıt bağlantısıdır; yenilenirse afişler eskir.
 */
export function QrPosterPage() {
  const { site } = useSite();
  const [s, set] = useUrlState({ kapsam: "tesis", boyut: "a4", blok: "" });
  const [unit, setUnit] = useState<PickedUnit | null>(null);
  const link = useSiteGet<RegLink>("/registration-link");
  const blocks = useSiteGet<Page<Block>>("/blocks", { page_size: 200 });
  const labels = s.kapsam === "blok" && s.boyut === "etiket" && !!s.blok;
  const units = useSiteGet<Page<Unit>>("/units", { block_id: s.blok, is_active: true, page_size: 200 }, { enabled: labels });
  const base = link.data ? `${window.location.origin}/kayit/${link.data.code}` : "";
  const blockName = blocks.data?.items.find((b) => b.id === s.blok)?.name;
  const pending = useSiteGet<Page<unknown>>("/registrations", { status: "pending", page_size: 1 });

  const posters: Poster[] = !base ? [] : s.kapsam === "tesis" ? [{ key: "site", title: site.name, scope: null, url: base }]
    : s.kapsam === "blok" ? (!s.blok ? [] : labels ? (units.data?.items ?? []).map((u) => ({ key: u.id, title: site.name, scope: u.display_name, url: `${base}?bolum=${u.id}` })) : [{ key: s.blok, title: site.name, scope: `${blockName} Blok`, url: `${base}?blok=${s.blok}` }])
    : unit ? [{ key: unit.id, title: site.name, scope: unit.name, url: `${base}?bolum=${unit.id}` }] : [];

  const [imgs, setImgs] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    Promise.all(posters.filter((p) => !imgs[p.url]).map((p) => QRCode.toDataURL(p.url, { width: 640, margin: 1, errorCorrectionLevel: "M" }).then((d) => [p.url, d] as const)))
      .then((pairs) => { if (alive && pairs.length) setImgs((m) => ({ ...m, ...Object.fromEntries(pairs) })); });
    return () => { alive = false; };
  }, [posters.map((p) => p.url).join("|")]);

  return (
    <div className="stack poster-page">
      <div className="print-hide stack">
        <PageHead title="QR kayıt afişi" subtitle="Asansöre, panoya ya da kapıya asılır; sakin telefonuyla okutup kaydolur. Blok/bölüm afişinde form önseçili açılır." actions={<><Link className="btn" to={`/s/${site.slug}/kayit-basvurulari`}>Kayıt başvuruları</Link><button className="btn btn--primary" type="button" disabled={posters.length === 0} onClick={() => window.print()}><Printer aria-hidden="true" /> Yazdır</button></>} />
        {!link.isError && (
          <div className={`grid grid--kpi${link.data ? " rise" : ""}`}>
            {link.data ? (
              <>
                <Kpi label="Kayıt bağlantısı" tone={link.data.is_enabled ? "ok" : "warn"} icon={<Link2 aria-hidden="true" />} value={link.data.is_enabled ? "Açık" : "Kapalı"} small note={link.data.is_enabled ? "afişteki kod çalışır" : "afişteki kod çalışmaz"} />
                <Kpi label="Blok" icon={<Layers aria-hidden="true" />} value={blocks.data?.total ?? "—"} note="blok afişi ya da bölüm etiketi" />
                <Kpi label="Bekleyen başvuru" icon={<Inbox aria-hidden="true" />} tone={pending.data?.total ? "warn" : undefined} value={pending.data?.total ?? "—"} note="afişten gelen dahil" />
              </>
            ) : (
              [0, 1, 2].map((i) => <div key={i} className="skeleton skel__kpi" aria-hidden="true" />)
            )}
          </div>
        )}
        {link.data && !link.data.is_enabled && <Alert tone="warn" title="Kayıt bağlantısı kapalı">Afişteki kod çalışmaz. Kayıt başvuruları ekranından bağlantıyı açın.</Alert>}
        <div className="card">
          <div className="card__head"><span className="card__icon card__icon--accent"><QrCode aria-hidden="true" /></span><span className="card__title">Afiş ayarları</span></div>
          <div className="card__body grid grid--kpi">
          <Field label="Kapsam">{(p) => <select {...p} className="field__input" value={s.kapsam} onChange={(e) => set({ kapsam: e.target.value, blok: "" })}><option value="tesis">Tüm site</option><option value="blok">Blok</option><option value="bolum">Tek bölüm</option></select>}</Field>
          {s.kapsam === "blok" && <Field label="Blok" required>{(p) => <select {...p} className="field__input" value={s.blok} onChange={(e) => set({ blok: e.target.value })}><option value="">Seçin</option>{blocks.data?.items.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>}</Field>}
          {s.kapsam === "bolum" && <UnitPicker label="Bölüm" value={unit} onChange={setUnit} />}
          <Field label="Boyut" hint={s.kapsam === "blok" ? "Etiket: bloktaki her bölüm için ayrı küçük etiket" : undefined}>{(p) => <select {...p} className="field__input" value={s.boyut} onChange={(e) => set({ boyut: e.target.value })}><option value="a4">A4 afiş</option><option value="a5">A5 afiş</option>{s.kapsam === "blok" && <option value="etiket">Bölüm etiketleri</option>}</select>}</Field>
        </div></div>
        <p className="small muted mb-0">Bağlantı yenilenirse basılı afişler çalışmaz; yenilemeden önce afişleri toplayın. Afişte kişisel veri yoktur.</p>
      </div>
      {link.isPending ? <Loading /> : posters.length === 0 ? <p className="small muted print-hide">Afiş için kapsamı seçin.</p> : (
        <div className={labels ? "poster-labels" : "poster-sheets"}>
          {posters.map((p) => (
            <section key={p.key} className={`poster poster--${labels ? "label" : s.boyut}`} aria-label={`${p.scope ?? p.title} kayıt afişi`}>
              <div className="poster__brand">{p.title}</div>
              <h2 className="poster__title">Sakin kaydı</h2>
              {!labels && <p className="poster__lead">Telefonunuzun kamerasıyla kodu okutun; başvurunuz site yönetimine iletilir.</p>}
              {p.scope && <div className="poster__scope">{p.scope}</div>}
              {imgs[p.url] ? <img className="poster__qr" src={imgs[p.url]} alt={`${p.scope ?? p.title} için kayıt bağlantısının QR kodu`} /> : <div className="poster__qr" aria-hidden="true" />}
              <div className="poster__url mono">{p.url.replace(/^https?:\/\//, "")}</div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
