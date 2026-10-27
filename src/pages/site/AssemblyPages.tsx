import { useState } from "react";
import { BookOpen, CalendarDays, Gavel, PieChart, Printer } from "lucide-react";
import { Donut } from "../../components/charts";
import { Link, useParams } from "react-router";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { Schemas } from "../../api/types";
import { Alert, Badge, ConfirmButton, Empty, ErrorState, Field, FormError, Kpi, Loading, PageHead, SubmitButton, fieldError, useDocumentTitle } from "../../components/ui";
import { formatDate, formatDateTime } from "../../lib/format";
import { useUrlState } from "../../lib/hooks";
import { meetingKind } from "../../lib/labels";
import { P, useSite } from "../../site/SiteContext";

/** Servis isteği 75–77'deki şekiller. */
type Meeting = Schemas["MeetingOut"];
interface DType { code: string; name: string; base: string; num: number; den: number; strict: boolean; person: boolean; share: boolean }
interface Roster { unit_id: string; unit_name: string; block_name: string; owners: string[]; key: string; share: number; share_den: number }
interface Result { type_name: string; persons: { for: number; against: number; abstain: number; base: number }; shares: { for: number; against: number; abstain: number; base: number }; person_ok: boolean | null; share_ok: boolean | null; accepted: boolean }
interface Vote { status: "none" | "open" | "closed"; ballots: Record<string, string>; result: Result | null; live: Result | null }
interface Assembly {
  format: string; legal_ack: { by: string; at: string } | null; second_call: boolean; item_types: Record<string, string>; invitation: { announcement_id: string; sent_at: string; by: string } | null;
  roster: Roster[]; attendance: { unit_id: string; mode: "self" | "proxy"; proxy_name: string | null }[]; votes: Record<string, Vote>;
  minutes: { notes: Record<string, string>; decisions: Record<string, string>; opening: string; finalized_at: string | null; finalized_by: string | null; signed_file: string | null };
  settings: { decision_types: DType[]; proxy_limit: number }; quorum: { persons_present: number; persons_total: number; share_present: number; share_total: number; person_ok: boolean; share_ok: boolean; ok: boolean; second_call: boolean };
}
interface BookEntry { no: number; meeting_id: string; meeting_title: string; date: string; item_title: string; decision: string; type_name: string }

const FORMAT: Record<string, string> = { physical: "Fiziki toplantı, salonda oylama", hybrid: "Hibrit (fiziki + uzaktan)", prevote: "Ön oylama penceresi + toplantıda kesinleşme" };
const pct = (v: number, t: number) => `%${(t ? (v / t) * 100 : 0).toLocaleString("tr-TR", { maximumFractionDigits: 2 })}`;
const VOTE: Record<string, string> = { for: "Kabul", against: "Ret", abstain: "Çekimser" };
const tabs = (items: [string, string][], v: string, set: (k: string) => void, label: string) => (
  <div className="tabs print-hide" role="tablist" aria-label={label}>{items.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={v === k} className="tabs__tab" onClick={() => set(k)}>{l}</button>)}</div>
);

/** Genel kurul (TOP-01, TOP-03 salonda oylama, TOP-04): hazırlık ve çağrı, hazirun ve nisap, kişi + arsa payı oylaması, tutanak. */
export function GeneralAssemblyPage() {
  const { meetingId = "" } = useParams();
  const { site, can } = useSite();
  const mq = useSiteGet<Meeting>(`/meetings/${meetingId}`);
  const q = useSiteGet<Assembly>(`/meetings/${meetingId}/assembly`);
  const [s, set] = useUrlState({ sekme: "hazirlik" });
  useDocumentTitle("Genel kurul");
  if (mq.isPending || q.isPending) return <Loading />;
  if (mq.isError) return <ErrorState error={mq.error} />;
  if (q.isError) return <ErrorState error={q.error} />;
  const m = mq.data, a = q.data;
  const manage = can(P.meetingsManage);
  return (
    <div className="stack">
      <div className="print-hide"><PageHead title={`${m.title}`} subtitle={<><Link to={`/s/${site.slug}/toplantilar/${m.id}`}>Toplantı</Link> · {meetingKind(m.kind)} · {formatDateTime(m.scheduled_at)} · {m.location}</>} actions={<Link className="btn" to={`/s/${site.slug}/karar-defteri`}><BookOpen aria-hidden="true" /> Karar defteri</Link>} /></div>
      {tabs([["hazirlik", "Hazırlık ve çağrı"], ["hazirun", "Hazirun ve oylama"], ["tutanak", "Tutanak"]], s.sekme, (k) => set({ sekme: k }), "Genel kurul")}
      {s.sekme === "hazirun" ? <Floor m={m} a={a} manage={manage} /> : s.sekme === "tutanak" ? <Minutes m={m} a={a} manage={manage} siteName={site.name} /> : <Prep m={m} a={a} manage={manage} />}
    </div>
  );
}

function Prep({ m, a, manage }: { m: Meeting; a: Assembly; manage: boolean }) {
  const { site } = useSite();
  const [f, setF] = useState({ format: a.format, second_call: a.second_call, item_types: a.item_types });
  const [inv, setInv] = useState({ title: `${meetingKind(m.kind)} toplantı çağrısı`, body: `Sayın malik,\n${formatDateTime(m.scheduled_at)} tarihinde ${m.location} adresinde ${meetingKind(m.kind).toLocaleLowerCase("tr-TR")} toplantısı yapılacaktır.\n\nGündem:\n${m.agenda.map((i) => `${i.order}. ${i.title}`).join("\n")}\n\nToplantı nisabı sağlanamazsa ikinci toplantı bir hafta sonra aynı saat ve yerde yapılacaktır.`, ack_hours: "72" });
  const prep = useSiteMutation<Record<string, unknown>, Assembly>("PUT", `/meetings/${m.id}/assembly/prep`);
  const ack = useSiteMutation<Record<string, never>, Assembly>("POST", `/meetings/${m.id}/assembly/legal-ack`);
  const send = useSiteMutation<Record<string, unknown>, Assembly>("POST", `/meetings/${m.id}/assembly/invitation`);
  const [limit, setLimit] = useState(String(a.settings.proxy_limit));
  const lim = useSiteMutation<{ proxy_limit: number }, unknown>("PUT", "/assembly-settings");
  const locked = a.attendance.length > 0 || !manage;
  return (
    <div className="stack">
      <form className="card" noValidate onSubmit={(e) => { e.preventDefault(); prep.mutate(f); }}>
        <div className="card__head"><span className="card__title">Format ve karar türleri</span></div>
        <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
          <FormError error={prep.error} />
          <Field label="Format">{(p) => <select {...p} className="field__input" disabled={locked} value={f.format} onChange={(e) => setF((x) => ({ ...x, format: e.target.value }))}>{Object.entries(FORMAT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>}</Field>
          {m.agenda.map((i) => (
            <Field key={i.id} label={`${i.order}. ${i.title}`} hint="Karar türü: nisap ve çoğunluk kuralı" error={fieldError(prep.error, `item_types.${i.id}`)}>{(p) => <select {...p} className="field__input" disabled={locked} value={f.item_types[i.id] ?? "ordinary"} onChange={(e) => setF((x) => ({ ...x, item_types: { ...x.item_types, [i.id]: e.target.value } }))}>{a.settings.decision_types.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}</select>}</Field>
          ))}
          <label className="check"><input type="checkbox" disabled={locked} checked={f.second_call} onChange={(e) => setF((x) => ({ ...x, second_call: e.target.checked }))} /><span>İkinci toplantı (ilk toplantıda nisap sağlanamadı; toplantı nisabı aranmaz, karar çoğunlukları geçerli)</span></label>
          <p className="xs muted mb-0">Toplantı nisabı: maliklerin sayı ve arsa payı yarıdan fazlası. Çağrı süresi ve ikinci toplantı kuralı mevzuat teyidine bağlıdır.</p>
          {manage && <div className="row" style={{ gap: "var(--s-2)", alignItems: "flex-end", flexWrap: "wrap" }}><Field label="Kişi başı azami vekâlet (site ayarı)" error={fieldError(lim.error, "proxy_limit")}>{(p) => <input {...p} className="field__input" style={{ maxWidth: "6rem" }} inputMode="numeric" value={limit} onChange={(e) => setLimit(e.target.value.replace(/\D/g, ""))} />}</Field><button className="btn btn--sm" type="button" disabled={lim.isPending} onClick={() => lim.mutate({ proxy_limit: Number(limit) })}>Kaydet</button></div>}
        </div>
        {!locked && <div className="card__foot"><SubmitButton busy={prep.isPending}>Kaydet</SubmitButton></div>}
      </form>
      {a.format !== "physical" && (
        <Alert tone="warn" title="Hukuki geçerlilik">
          Hibrit ve ön oylama formatlarında hukuki geçerlilik için yönetim planı ve güncel mevzuat kontrol edilmelidir. Ön oylar "bağlayıcı değildir" etiketiyle gösterilir; uzaktan oy ve dijital vekâlet hukuki teyit ve SMS doğrulaması gelince açılacak.
          {a.legal_ack ? <div className="small" style={{ marginTop: 6 }}>Onaylayan: {a.legal_ack.by}, {formatDateTime(a.legal_ack.at)}</div> : manage && <div style={{ marginTop: 8 }}><button className="btn btn--sm" type="button" disabled={ack.isPending} onClick={() => ack.mutate({})}>Okudum, onaylıyorum</button></div>}
        </Alert>
      )}
      <form className="card" noValidate onSubmit={(e) => { e.preventDefault(); send.mutate({ ...inv, ack_hours: Number(inv.ack_hours) }); }}>
        <div className="card__head"><span className="card__title">Çağrı</span>{a.invitation && <span className="ml-auto"><Badge tone="ok">Gönderildi</Badge></span>}</div>
        {a.invitation ? (
          <div className="card__body stack" style={{ gap: "var(--s-2)" }}>
            <div className="small">{a.invitation.by}, {formatDateTime(a.invitation.sent_at)} — maliklere uygulama + e-posta + SMS, okuma onayı zorunlu.</div>
            <div className="row" style={{ gap: "var(--s-2)", flexWrap: "wrap" }}><Link className="btn btn--sm" to={`/s/${site.slug}/duyurular/${a.invitation.announcement_id}/okuma-raporu`}>Çağrı ispat raporu (okuma onayları)</Link><Link className="btn btn--sm" to={`/s/${site.slug}/belge/hazirun`}><Printer aria-hidden="true" /> Basılı liste</Link></div>
          </div>
        ) : (
          <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
            <FormError error={send.error} />
            <Field label="Başlık">{(p) => <input {...p} className="field__input" disabled={!manage} maxLength={120} value={inv.title} onChange={(e) => setInv((x) => ({ ...x, title: e.target.value }))} />}</Field>
            <Field label="Çağrı metni" error={fieldError(send.error, "body")}>{(p) => <textarea {...p} className="field__input" rows={8} disabled={!manage} value={inv.body} onChange={(e) => setInv((x) => ({ ...x, body: e.target.value }))} />}</Field>
            <Field label="Okuma onayı süresi (saat)">{(p) => <input {...p} className="field__input" style={{ maxWidth: "8rem" }} inputMode="numeric" disabled={!manage} value={inv.ack_hours} onChange={(e) => setInv((x) => ({ ...x, ack_hours: e.target.value.replace(/\D/g, "") }))} />}</Field>
            {manage && <div><SubmitButton busy={send.isPending}>Çağrıyı maliklere gönder</SubmitButton></div>}
          </div>
        )}
      </form>
    </div>
  );
}

function Floor({ m, a, manage }: { m: Meeting; a: Assembly; manage: boolean }) {
  const [proxy, setProxy] = useState<Record<string, string>>({});
  const att = useSiteMutation<Record<string, unknown>, Assembly>("PUT", `/meetings/${m.id}/assembly/attendance`);
  const present = new Map(a.attendance.map((x) => [x.unit_id, x]));
  const q = a.quorum;
  const anyOpen = Object.values(a.votes).some((v) => v.status === "open");
  const done = !!a.minutes.finalized_at;
  return (
    <div className="stack">
      <div className="grid grid--kpi">
        <Kpi label="Katılan malik (kişi)" value={`${q.persons_present}/${q.persons_total}`} tone={q.person_ok ? "ok" : "warn"} note={q.person_ok ? "yarıdan fazla" : "yarıdan fazla değil"} />
        <Kpi label="Katılan arsa payı" value={pct(q.share_present, q.share_total)} tone={q.share_ok ? "ok" : "warn"} note={q.share_ok ? "yarıdan fazla" : "yarıdan fazla değil"} />
        <Kpi label="Toplantı nisabı" value={q.ok ? "Sağlandı" : "Sağlanamadı"} tone={q.ok ? "ok" : "danger"} note={q.second_call ? "ikinci toplantı: aranmaz" : "kişi ve pay birlikte"} />
        <Kpi label="Vekâlet sınırı" value={a.settings.proxy_limit} note="kişi başı malik" />
      </div>
      {!q.ok && <Alert tone="danger" title="Toplantı nisabı sağlanamadı">Oylama açılamaz. İkinci toplantı tarihini çağrıdaki kurala göre belirleyin; ikinci toplantıda "Hazırlık" sekmesinden "İkinci toplantı"yı işaretleyin.</Alert>}
      <div className="card">
        <div className="card__head"><span className="card__title">Hazirun</span><span className="card__meta ml-auto">{a.attendance.length}/{a.roster.length} bölüm</span></div>
        <div className="card__body card__body--flush">
          <FormError error={att.error} />
          <div className="table-wrap"><table className="data"><caption className="visually-hidden">Hazirun cetveli</caption>
            <thead><tr><th scope="col">Bölüm</th><th scope="col">Malik</th><th scope="col" className="right">Arsa payı</th><th scope="col">Katılım</th></tr></thead>
            <tbody>{a.roster.map((u) => { const p = present.get(u.unit_id); return (
              <tr key={u.unit_id}>
                <td className="nowrap">{u.block_name} · {u.unit_name}</td>
                <td className="small">{u.owners.join(", ")}</td>
                <td className="right num small">{u.share}/{u.share_den}</td>
                <td>{p ? <><Badge tone="ok">{p.mode === "self" ? "Kendisi" : `Vekil: ${p.proxy_name}`}</Badge>{manage && !anyOpen && !done && <button className="btn btn--ghost btn--sm" type="button" onClick={() => att.mutate({ unit_id: u.unit_id, mode: null })}>Çıkar</button>}</> : manage && !anyOpen && !done ? (
                  <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
                    <button className="btn btn--sm" type="button" onClick={() => att.mutate({ unit_id: u.unit_id, mode: "self" })}>Kendisi</button>
                    <input className="field__input" style={{ width: "9rem", minHeight: 36 }} aria-label={`${u.unit_name} vekil adı`} placeholder="Vekil adı" value={proxy[u.unit_id] ?? ""} onChange={(e) => setProxy((x) => ({ ...x, [u.unit_id]: e.target.value }))} />
                    <button className="btn btn--sm" type="button" disabled={!(proxy[u.unit_id] ?? "").trim()} onClick={() => att.mutate({ unit_id: u.unit_id, mode: "proxy", proxy_name: proxy[u.unit_id] })}>Vekille</button>
                  </div>
                ) : <span className="small muted">Katılmadı</span>}</td>
              </tr>
            ); })}</tbody>
          </table></div>
        </div>
        <div className="card__foot xs muted">Fiziki vekâlette kâğıt vekâletname salonda kontrol edilir. Dijital vekâlet ve uygulamadan katılım/oy, hukuki teyit ve SMS doğrulaması gelince açılacak.</div>
      </div>
      {m.agenda.map((i) => <ItemVoting key={i.id} m={m} a={a} itemId={i.id} title={`${i.order}. ${i.title}`} manage={manage && !done} quorumOk={q.ok} />)}
    </div>
  );
}

function ItemVoting({ m, a, itemId, title, manage, quorumOk }: { m: Meeting; a: Assembly; itemId: string; title: string; manage: boolean; quorumOk: boolean }) {
  const v = a.votes[itemId] ?? { status: "none", ballots: {}, result: null, live: null };
  const t = a.settings.decision_types.find((x) => x.code === (a.item_types[itemId] ?? "ordinary"));
  const open = useSiteMutation<Record<string, never>, Assembly>("POST", `/meetings/${m.id}/assembly/items/${itemId}/open`);
  const ballot = useSiteMutation<{ ballots: Record<string, string | null> }, Assembly>("PUT", `/meetings/${m.id}/assembly/items/${itemId}/ballots`);
  const close = useSiteMutation<Record<string, never>, Assembly>("POST", `/meetings/${m.id}/assembly/items/${itemId}/close`, { onSuccess: () => ballot.reset() });
  const presentUnits = a.roster.filter((u) => a.attendance.some((x) => x.unit_id === u.unit_id));
  const r = v.status === "closed" ? v.result : v.live;
  const setAll = (val: string) => ballot.mutate({ ballots: Object.fromEntries(presentUnits.map((u) => [u.unit_id, val])) });
  // Malik (kişi) tek oy kullanır: bir bölümüne verilen oy, katılan diğer bölümlerine de yazılır
  const setOne = (u: Roster, val: string) => ballot.mutate({ ballots: Object.fromEntries(presentUnits.filter((x) => x.key === u.key).map((x) => [x.unit_id, val])) });
  return (
    <div className="card">
      <div className="card__head"><span className="card__icon"><Gavel aria-hidden="true" /></span><span className="card__title">{title}</span><span className="ml-auto">{v.status === "closed" ? (v.result!.accepted ? <Badge tone="ok">Kabul</Badge> : <Badge tone="danger">Ret</Badge>) : v.status === "open" ? <Badge tone="warn">Oylama açık</Badge> : <Badge tone="muted">Oylanmadı</Badge>}</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-2)" }}>
        <div className="small muted">{t?.name}</div>
        <FormError error={open.error ?? close.error ?? ballot.error} />
        {v.status === "none" && manage && <div><button className="btn btn--sm btn--primary" type="button" disabled={!quorumOk || open.isPending} onClick={() => open.mutate({})}>Oylamayı aç</button></div>}
        {v.status === "open" && manage && (
          <>
            <div className="row" style={{ gap: "var(--s-2)", flexWrap: "wrap" }}><span className="small">Tümünü işaretle:</span>{Object.entries(VOTE).map(([k, l]) => <button key={k} className="btn btn--sm" type="button" disabled={ballot.isPending} onClick={() => setAll(k)}>{l}</button>)}</div>
            <div className="table-wrap"><table className="data"><caption className="visually-hidden">{title} oyları</caption>
              <thead><tr><th scope="col">Bölüm / malik</th><th scope="col">Oy</th></tr></thead>
              <tbody>{presentUnits.map((u) => (
                <tr key={u.unit_id}><td className="small">{u.unit_name} · {u.owners.join(", ")}</td>
                  <td><div className="row" role="radiogroup" aria-label={`${u.unit_name} oyu`} style={{ gap: 4 }}>{Object.entries(VOTE).map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={v.ballots[u.unit_id] === k} className={`btn btn--sm${v.ballots[u.unit_id] === k ? " btn--primary" : ""}`} disabled={ballot.isPending} onClick={() => setOne(u, k)}>{l}</button>)}</div></td></tr>
              ))}</tbody>
            </table></div>
          </>
        )}
        {r && <ResultBox r={r} live={v.status === "open"} />}
        {v.status === "open" && manage && <div><button className="btn btn--primary btn--sm" type="button" disabled={close.isPending} onClick={() => close.mutate({})}>Oylamayı kapat</button></div>}
      </div>
    </div>
  );
}

function ResultBox({ r, live }: { r: Result; live: boolean }) {
  const ok = (b: boolean | null) => (b == null ? "aranmaz" : b ? "sağlandı ✓" : "sağlanamadı ✗");
  return (
    <div className="stack" style={{ gap: 2, background: "var(--bg-sunken)", borderRadius: 8, padding: "var(--s-2)" }}>
      {live && <div className="xs muted">Anlık sayım</div>}
      <div className="small">Kişi: {r.persons.for} kabul · {r.persons.against} ret · {r.persons.abstain} çekimser — taban {r.persons.base} → {ok(r.person_ok)}</div>
      <div className="small">Arsa payı: kabul {pct(r.shares.for, 1)} · ret {pct(r.shares.against, 1)} · çekimser {pct(r.shares.abstain, 1)} — taban {pct(r.shares.base, 1)} → {ok(r.share_ok)}</div>
      {!live && <div className="small strong">Sonuç: {r.accepted ? "KABUL" : "RET"}</div>}
    </div>
  );
}

function Minutes({ m, a, manage, siteName }: { m: Meeting; a: Assembly; manage: boolean; siteName: string }) {
  const [notes, setNotes] = useState(a.minutes.notes);
  const [decs, setDecs] = useState(a.minutes.decisions);
  const [opening, setOpening] = useState(a.minutes.opening);
  const [file, setFile] = useState("");
  const save = useSiteMutation<Record<string, unknown>, Assembly>("PUT", `/meetings/${m.id}/assembly/minutes`);
  const fin = useSiteMutation<Record<string, never>, Assembly>("POST", `/meetings/${m.id}/assembly/minutes/finalize`);
  const signed = useSiteMutation<{ file_name: string }, Assembly>("POST", `/meetings/${m.id}/assembly/minutes/signed`);
  const done = !!a.minutes.finalized_at;
  const q = a.quorum;
  const proxies = a.attendance.filter((x) => x.mode === "proxy").length;
  return (
    <div className="stack">
      <article className="card doc-print" aria-label="Genel kurul tutanağı">
        <div className="card__body stack" style={{ gap: "var(--s-3)", lineHeight: 1.7 }}>
          <header style={{ textAlign: "center" }}><div className="strong">{siteName}</div><h1 style={{ margin: 0, fontSize: "1.2rem" }}>{meetingKind(m.kind)} toplantı tutanağı</h1><div className="small">{formatDateTime(m.scheduled_at)} · {m.location} · {FORMAT[a.format]}</div></header>
          <p className="mb-0"><strong>Hazirun:</strong> {q.persons_total} malikten {q.persons_present}'i (arsa payının {pct(q.share_present, q.share_total)}'i) katıldı{proxies ? `; ${proxies} bölüm vekille temsil edildi` : ""}. Toplantı nisabı {q.second_call ? "aranmadı (ikinci toplantı)" : q.ok ? "sağlandı" : "sağlanamadı"}.</p>
          {!done && manage ? <Field label="Açılış ve divan notu">{(p) => <textarea {...p} className="field__input print-hide" rows={2} value={opening} onChange={(e) => setOpening(e.target.value)} />}</Field> : a.minutes.opening && <p className="mb-0">{a.minutes.opening}</p>}
          <ol className="stack" style={{ gap: "var(--s-3)", paddingLeft: "1.25rem", margin: 0 }}>
            {m.agenda.map((i) => { const v = a.votes[i.id]; const r = v?.status === "closed" ? v.result : null; return (
              <li key={i.id}>
                <div className="strong">{i.title}</div>
                {r ? <div className="small">{r.type_name} · kişi {r.persons.for}/{r.persons.against}/{r.persons.abstain} (kabul/ret/çekimser), arsa payı kabul {pct(r.shares.for, 1)} → <strong>{r.accepted ? "KABUL" : "RET"}</strong></div> : <div className="small muted">Oylaması kapanmadı.</div>}
                {!done && manage ? (
                  <div className="stack print-hide" style={{ gap: 4 }}>
                    <Field label="Görüşme notu">{(p) => <textarea {...p} className="field__input" rows={2} value={notes[i.id] ?? ""} onChange={(e) => setNotes((x) => ({ ...x, [i.id]: e.target.value }))} />}</Field>
                    <Field label="Karar metni">{(p) => <input {...p} className="field__input" maxLength={500} placeholder={r ? (r.accepted ? "Kabul edildi." : "Reddedildi.") : ""} value={decs[i.id] ?? ""} onChange={(e) => setDecs((x) => ({ ...x, [i.id]: e.target.value }))} />}</Field>
                  </div>
                ) : <>{a.minutes.notes[i.id] && <p className="small mb-0">{a.minutes.notes[i.id]}</p>}{(a.minutes.decisions[i.id] || r) && <p className="mb-0">{a.minutes.decisions[i.id] || (r?.accepted ? "Kabul edildi." : "Reddedildi.")}</p>}</>}
              </li>
            ); })}
          </ol>
          {done && <p className="small muted mb-0">Tutanak {a.minutes.finalized_by} tarafından {formatDateTime(a.minutes.finalized_at)} tarihinde kesinleştirildi; sonuç ve oy sayıları değiştirilemez.</p>}
          <div className="grid grid--2" style={{ marginTop: "var(--s-4)" }}>{["Divan başkanı", "Yazman", "Oy toplayıcı"].map((x) => <div key={x} className="small" style={{ borderTop: "1px solid var(--line)", paddingTop: "var(--s-2)" }}>{x}<br />Ad soyad / imza</div>)}</div>
        </div>
      </article>
      <div className="card print-hide"><div className="card__body stack" style={{ gap: "var(--s-2)" }}>
        <FormError error={save.error ?? fin.error ?? signed.error} />
        {!done && manage && <div className="row" style={{ gap: "var(--s-2)", flexWrap: "wrap" }}>
          <button className="btn" type="button" disabled={save.isPending} onClick={() => save.mutate({ notes, decisions: decs, opening })}>Taslağı kaydet</button>
          <ConfirmButton className="btn btn--primary" title="Tutanağı kesinleştir" confirmLabel="Kesinleştir" body={<p className="mb-0">Sonuçlar toplantıya yazılır, kabul edilen kararlar karar defterine sıra numarasıyla işlenir. Sonra değiştirilemez.</p>} onConfirm={async () => { await save.mutateAsync({ notes, decisions: decs, opening }); return fin.mutateAsync({}); }}>Tutanağı kesinleştir</ConfirmButton>
        </div>}
        {done && <>
          <div className="row" style={{ gap: "var(--s-2)", flexWrap: "wrap" }}><button className="btn" type="button" onClick={() => window.print()}><Printer aria-hidden="true" /> Yazdır / PDF</button></div>
          {a.minutes.signed_file ? <div className="small">İmzalı tutanak: {a.minutes.signed_file}</div> : manage && <div className="row" style={{ gap: "var(--s-2)", alignItems: "flex-end", flexWrap: "wrap" }}><Field label="İmzalı tutanak" hint="Dosya deposu gelince yükleme; şimdilik dosya adı" error={fieldError(signed.error, "file_name")}>{(p) => <input {...p} className="field__input" value={file} onChange={(e) => setFile(e.target.value)} placeholder="tutanak-imzali.pdf" />}</Field><button className="btn btn--sm" type="button" disabled={!file || signed.isPending} onClick={() => signed.mutate({ file_name: file })}>Kaydet</button></div>}
          <p className="xs muted mb-0">Malik ve kiracılara karar özeti duyurusu Duyurular'dan yayınlanabilir.</p>
        </>}
      </div></div>
    </div>
  );
}

/** Karar defteri (TOP-04): kesinleşen kararlar sıra numarasıyla. */
export function DecisionBookPage() {
  const { site } = useSite();
  const q = useSiteGet<BookEntry[]>("/decision-book");
  return (
    <div className="stack">
      <PageHead title="Karar defteri" subtitle="Genel kurulda kesinleşen kararlar sıra numarasıyla." actions={<button className="btn print-hide" type="button" onClick={() => window.print()}><Printer aria-hidden="true" /> Yazdır</button>} />
      {q.isError ? null : !q.data ? (
        <div className="grid grid--kpi print-hide">{[0, 1, 2].map((i) => <div key={i} className="skeleton skel__kpi" />)}</div>
      ) : (() => {
        const last = [...q.data].sort((a, b) => b.date.localeCompare(a.date))[0];
        const types = [...new Set(q.data.map((e) => e.type_name))];
        return (
          <>
            <div className="grid grid--kpi rise print-hide">
              <Kpi label="Kesinleşen karar" tone="accent" icon={<Gavel aria-hidden="true" />} value={q.data.length} note="defterde sıra numarasıyla" />
              <Kpi label="Toplantı" icon={<CalendarDays aria-hidden="true" />} value={new Set(q.data.map((e) => e.meeting_id)).size} note="kararın alındığı genel kurul" />
              <Kpi label="Son karar" icon={<BookOpen aria-hidden="true" />} value={last ? formatDate(last.date) : "—"} small note={last ? `No ${last.no} · ${last.item_title}` : "henüz karar yok"} />
            </div>
            {types.length > 1 && (
              <div className="card print-hide">
                <div className="card__head"><span className="card__icon card__icon--accent"><PieChart aria-hidden="true" /></span><span className="card__title">Karar türleri</span></div>
                <div className="card__body"><Donut label="Karar türleri" centerSub="karar" segments={types.map((t) => ({ label: t, value: q.data.filter((e) => e.type_name === t).length }))} /></div>
              </div>
            )}
          </>
        );
      })()}
      <div className="card doc-print">
        <div className="card__head print-hide"><span className="card__icon card__icon--accent"><BookOpen aria-hidden="true" /></span><span className="card__title">Kararlar</span>{q.data && <span className="card__meta ml-auto">{q.data.length} karar</span>}</div>
        <div className="card__body card__body--flush">
        {q.isPending ? <Loading /> : q.isError ? <div className="card__body"><ErrorState error={q.error} /></div> : q.data.length === 0 ? <Empty title="Karar yok" icon={<BookOpen aria-hidden="true" />} /> : (
          <div className="table-wrap"><table className="data"><caption className="visually-hidden">Karar defteri</caption>
            <thead><tr><th scope="col" className="right">No</th><th scope="col">Tarih</th><th scope="col">Toplantı / madde</th><th scope="col">Karar</th></tr></thead>
            <tbody>{q.data.map((e) => <tr key={e.no}><td className="right num strong">{e.no}</td><td className="small nowrap">{formatDate(e.date)}</td><td><Link className="cell-main" to={`/s/${site.slug}/toplantilar/${e.meeting_id}/genel-kurul?sekme=tutanak`}>{e.meeting_title}</Link><div className="cell-sub">{e.item_title} · {e.type_name}</div></td><td className="small">{e.decision}</td></tr>)}</tbody>
          </table></div>
        )}
      </div></div>
    </div>
  );
}
