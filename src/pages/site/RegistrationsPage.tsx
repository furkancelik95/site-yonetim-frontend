import { useState } from "react";
import { ApiError } from "../../api/client";
import { Copy, Inbox, RefreshCw } from "lucide-react";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { Page, Schemas } from "../../api/types";
import { OneTimePassword } from "../../components/OneTimePassword";
import { useToast } from "../../components/toast";
import { UnitPicker, type PickedUnit } from "../../components/UnitPicker";
import { Alert, Badge, ConfirmButton, Empty, ErrorState, Loading, PageHead, Pager } from "../../components/ui";
import { formatDateTime, todayIso } from "../../lib/format";
import { useUrlState } from "../../lib/hooks";
import { partyRole } from "../../lib/labels";

type Link = Schemas["LinkOut"];
type Registration = Schemas["RegistrationOut"];
type Approved = Schemas["ApprovedOut"];

const formatPhone = (e164: string) => e164.replace(/^\+90(\d{3})(\d{3})(\d{2})(\d{2})$/, "+90 $1 $2 $3 $4");

/**
 * Sakin kayıt başvuruları (Apsiyon "Onay Bekleyen Kişiler"): sakin site bağlantısından kendini kaydeder,
 * yönetim bölümünü seçip onaylar; kişi bölüme malik/kiracı olarak eklenir.
 */
export function RegistrationsPage() {
  const toast = useToast();
  const link = useSiteGet<Link>("/registration-link");
  const rotate = useSiteMutation<Record<string, never>, Link>("POST", "/registration-link/rotate");
  const toggle = useSiteMutation<{ is_enabled: boolean }, Link>("PATCH", "/registration-link");
  const [s, set] = useUrlState({ durum: "pending", page: "1" });
  const q = useSiteGet<Page<Registration>>("/registrations", { status: s.durum, page: s.page, page_size: 30 });
  const url = link.data ? `${window.location.origin}/kayit/${link.data.code}` : "";
  // Onaylanan başvuru listeden çıkar; yeni hesabın geçici parolası burada bir kez gösterilir
  const [issued, setIssued] = useState<Approved | null>(null);

  return (
    <div className="stack">
      <PageHead title="Kayıt başvuruları" subtitle="Sakinler site bağlantısından kendini kaydeder; siz bölümünü seçip onaylarsınız." />

      {issued?.temporary_password && (
        <div className="card">
          <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
            <Alert tone="ok" title={`${issued.first_name} ${issued.last_name} için giriş hesabı açıldı`}>{issued.unit_name} · {partyRole(issued.relation)}</Alert>
            <OneTimePassword email={issued.email} password={issued.temporary_password} />
          </div>
          <div className="card__foot"><button className="btn" type="button" onClick={() => setIssued(null)}>Tamam</button></div>
        </div>
      )}

      <div className="card">
        <div className="card__head"><span className="card__title">Kayıt bağlantısı</span>{link.data && <span className="ml-auto">{link.data.is_enabled ? <Badge tone="ok">Açık</Badge> : <Badge>Kapalı</Badge>}</span>}</div>
        <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
          {link.isPending ? <Loading /> : link.data && (
            <>
              <div className="row" style={{ gap: "var(--s-2)" }}>
                <code className="mono small" style={{ wordBreak: "break-all" }}>{url}</code>
                <button className="btn btn--sm" type="button" onClick={() => navigator.clipboard?.writeText(url).then(() => toast("Bağlantı kopyalandı."))}><Copy aria-hidden="true" /> Kopyala</button>
              </div>
              <p className="small muted mb-0">Bağlantıyı duyuru panosuna, WhatsApp grubuna ya da asansöre asılacak QR koda koyun. Kötüye kullanılırsa yenileyin; eski bağlantı çalışmaz.</p>
              <div className="row" style={{ gap: "var(--s-2)" }}>
                <ConfirmButton className="btn btn--sm" title="Bağlantıyı yenile" confirmLabel="Yenile" body="Yeni bağlantı üretilir; dağıtılmış eski bağlantı artık çalışmaz." onConfirm={() => rotate.mutateAsync({})}><RefreshCw aria-hidden="true" /> Yenile</ConfirmButton>
                <button className="btn btn--ghost btn--sm" type="button" disabled={toggle.isPending} onClick={() => toggle.mutate({ is_enabled: !link.data!.is_enabled })}>{link.data.is_enabled ? "Kayda kapat" : "Kayda aç"}</button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="row" role="tablist" aria-label="Başvuru durumu" style={{ gap: "var(--s-2)" }}>
        {[["pending", "Bekleyen"], ["approved", "Onaylanan"], ["rejected", "Reddedilen"]].map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={s.durum === k} className={`btn btn--sm${s.durum === k ? " btn--primary" : ""}`} onClick={() => set({ durum: k! })}>{l}</button>
        ))}
      </div>

      <div className="card">
        <div className="card__body card__body--flush">
          {q.isPending ? <Loading /> : q.isError ? <div className="card__body"><ErrorState error={q.error} /></div> : q.data.items.length === 0 ? (
            <Empty title={s.durum === "pending" ? "Bekleyen başvuru yok" : "Kayıt yok"} icon={<Inbox aria-hidden="true" />}>Kayıt bağlantısını sakinlerle paylaştığınızda başvurular burada görünür.</Empty>
          ) : (
            <div className="table-wrap" style={{ overflow: "visible" }}>
              <table className="data">
                <caption className="visually-hidden">Sakin kayıt başvuruları</caption>
                <thead><tr><th scope="col">Başvuran</th><th scope="col">Yazdığı bölüm</th><th scope="col">İletişim</th><th scope="col">Tarih</th><th scope="col" style={{ minWidth: "16rem" }}>{s.durum === "pending" ? "Onay" : "Sonuç"}</th></tr></thead>
                <tbody>{q.data.items.map((r) => <RegistrationRow key={r.id} r={r} onApproved={(d) => d.temporary_password && setIssued(d)} />)}</tbody>
              </table>
            </div>
          )}
        </div>
        {q.data && <div className="card__foot"><Pager page={q.data.page} pageSize={q.data.page_size} total={q.data.total} onPage={(p) => set({ page: String(p) })} /></div>}
      </div>
    </div>
  );
}

function RegistrationRow({ r, onApproved }: { r: Registration; onApproved: (d: Approved) => void }) {
  const [unit, setUnit] = useState<PickedUnit | null>(null);
  const [reason, setReason] = useState("");
  // Malik başvurusunda hisse (boş = %100); bölümde başka malik varsa toplam %100'ü aşamaz (409)
  const [share, setShare] = useState("");
  // Geçici parola yalnız sayfa üstündeki kartta tutulur; satırın mutasyon önbelleğinde kalmaz
  const approve = useSiteMutation<{ unit_id: string; start_date: string; share_percent?: string }, Approved>("POST", `/registrations/${r.id}/approve`, { onSuccess: (d) => { if (d) onApproved(d); approve.reset(); } });
  const reject = useSiteMutation<{ reason: string }, Registration>("POST", `/registrations/${r.id}/reject`);
  // Hisse dolu (409) gelince hisse alanı açılır; daha düşük oranla yeniden denenebilir
  const sharesFull = approve.error instanceof ApiError && approve.error.code === "owner_shares_exceed";
  return (
    <tr>
      <td>
        <div className="cell-main">{r.first_name} {r.last_name}</div>
        <div className="cell-sub">{partyRole(r.relation)} · <span className="mono">{r.reference}</span>{r.explicit_consent ? " · açık rıza verdi" : ""}</div>
      </td>
      <td className="small">{r.unit_text}</td>
      <td className="small">{formatPhone(r.phone)}{r.email && <div className="cell-sub">{r.email}</div>}</td>
      <td className="small nowrap">{formatDateTime(r.created_at)}</td>
      <td>
        {r.status === "pending" ? (
          <div className="stack" style={{ gap: "var(--s-2)" }}>
            <UnitPicker label="Bölüm" value={unit} onChange={setUnit} />
            {r.relation === "owner" && (sharesFull || share) && (
              <div className="field" style={{ maxWidth: "12rem" }}>
                <label className="field__label" htmlFor={`share-${r.id}`}>Hisse oranı (%)</label>
                <input id={`share-${r.id}`} className="field__input" inputMode="decimal" placeholder="100" value={share} onChange={(e) => setShare(e.target.value.replace(/[^d.,]/g, "").slice(0, 6))} aria-describedby={`share-${r.id}-hint`} />
                <span className="field__hint" id={`share-${r.id}-hint`}>Bölümde başka malik varsa hisseler toplamı %100'ü aşamaz.</span>
              </div>
            )}
            <div className="row" style={{ gap: "var(--s-2)" }}>
              <button className="btn btn--sm btn--primary" type="button" disabled={!unit || approve.isPending} aria-busy={approve.isPending || undefined} onClick={() => unit && approve.mutate({ unit_id: unit.id, start_date: todayIso(), ...(r.relation === "owner" && share.trim() ? { share_percent: share.trim().replace(",", ".") } : {}) })}>Onayla</button>
              <ConfirmButton className="btn btn--ghost btn--sm" danger title="Başvuruyu reddet" confirmLabel="Reddet"
                body={<div className="field"><label className="field__label" htmlFor={`rej-${r.id}`}>Gerekçe *</label><input id={`rej-${r.id}`} className="field__input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="ör. Bu bölümde kayıtlı değil" /></div>}
                onConfirm={() => { if (!reason.trim()) throw new Error("Gerekçe zorunlu."); return reject.mutateAsync({ reason: reason.trim() }); }}>
                Reddet
              </ConfirmButton>
            </div>
            {approve.error && <span className="field__error" role="alert">{(approve.error as Error).message}</span>}
          </div>
        ) : r.status === "approved" ? (
          <span className="small"><Badge tone="ok">Onaylandı</Badge> {r.unit_name} · {r.decided_by}</span>
        ) : (
          <span className="small"><Badge tone="danger">Reddedildi</Badge> {r.reject_reason}</span>
        )}
      </td>
    </tr>
  );
}
