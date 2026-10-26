import { useEffect, useState, type FormEvent } from "react";
import { GitMerge, Pencil, Users } from "lucide-react";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { Page, Schemas } from "../../api/types";
import { CustomValuesCard } from "../../components/CustomValuesCard";
import { MaskedContact } from "../../components/MaskedContact";
import { Alert, ConfirmButton, Empty, ErrorState, Field, FormError, Loading, PageHead, Pager, SubmitButton, fieldError } from "../../components/ui";
import { useDebounced, useUrlState } from "../../lib/hooks";
import { P, useSite } from "../../site/SiteContext";

type Person = Schemas["PersonOut"];
type DuplicateGroup = Schemas["DuplicateGroupOut"];

/** Kişiler (YAP-04): arama, düzenleme, mükerrer kayıt önerisi ve birleştirme. İletişim bilgisi maskeli. */
export function PeoplePage() {
  const { can } = useSite();
  const [s, set] = useUrlState({ q: "", page: "1" });
  const [search, setSearch] = useState(s.q);
  const q = useDebounced(search, 300);
  useEffect(() => { if (q !== s.q) set({ q, page: "1" }); }, [q]);
  const list = useSiteGet<Page<Person>>("/people", { q: s.q || undefined, page: s.page, page_size: 50 });
  const [editing, setEditing] = useState<Person | null>(null);
  const manage = can(P.peopleManage);
  return (
    <div className="stack">
      <PageHead title="Kişiler" subtitle="Malik, kiracı ve oturanlar. Telefon ve e-posta maskeli gösterilir; açmak denetim kaydına yazılır." />
      {manage && <Duplicates />}
      <div className="filters"><div className="field"><label className="field__label" htmlFor="p-q">Ara</label><input id="p-q" className="field__input" type="search" placeholder="Ad soyad" value={search} onChange={(e) => setSearch(e.target.value)} /></div></div>
      {editing && <PersonForm p={editing} onDone={() => setEditing(null)} />}
      <div className="card">
        <div className="card__body card__body--flush">
          {list.isPending ? <Loading /> : list.isError ? <div className="card__body"><ErrorState error={list.error} onRetry={() => list.refetch()} /></div> : list.data.items.length === 0 ? <Empty title="Kişi bulunamadı" icon={<Users aria-hidden="true" />} /> : (
            <div className="table-wrap"><table className="data">
              <caption className="visually-hidden">Kişiler</caption>
              <thead><tr><th scope="col">Kişi</th><th scope="col">İletişim</th>{manage && <th scope="col"><span className="visually-hidden">İşlem</span></th>}</tr></thead>
              <tbody>{list.data.items.map((p) => (
                <tr key={p.id}>
                  <td className="cell-main">{p.full_name}</td>
                  <td><MaskedContact personId={p.id} phone={p.phone} email={p.email} /></td>
                  {manage && <td className="right"><button className="btn btn--ghost btn--sm btn--icon" type="button" aria-label={`${p.full_name} düzenle`} onClick={() => setEditing(p)}><Pencil aria-hidden="true" /></button></td>}
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </div>
        {list.data && list.data.total > list.data.page_size && <div className="card__foot"><Pager page={list.data.page} pageSize={list.data.page_size} total={list.data.total} onPage={(p) => set({ page: String(p) })} /></div>}
      </div>
    </div>
  );
}

function PersonForm({ p, onDone }: { p: Person; onDone: () => void }) {
  // İletişim maskeli gelir; alan boş bırakılırsa değişmez, yalnız yazılan yeni değer gönderilir.
  const [f, setF] = useState({ first_name: p.first_name, last_name: p.last_name, phone: "", email: "" });
  const m = useSiteMutation<Record<string, unknown>, Person>("PATCH", `/people/${p.id}`, { onSuccess: onDone });
  function submit(e: FormEvent) {
    e.preventDefault();
    const body: Record<string, unknown> = { first_name: f.first_name.trim(), last_name: f.last_name.trim() };
    if (f.phone.trim()) body.phone = f.phone.trim();
    if (f.email.trim()) body.email = f.email.trim().toLocaleLowerCase("tr-TR");
    m.mutate(body);
  }
  return (
    <form className="card" onSubmit={submit} noValidate>
      <div className="card__head"><span className="card__title">{p.full_name} — düzenle</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-4)" }}>
        <FormError error={m.error} />
        <div className="grid grid--kpi">
          <Field label="Ad" required error={fieldError(m.error, "first_name")}>{(x) => <input {...x} className="field__input" value={f.first_name} onChange={(e) => setF((v) => ({ ...v, first_name: e.target.value }))} />}</Field>
          <Field label="Soyad" required error={fieldError(m.error, "last_name")}>{(x) => <input {...x} className="field__input" value={f.last_name} onChange={(e) => setF((v) => ({ ...v, last_name: e.target.value }))} />}</Field>
          <Field label="Telefon" hint={p.phone ? `Kayıtlı: ${p.phone} — değiştirmek için yazın` : undefined} error={fieldError(m.error, "phone")}>{(x) => <input {...x} className="field__input" type="tel" inputMode="tel" placeholder="+90 5XX XXX XX XX" value={f.phone} onChange={(e) => setF((v) => ({ ...v, phone: e.target.value }))} />}</Field>
          <Field label="E-posta" hint={p.email ? `Kayıtlı: ${p.email} — değiştirmek için yazın` : undefined} error={fieldError(m.error, "email")}>{(x) => <input {...x} className="field__input" type="email" inputMode="email" value={f.email} onChange={(e) => setF((v) => ({ ...v, email: e.target.value }))} />}</Field>
        </div>
        <CustomValuesCard entity="person" id={p.id} />
      </div>
      <div className="card__foot row" style={{ gap: "var(--s-2)" }}><SubmitButton busy={m.isPending} disabled={!f.first_name.trim() || !f.last_name.trim()}>Kaydet</SubmitButton><button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button></div>
    </form>
  );
}

/** Aynı telefon ya da e-postayla iki kayıt: sistem önerir, otomatik birleştirme yok; yönetici onaylar, geri alınamaz. */
function Duplicates() {
  const q = useSiteGet<DuplicateGroup[]>("/people/duplicates");
  const merge = useSiteMutation<{ keep_id: string; merge_id: string }, unknown>("POST", "/people/merge");
  const [keep, setKeep] = useState<Record<string, string>>({});
  if (!q.data || q.data.length === 0) return null;
  return (
    <div className="card">
      <div className="card__head"><span className="card__icon card__icon--warn"><GitMerge aria-hidden="true" /></span><span className="card__title">Mükerrer olabilecek kayıtlar</span><span className="card__meta ml-auto">{q.data.length} grup</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <Alert tone="info">Aynı {q.data.some((g) => g.kind === "phone") ? "telefon" : "e-posta"} ile birden çok kişi kaydı var. Birleştirince ilişkiler, geçmiş ve belgeler tek kişide toplanır; işlem geri alınamaz.</Alert>
        {q.data.map((g) => {
          const k = keep[g.key] ?? g.people[0]!.id;
          return (
            <div key={g.key} className="stack" style={{ gap: "var(--s-2)", border: "1px solid var(--line)", borderRadius: "var(--r-md)", padding: "var(--s-3)" }}>
              <div className="small muted">Ortak {g.kind === "phone" ? "telefon" : "e-posta"}: <span className="mono">{g.key}</span></div>
              <fieldset style={{ border: 0, padding: 0, margin: 0 }}><legend className="visually-hidden">Hangi kayıt kalsın</legend>
                {g.people.map((p) => <label key={p.id} className="check" style={{ minHeight: 36 }}><input type="radio" name={`keep-${g.key}`} checked={k === p.id} onChange={() => setKeep((x) => ({ ...x, [g.key]: p.id }))} /><span>{p.full_name} <span className="muted">· {[p.phone, p.email].filter(Boolean).join(" · ")}</span>{k === p.id && <span className="muted"> (kalacak)</span>}</span></label>)}
              </fieldset>
              <div className="row" style={{ gap: "var(--s-2)" }}>
                {g.people.filter((p) => p.id !== k).map((p) => (
                  <ConfirmButton key={p.id} className="btn btn--sm" danger title={`${p.full_name} kaydını birleştir`} confirmLabel="Birleştir (geri alınamaz)" body={`${p.full_name} kaydındaki tüm ilişkiler ve geçmiş, seçili kayda taşınır; bu kayıt kaldırılır.`} onConfirm={() => merge.mutateAsync({ keep_id: k, merge_id: p.id })}>
                    <GitMerge aria-hidden="true" /> {p.full_name} kaydını birleştir
                  </ConfirmButton>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
