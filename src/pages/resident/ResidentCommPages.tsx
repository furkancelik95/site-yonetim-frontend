import { useEffect, useState } from "react";
import { Link } from "react-router";
import { CheckCircle2, LifeBuoy, MapPin, Phone, Siren } from "lucide-react";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import { Alert, Field, FormError, Loading, fieldError, useDocumentTitle } from "../../components/ui";
import { formatDateTime } from "../../lib/format";
import { useSite } from "../../site/SiteContext";
import { EM_KIND, INSTR, type InfoCard } from "../site/CommPages";

/** Servis isteği 71 ve 73'teki şekiller (sakin). */
interface ResEmergency { id: string; kind: string; message: string; started_at: string; units: { unit_id: string; unit_name: string; status: { status: string; note: string | null; muster_point: string | null; at: string } | null }[]; muster_points: string[] }
interface PendingAck { announcement_id: string; title: string; deadline: string }

/** "Okudum, anladım" (ILT-01): zorunlu okuma onayı. */
export function AckButton({ id, ackedAt }: { id: string; ackedAt: string | null | undefined }) {
  const m = useSiteMutation<Record<string, never>, unknown>("POST", `/resident/announcements/${id}/acknowledge`);
  if (ackedAt) return <div className="small" style={{ marginTop: 6 }}><CheckCircle2 aria-hidden="true" style={{ width: 14, height: 14, verticalAlign: "-2px", color: "var(--ok-fg)" }} /> Okudunuz ve onayladınız · {formatDateTime(ackedAt)}</div>;
  return (
    <div className="stack" style={{ gap: 4, marginTop: 8 }}>
      <FormError error={m.error} />
      <button className="btn btn--primary btn--sm" style={{ width: "fit-content" }} type="button" disabled={m.isPending} onClick={() => m.mutate({})}>Okudum, anladım</button>
    </div>
  );
}

/** Sakin ana sayfasının en üstü: aktif acil durum ve okuma onayı bekleyen duyurular (onaylanana kadar sabit kalır). */
export function ResidentAlerts() {
  const { site } = useSite();
  const base = `/sakin/${site.slug}`;
  const em = useSiteGet<ResEmergency | null>("/resident/emergency", undefined, { refetchInterval: 15000 });
  const pend = useSiteGet<PendingAck[]>("/resident/pending-acks");
  return (
    <>
      {em.data && (
        <div className="alert alert--danger" role="alert" style={{ marginBottom: "var(--s-3)" }}>
          <div className="stack" style={{ gap: "var(--s-2)" }}>
            <div><strong><Siren aria-hidden="true" style={{ width: 16, height: 16, verticalAlign: "-3px" }} /> ACİL DURUM — {EM_KIND[em.data.kind]}</strong><div>{em.data.message}</div></div>
            <Link className="btn btn--danger" style={{ width: "fit-content" }} to={`${base}/acil-durum`}>Durumumu bildir</Link>
          </div>
        </div>
      )}
      {(pend.data ?? []).map((p) => (
        <div key={p.announcement_id} className="alert alert--info" style={{ marginBottom: "var(--s-3)" }}>
          <div><strong>Okuma onayı bekleniyor:</strong> {p.title} <span className="small">(son {formatDateTime(p.deadline)})</span></div>
          <Link className="small" to={`${base}/duyurular`}>Duyuruyu aç ve onayla</Link>
        </div>
      ))}
    </>
  );
}

const CACHE_KEY = (slug: string) => `sy-acil-kart-${slug}`;

/** Acil durum (ILT-04/06, sakin): durum bildirimi ve internet yokken de açılan acil bilgi kartı. */
export function ResidentEmergencyPage() {
  useDocumentTitle("Acil durum");
  const { site } = useSite();
  const em = useSiteGet<ResEmergency | null>("/resident/emergency", undefined, { refetchInterval: 15000 });
  const card = useSiteGet<InfoCard>("/resident/emergency-info-card");
  const [cached, setCached] = useState<InfoCard | null>(null);
  useEffect(() => {
    try {
      if (card.data) localStorage.setItem(CACHE_KEY(site.slug), JSON.stringify(card.data));
      else { const raw = localStorage.getItem(CACHE_KEY(site.slug)); if (raw) setCached(JSON.parse(raw) as InfoCard); }
    } catch { /* depolama kapalı olabilir */ }
  }, [card.data, site.slug]);
  const c = card.data ?? cached;
  return (
    <>
      {em.data && <StatusCard e={em.data} />}
      <div className="section-title">Acil bilgi kartı</div>
      {!card.data && cached && <p className="small muted">İnternet yok — cihazdaki kopya gösteriliyor (sürüm {cached.version}{cached.updated_at && `, ${formatDateTime(cached.updated_at)}`}).</p>}
      {!c ? (card.isPending ? <Loading /> : <p className="small muted">Kart henüz yüklenmedi; internet bağlantısı gelince kaydedilecek.</p>) : (
        <div className="stack" style={{ gap: "var(--s-3)" }}>
          <div className="card"><div className="card__body stack" style={{ gap: "var(--s-1)" }}>
            {c.phones.map((p, i) => <a key={i} className="btn" style={{ justifyContent: "flex-start" }} href={`tel:${p.number}`}><Phone aria-hidden="true" /> {p.label} · <strong>{p.number}</strong></a>)}
          </div></div>
          {c.muster_points.length > 0 && <div className="card"><div className="card__head"><span className="card__title">Toplanma alanları</span></div><div className="card__body stack" style={{ gap: "var(--s-2)" }}>
            {c.muster_points.map((m) => <div key={m.id}><div className="strong"><MapPin aria-hidden="true" style={{ width: 14, height: 14, verticalAlign: "-2px" }} /> {m.name}</div>{m.directions && <div className="small">{m.directions}</div>}{m.map && <img src={m.map} alt={`${m.name} krokisi`} style={{ maxWidth: "100%", borderRadius: 8, marginTop: 4 }} />}</div>)}
          </div></div>}
          <div className="card"><div className="card__head"><span className="card__title">Ne yapmalı?</span></div><div className="card__body stack" style={{ gap: "var(--s-2)" }}>
            {INSTR.filter(([k]) => c.instructions[k]).map(([k, l]) => <div key={k}><div className="strong small">{l}</div><div className="small">{c.instructions[k]}</div></div>)}
          </div></div>
          {c.block_notes.length > 0 && <div className="card"><div className="card__head"><span className="card__title">Blok tahliye notları</span></div><div className="card__body stack" style={{ gap: 4 }}>{c.block_notes.map((n) => <div key={n.block_id} className="small"><strong>{n.block_name}:</strong> {n.note}</div>)}</div></div>}
        </div>
      )}
    </>
  );
}

function StatusCard({ e }: { e: ResEmergency }) {
  const [note, setNote] = useState("");
  const [point, setPoint] = useState(e.muster_points[0] ?? "");
  const m = useSiteMutation<Record<string, unknown>, unknown>("POST", "/resident/emergency/status");
  const st = e.units[0]?.status;
  return (
    <div className="card" style={{ borderColor: "var(--danger-solid)" }}>
      <div className="card__head"><span className="card__icon" style={{ color: "var(--danger-fg)" }}><Siren aria-hidden="true" /></span><span className="card__title">{EM_KIND[e.kind]} — acil durum</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <p className="mb-0">{e.message}</p>
        {st && <Alert tone={st.status === "help" ? "danger" : "ok"} title="Bildiriminiz alındı">{st.status === "safe" ? "Güvende" : st.status === "help" ? "Yardım istediniz; ekip yönlendiriliyor." : `Toplanma alanında: ${st.muster_point}`} · {formatDateTime(st.at)}</Alert>}
        <FormError error={m.error} />
        <button className="btn btn--primary" style={{ minHeight: 52 }} type="button" disabled={m.isPending} onClick={() => m.mutate({ status: "safe" })}><CheckCircle2 aria-hidden="true" /> Güvendeyim</button>
        {e.muster_points.length > 0 && (
          <div className="row" style={{ gap: "var(--s-2)", alignItems: "flex-end", flexWrap: "wrap" }}>
            <Field label="Toplanma alanı" error={fieldError(m.error, "muster_point")}>{(p) => <select {...p} className="field__input" value={point} onChange={(x) => setPoint(x.target.value)}>{e.muster_points.map((x) => <option key={x} value={x}>{x}</option>)}</select>}</Field>
            <button className="btn" style={{ minHeight: 44 }} type="button" disabled={m.isPending} onClick={() => m.mutate({ status: "muster", muster_point: point })}><MapPin aria-hidden="true" /> Toplanma alanındayım</button>
          </div>
        )}
        <Field label="Yardım için not (isteğe bağlı)" hint="ör. kat 4, yaşlı komşu, merdiven kapalı">{(p) => <input {...p} className="field__input" maxLength={200} value={note} onChange={(x) => setNote(x.target.value)} />}</Field>
        <button className="btn btn--danger" style={{ minHeight: 52 }} type="button" disabled={m.isPending} onClick={() => m.mutate({ status: "help", note })}><LifeBuoy aria-hidden="true" /> Yardım lazım</button>
      </div>
    </div>
  );
}
