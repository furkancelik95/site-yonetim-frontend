import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import { UserPlus } from "lucide-react";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { Schemas } from "../../api/types";
import { Badge, ConfirmButton, ErrorState, Field, FormError, Loading, PageHead, SubmitButton, fieldError } from "../../components/ui";
import { formatArea, formatDate, todayIso } from "../../lib/format";
import { accountKind, partyRole, unitUsage } from "../../lib/labels";
import { P, useSite } from "../../site/SiteContext";

type Unit = Schemas["UnitDetail"];
type Party = Unit["parties"][number];

export function UnitDetailPage() {
  const { unitId = "" } = useParams();
  const { site, can } = useSite();
  const q = useSiteGet<Unit>(`/units/${unitId}`);
  const [adding, setAdding] = useState(false);

  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const u = q.data;
  const current = u.parties.filter((p) => p.is_current);
  const past = u.parties.filter((p) => !p.is_current);

  return (
    <div className="stack">
      <PageHead
        title={`Bölüm ${u.display_name}`}
        subtitle={[u.block.name + " blok", u.floor !== null && u.floor !== undefined ? `${u.floor}. kat` : null, u.unit_type?.name, unitUsage(u.usage), !u.is_active ? "Pasif" : null].filter(Boolean).join(" · ")}
        actions={<Link className="btn" to={`/s/${site.slug}/daireler`}>Dairelere dön</Link>}
      />

      <div className="grid grid--2">
        <div className="card">
          <div className="card__head"><span className="card__title">Bölüm bilgisi</span></div>
          <div className="card__body">
            <div className="kv"><span className="kv__k">Brüt alan</span><span className="kv__v num">{formatArea(u.gross_area)}</span></div>
            <div className="kv"><span className="kv__k">Net alan</span><span className="kv__v num">{formatArea(u.net_area)}</span></div>
            <div className="kv">
              <span className="kv__k">Arsa payı</span>
              <span className="kv__v num">{u.land_share_numerator && u.land_share_denominator ? `${u.land_share_numerator} / ${u.land_share_denominator}` : "—"}</span>
            </div>
            {u.commercial_title && <div className="kv"><span className="kv__k">Ticari unvan</span><span className="kv__v">{u.commercial_title}</span></div>}
          </div>
        </div>

        <div className="card">
          <div className="card__head"><span className="card__title">Cari hesaplar</span></div>
          <div className="card__body card__body--flush">
            <div className="table-wrap">
              <table className="data">
                <caption className="visually-hidden">Bölümün cari hesapları</caption>
                <thead><tr><th scope="col">Hesap</th><th scope="col">Referans</th><th scope="col" /></tr></thead>
                <tbody>
                  {u.accounts.map((a) => (
                    <tr key={a.id}>
                      <td>{accountKind(a.kind)} {a.is_closed && <Badge>Kapalı</Badge>}</td>
                      <td className="mono xs">{a.reference_code}</td>
                      <td className="right">{can(P.financeRead) && <Link className="btn btn--sm" to={`/s/${site.slug}/cari/${a.id}`}>Ekstre</Link>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="small muted" style={{ padding: "var(--s-3) var(--s-4)", margin: 0 }}>
              Aidat oturana, demirbaş ve yatırım giderleri malike yazılır (KMK m.22).
            </p>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card__head">
          <span className="card__title">Malik ve oturanlar</span>
          {can(P.unitsManage) && (
            <button className="btn btn--sm ml-auto" type="button" onClick={() => setAdding((v) => !v)} aria-expanded={adding}>
              <UserPlus aria-hidden="true" /> Kişi ekle
            </button>
          )}
        </div>
        {adding && <AddPartyForm unitId={u.id} onDone={() => setAdding(false)} />}
        <div className="card__body card__body--flush">
          <PartyTable parties={current} unitId={u.id} canManage={can(P.unitsManage)} />
        </div>
        {past.length > 0 && (
          <details className="card__foot">
            <summary className="small">Geçmiş ({past.length})</summary>
            <PartyTable parties={past} unitId={u.id} canManage={false} />
          </details>
        )}
      </div>
    </div>
  );
}

function PartyTable({ parties, unitId, canManage }: { parties: Party[]; unitId: string; canManage: boolean }) {
  if (parties.length === 0) return <p className="small muted" style={{ padding: "var(--s-4)", margin: 0 }}>Kayıtlı kişi yok.</p>;
  return (
    <div className="table-wrap">
      <table className="data">
        <caption className="visually-hidden">Bölümle ilişkili kişiler</caption>
        <thead>
          <tr>
            <th scope="col">Kişi</th>
            <th scope="col">İlişki</th>
            <th scope="col">İletişim</th>
            <th scope="col">Başlangıç</th>
            <th scope="col">Bitiş</th>
            {canManage && <th scope="col" />}
          </tr>
        </thead>
        <tbody>
          {parties.map((p) => (
            <tr key={p.id}>
              <td className="cell-main">{p.person.full_name}</td>
              <td>
                {partyRole(p.role)}
                {p.role === "owner" && p.share_percent && p.share_percent !== "100.00" && <span className="small muted"> · %{p.share_percent}</span>}
              </td>
              <td className="small">{[p.person.phone, p.person.email].filter(Boolean).join(" · ") || "—"}</td>
              <td className="small nowrap">{formatDate(p.start_date)}</td>
              <td className="small nowrap">{formatDate(p.end_date)}</td>
              {canManage && (
                <td className="right">
                  <EndPartyButton unitId={unitId} party={p} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EndPartyButton({ unitId, party }: { unitId: string; party: Party }) {
  const [date, setDate] = useState(todayIso());
  const m = useSiteMutation<{ end_date: string }, unknown>("POST", `/units/${unitId}/parties/${party.id}/end`);
  return (
    <ConfirmButton
      className="btn btn--sm"
      title={`${party.person.full_name} — ilişkiyi sona erdir`}
      confirmLabel="Sona erdir"
      danger
      body={
        <div className="stack" style={{ gap: "var(--s-3)" }}>
          <p className="mb-0">Kayıt silinmez; geçmişte kalır. Bu tarihten sonraki tahakkuklar bu kişiye yazılmaz.</p>
          <div className="field">
            <label className="field__label" htmlFor={`end-${party.id}`}>Bitiş tarihi</label>
            <input id={`end-${party.id}`} className="field__input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
      }
      onConfirm={() => m.mutateAsync({ end_date: date })}
    >
      Sona erdir
    </ConfirmButton>
  );
}

function AddPartyForm({ unitId, onDone }: { unitId: string; onDone: () => void }) {
  const [f, setF] = useState({ role: "tenant", start_date: todayIso(), share_percent: "100", first_name: "", last_name: "", phone: "", email: "" });
  const m = useSiteMutation<Record<string, unknown>, unknown>("POST", `/units/${unitId}/parties`, { onSuccess: onDone });
  const up = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  function submit(e: FormEvent) {
    e.preventDefault();
    m.mutate({
      role: f.role,
      start_date: f.start_date,
      share_percent: f.role === "owner" ? f.share_percent.replace(",", ".") : undefined,
      person: {
        first_name: f.first_name.trim(),
        last_name: f.last_name.trim(),
        phone: f.phone.trim() || null,
        email: f.email.trim().toLocaleLowerCase("tr-TR") || null,
      },
    });
  }

  return (
    <form className="card__body stack" style={{ gap: "var(--s-4)", borderBottom: "1px solid var(--line)" }} onSubmit={submit} noValidate>
      <FormError error={m.error} />
      <div className="grid grid--kpi">
        <Field label="İlişki" required>
          {(p) => (
            <select {...p} className="field__input" value={f.role} onChange={up("role")}>
              {["tenant", "owner", "resident", "proxy"].map((r) => <option key={r} value={r}>{partyRole(r)}</option>)}
            </select>
          )}
        </Field>
        <Field label="Başlangıç" required error={fieldError(m.error, "start_date")}>
          {(p) => <input {...p} className="field__input" type="date" value={f.start_date} onChange={up("start_date")} />}
        </Field>
        {f.role === "owner" && (
          <Field label="Hisse (%)" error={fieldError(m.error, "share_percent")}>
            {(p) => <input {...p} className="field__input" inputMode="decimal" value={f.share_percent} onChange={up("share_percent")} />}
          </Field>
        )}
        <Field label="Ad" required error={fieldError(m.error, "first_name")}>
          {(p) => <input {...p} className="field__input" autoComplete="off" value={f.first_name} onChange={up("first_name")} />}
        </Field>
        <Field label="Soyad" required error={fieldError(m.error, "last_name")}>
          {(p) => <input {...p} className="field__input" autoComplete="off" value={f.last_name} onChange={up("last_name")} />}
        </Field>
        <Field label="Telefon" error={fieldError(m.error, "phone")}>
          {(p) => <input {...p} className="field__input" type="tel" inputMode="tel" placeholder="+90 5XX XXX XX XX" value={f.phone} onChange={up("phone")} />}
        </Field>
        <Field label="E-posta" error={fieldError(m.error, "email")}>
          {(p) => <input {...p} className="field__input" type="email" inputMode="email" value={f.email} onChange={up("email")} />}
        </Field>
      </div>
      {f.role === "tenant" && (
        <p className="small muted mb-0">Kiracı eklendiğinde aidat, başlangıç tarihinden sonraki tahakkuklarda kiracının hesabına yazılır.</p>
      )}
      <div className="row" style={{ gap: "var(--s-2)" }}>
        <SubmitButton busy={m.isPending} disabled={!f.first_name.trim() || !f.last_name.trim()}>Ekle</SubmitButton>
        <button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button>
      </div>
    </form>
  );
}
