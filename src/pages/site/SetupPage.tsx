import { useState } from "react";
import { Link } from "react-router";
import { CheckCircle2, Circle, Rocket } from "lucide-react";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { Schemas } from "../../api/types";
import { Alert, Badge, ConfirmButton, ErrorState, Loading, PageHead } from "../../components/ui";
import { formatDateTime } from "../../lib/format";
import { useSite } from "../../site/SiteContext";

type Setup = Schemas["SetupOut"];

const STEPS: [string, string, string | null][] = [
  ["Tesis bilgileri", "Ad, tip, adres; platform yöneticisi açar", null],
  ["Yapı", "Bloklar, bölüm tipleri, ortak alanlar", "yapi"],
  ["Bölümler ve kişiler", "Excel'den aktar ya da elle gir", "iceri-aktar"],
  ["Finans", "Banka hesabı, işletme projesi, otomatik tahakkuk", "kasa"],
  ["Kullanıcılar ve onaylar", "Personel rolleri, onay kuralları", "kullanicilar"],
  ["Modüller ve kayıt yöntemleri", "Açık modüller, davet / QR / site kodu", "moduller"],
  ["KVKK ve iletişim", "Aydınlatma metni; SMS ve bildirim gönderimi K5 ile", "kayit-basvurulari"],
];

/**
 * Kurulum ve canlıya geçiş (YAP-01). Belgedeki sihirbaz adımları mevcut ekranlara bağlantı; canlıya geçiş
 * kontrol listesi gerçek veriden hesaplanır. Finans modu: Mod P (platform). Mod K (KiviERP) ortak kararı (A-01).
 */
export function SetupPage() {
  const { site } = useSite();
  const q = useSiteGet<Setup>("/setup");
  const goLive = useSiteMutation<Record<string, never>, Schemas["GoLiveOut"]>("POST", "/setup/go-live");
  if (q.isPending) return <Loading label="Kontrol listesi hesaplanıyor…" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const s = q.data;
  const base = `/s/${site.slug}`;
  const required = s.checklist.filter((c) => c.required), optional = s.checklist.filter((c) => !c.required);
  const done = required.filter((c) => c.ok).length;
  return (
    <div className="stack">
      <PageHead
        title="Kurulum ve canlıya geçiş"
        subtitle="Tesisi adım adım canlıya hazırlayın. Kurulumdaki tesiste sakin daveti gönderilmez."
        actions={<>
          {s.status === "live" ? <Badge tone="ok">Canlı{s.went_live_at ? ` · ${formatDateTime(s.went_live_at)}` : ""}</Badge> : <Badge tone="warn">Kurulumda</Badge>}
        </>}
      />
      <div className="grid grid--2">
        <div className="card">
          <div className="card__head"><span className="card__title">Adımlar</span></div>
          <div className="card__body"><ol className="setup-steps">{STEPS.map(([t, d, link], i) => <li key={t}><span className="setup-steps__no" aria-hidden="true">{i + 1}</span><div><div className="strong">{link ? <Link to={`${base}/${link}`}>{t}</Link> : t}</div><div className="small muted">{d}</div></div></li>)}</ol></div>
        </div>
        <div className="card">
          <div className="card__head"><span className="card__title">Finans modu</span></div>
          <div className="card__body stack" style={{ gap: "var(--s-2)" }}>
            <div className="kv"><span className="kv__k">Seçili mod</span><span className="kv__v"><Badge tone="info">Mod P — platform</Badge></span></div>
            <p className="small mb-0">Aidat, tahakkuk, cari, tahsilat ve makbuz platformda; muhasebeleştirme muhasebe programına fiş aktarımıyla (K7).</p>
            <p className="small muted mb-0">Mod K (KiviERP entegre) ortakların kararını ve Kivi görüşmesini bekliyor (A-01). Geçiş dönem sonunda sihirbazla yapılacak.</p>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card__head"><span className="card__title">Canlıya geçiş kontrol listesi</span><span className="card__meta ml-auto">{done}/{required.length} zorunlu madde</span></div>
        <div className="card__body card__body--flush">
          <ul className="checklist">
            {[...required, ...optional].map((c) => (
              <li key={c.key} className={`checklist__item${c.ok ? " checklist__item--ok" : ""}`}>
                {c.ok ? <CheckCircle2 aria-hidden="true" className="checklist__icon checklist__icon--ok" /> : <Circle aria-hidden="true" className="checklist__icon" />}
                <div className="checklist__main">
                  <div><span className="strong">{c.label}</span>{!c.required && <span className="small muted"> · isteğe bağlı</span>}<span className="visually-hidden">{c.ok ? " — tamam" : " — eksik"}</span></div>
                  <div className="small muted">{c.detail}</div>
                </div>
                {c.key === "opening" && !c.ok && <OpeningReconciled />}
                {c.link && !c.ok && <Link className="btn btn--sm" to={`${base}/${c.link}`}>Git</Link>}
              </li>
            ))}
          </ul>
        </div>
        <div className="card__foot row row--between">
          <span className="small muted">{s.ready ? "Zorunlu maddeler tamam." : "Zorunlu maddeler tamamlanmadan canlıya alınamaz."}</span>
          {s.status === "setup" ? (
            <ConfirmButton className="btn btn--primary" disabled={!s.ready} title="Tesisi canlıya al" confirmLabel="Canlıya al" body="Tesis 'Canlı' olur; sakin davetleri ve başvurular açılır. Açılış bakiyesi mutabakatının imzalı olduğundan emin olun." onConfirm={() => goLive.mutateAsync({})}><Rocket aria-hidden="true" /> Canlıya al</ConfirmButton>
          ) : <span className="small">Tesis canlı.</span>}
        </div>
      </div>
      {!s.ready && s.status === "setup" && <Alert tone="info">Eksik maddelerin yanındaki "Git" bağlantısı ilgili ekrana götürür; liste her açılışta yeniden hesaplanır.</Alert>}
    </div>
  );
}

/** Açılış bakiyesi aktarım yerine elle girildiyse: imzalı mutabakat beyanı (denetimli). */
function OpeningReconciled() {
  const [note, setNote] = useState("");
  const m = useSiteMutation<{ note: string }, Setup>("POST", "/setup/opening-reconciled");
  return (
    <ConfirmButton className="btn btn--ghost btn--sm" title="Açılış bakiyesi mutabakatı yapıldı" confirmLabel="İşaretle"
      body={<div className="field"><label className="field__label" htmlFor="recon-note">Açıklama *</label><input id="recon-note" className="field__input" maxLength={300} placeholder="ör. 01.10.2026 tarihli imzalı mutabakat tutanağı" value={note} onChange={(e) => setNote(e.target.value)} /><span className="field__hint">Eski sistem bakiyeleri aktarıldı ve toplam tutturuldu; beyan denetim kaydına yazılır.</span></div>}
      onConfirm={() => { if (note.trim().length < 3) throw new Error("Açıklama yazın."); return m.mutateAsync({ note: note.trim() }); }}>
      Mutabakat yapıldı
    </ConfirmButton>
  );
}
