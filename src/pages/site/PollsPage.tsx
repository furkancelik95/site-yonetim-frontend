import { useState, type FormEvent } from "react";
import { Plus, Trash2, Vote } from "lucide-react";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { Page, Schemas } from "../../api/types";
import { PollResults, QUESTION_KIND, pollPrivacy, type Poll } from "../../components/PollResults";
import { Alert, Badge, ConfirmButton, Empty, ErrorState, Field, FormError, Loading, PageHead, Pager, SubmitButton, fieldError } from "../../components/ui";
import { formatDate, formatDateTime, todayIso } from "../../lib/format";
import { useUrlState } from "../../lib/hooks";
import { pollAudience } from "../../lib/labels";
import { P, useSite } from "../../site/SiteContext";

type NamedResponse = Schemas["PollNamedResponse"];

/** Anketler (ILT-03, K31): yönetim sorar; gizlilik anket bazında (anonim / isimli, bölüm / kişi başına).
 * Sonuç danışma niteliğindedir, resmî oylama değildir. */
export function PollsPage() {
  const { can } = useSite();
  const [s, set] = useUrlState({ durum: "open", page: "1" });
  const q = useSiteGet<Page<Poll>>("/polls", { status: s.durum, page: s.page, page_size: 20 });
  const [adding, setAdding] = useState(false);
  const manage = can(P.pollsManage);
  return (
    <div className="stack">
      <PageHead
        title="Anketler"
        subtitle="Sakinlerin görüşünü alın. Anketin anonim mi isimli mi, bölüm başına mı kişi başına mı yanıtlanacağını siz seçersiniz."
        actions={manage && <button className="btn btn--primary" type="button" aria-expanded={adding} onClick={() => setAdding((v) => !v)}><Plus aria-hidden="true" /> Anket aç</button>}
      />
      <Alert tone="info">Anket sonucu danışma niteliğindedir; resmî oylama ve genel kurul kararı yerine geçmez. Bağlayıcı karar için toplantı planlayın.</Alert>
      {adding && <NewPoll onDone={() => setAdding(false)} />}

      <div className="row" role="tablist" aria-label="Anket durumu" style={{ gap: "var(--s-2)" }}>
        {[["open", "Açık"], ["closed", "Kapanan"]].map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={s.durum === k} className={`btn btn--sm${s.durum === k ? " btn--primary" : ""}`} onClick={() => set({ durum: k!, page: "1" })}>{l}</button>
        ))}
      </div>

      {q.isPending ? <Loading /> : q.isError ? <ErrorState error={q.error} /> : q.data.items.length === 0 ? (
        <div className="card"><div className="card__body"><Empty title={s.durum === "open" ? "Açık anket yok" : "Kapanan anket yok"} icon={<Vote aria-hidden="true" />} /></div></div>
      ) : (
        <div className="grid grid--2">
          {q.data.items.map((p) => <PollCard key={p.id} p={p} manage={manage} />)}
        </div>
      )}
      {q.data && q.data.total > q.data.page_size && <Pager page={q.data.page} pageSize={q.data.page_size} total={q.data.total} onPage={(p) => set({ page: String(p) })} />}
    </div>
  );
}

function PollCard({ p, manage }: { p: Poll; manage: boolean }) {
  const close = useSiteMutation<Record<string, never>, Poll>("POST", `/polls/${p.id}/close`);
  const [names, setNames] = useState(false);
  return (
    <div className="card">
      <div className="card__head">
        <span className="card__title">{p.question}</span>
        <span className="ml-auto row" style={{ gap: 4 }}>{!p.is_anonymous && <Badge tone="warn">İsimli</Badge>}{p.status === "open" ? <Badge tone="ok">Açık</Badge> : <Badge>Kapandı</Badge>}</span>
      </div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        {p.description && <p className="small mb-0">{p.description}</p>}
        <PollResults p={p} />
        <div className="small muted">{p.total_votes ?? 0} {p.one_per_unit ? "bölüm" : "kişi"} yanıt verdi · {pollAudience(p.audience)}{p.block_ids.length > 0 && ` · ${p.block_ids.length} blok`} · {p.status === "open" ? "bitiş" : "bitti"} {formatDate(p.ends_on)}</div>
        <div className="xs muted">{pollPrivacy(p)}</div>
        {names && <NamedResponses p={p} />}
      </div>
      {manage && (p.status === "open" || !p.is_anonymous) && (
        <div className="card__foot row" style={{ gap: "var(--s-2)" }}>
          {p.status === "open" && <ConfirmButton className="btn btn--sm" title="Anketi kapat" confirmLabel="Kapat" body="Yanıt verme sona erer, sonuç sakinlere açılır." onConfirm={() => close.mutateAsync({})}>Erken kapat</ConfirmButton>}
          {!p.is_anonymous && <button className="btn btn--sm btn--ghost" type="button" aria-expanded={names} onClick={() => setNames((v) => !v)}>{names ? "İsimli dökümü gizle" : "İsimli döküm"}</button>}
        </div>
      )}
    </div>
  );
}

/** İsimli ankette kim ne yanıtladı (K31) — kişisel veri; yalnız anket yöneticisi, açılış kayda geçer. */
function NamedResponses({ p }: { p: Poll }) {
  const q = useSiteGet<NamedResponse[]>(`/polls/${p.id}/responses`);
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} />;
  if (q.data.length === 0) return <p className="small muted mb-0">Henüz yanıt yok.</p>;
  const label = (qid: string, ids: string[]) => {
    const question = p.questions.find((x) => x.id === qid);
    return ids.map((id) => question?.options.find((o) => o.id === id)?.label ?? "—").join(", ");
  };
  return (
    <div className="table-wrap"><table className="data"><caption className="visually-hidden">İsimli yanıtlar</caption>
      <thead><tr><th scope="col">Kişi</th><th scope="col">Bölüm</th><th scope="col">Zaman</th>{p.questions.map((x) => <th key={x.id} scope="col">{x.order}. {x.text}</th>)}</tr></thead>
      <tbody>{q.data.map((r, i) => (
        <tr key={i}><td className="cell-main">{r.person_name}</td><td className="small">{r.unit_name ?? "—"}</td><td className="small num">{formatDateTime(r.at)}</td>
          {p.questions.map((x) => { const a = r.answers.find((y) => y.question_id === x.id); return <td key={x.id} className="small">{!a ? "—" : a.rating != null ? `${a.rating}/5` : a.text ?? label(x.id, a.option_ids)}</td>; })}
        </tr>
      ))}</tbody>
    </table><p className="xs muted">Bu döküm kişisel veridir; açılışı denetim kaydına yazıldı.</p></div>
  );
}

interface QDraft { text: string; kind: string; options: string[]; required: boolean }
const blank = (): QDraft => ({ text: "", kind: "single", options: ["", ""], required: true });

function NewPoll({ onDone }: { onDone: () => void }) {
  const blocks = useSiteGet<Page<{ id: string; name: string }>>("/blocks", { page_size: 200 });
  const [f, setF] = useState({ question: "", description: "", audience: "all", ends_on: "", is_anonymous: true, one_per_unit: true });
  const [blockIds, setBlockIds] = useState<string[]>([]);
  const [qs, setQs] = useState<QDraft[]>([blank()]);
  const m = useSiteMutation<Record<string, unknown>, Poll>("POST", "/polls", { onSuccess: onDone });
  const upQ = (i: number, patch: Partial<QDraft>) => setQs((x) => x.map((y, j) => (j === i ? { ...y, ...patch } : y)));
  function submit(e: FormEvent) {
    e.preventDefault();
    const single = qs.length === 1 && qs[0]!.kind === "single" && !qs[0]!.text.trim();
    m.mutate({
      ...f,
      block_ids: blockIds,
      // Tek soruluk ankette soru metni başlıktır (eski biçim); çoklu soruda her soru ayrı
      ...(single ? { options: qs[0]!.options.map((o) => o.trim()).filter(Boolean) } : {
        questions: qs.map((x) => ({ text: x.text.trim(), kind: x.kind, required: x.required, options: x.kind === "single" || x.kind === "multiple" ? x.options.map((o) => o.trim()).filter(Boolean) : [] })),
      }),
    });
  }
  return (
    <form className="card" onSubmit={submit} noValidate>
      <div className="card__head"><span className="card__title">Anket aç</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        <Field label="Başlık / soru" required error={fieldError(m.error, "question")}>{(p) => <input {...p} className="field__input" maxLength={200} placeholder="ör. Havuz açılış saati değişsin mi?" value={f.question} onChange={(e) => setF((x) => ({ ...x, question: e.target.value }))} />}</Field>
        <Field label="Açıklama" hint="İsteğe bağlı: maliyet, seçeneklerin ayrıntısı">{(p) => <textarea {...p} className="field__input" rows={2} maxLength={1000} value={f.description} onChange={(e) => setF((x) => ({ ...x, description: e.target.value }))} />}</Field>
        {fieldError(m.error, "questions") && <span className="field__error" role="alert">{fieldError(m.error, "questions")}</span>}
        {qs.map((x, i) => {
          const choice = x.kind === "single" || x.kind === "multiple";
          const optErr = fieldError(m.error, qs.length === 1 && !x.text.trim() && x.kind === "single" ? "options" : `questions.${i}.options`);
          return (
            <fieldset key={i} className="stack" style={{ gap: "var(--s-2)", border: "1px solid var(--line)", borderRadius: 8, padding: "var(--s-3)", margin: 0 }}>
              <legend className="field__label">{i + 1}. soru</legend>
              <div className="grid grid--2">
                <Field label="Soru metni" hint={qs.length === 1 ? "Tek soruda boş bırakırsanız başlık soru olur" : undefined} error={fieldError(m.error, `questions.${i}.text`)}>{(p) => <input {...p} className="field__input" maxLength={300} value={x.text} onChange={(e) => upQ(i, { text: e.target.value })} />}</Field>
                <Field label="Tip" error={fieldError(m.error, `questions.${i}.kind`)}>{(p) => <select {...p} className="field__input" value={x.kind} onChange={(e) => upQ(i, { kind: e.target.value })}>{Object.entries(QUESTION_KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>}</Field>
              </div>
              {choice && (
                <div className="stack" style={{ gap: "var(--s-1)" }}>
                  {x.options.map((o, j) => (
                    <div key={j} className="row" style={{ gap: "var(--s-2)", flexWrap: "nowrap" }}>
                      <input aria-label={`${i + 1}. soru, ${j + 1}. seçenek`} className="field__input" style={{ flex: 1, minWidth: 0 }} maxLength={100} value={o} onChange={(e) => upQ(i, { options: x.options.map((y, k) => (k === j ? e.target.value : y)) })} />
                      <button className="btn btn--ghost btn--sm" type="button" aria-label={`${j + 1}. seçeneği kaldır`} disabled={x.options.length <= 2} onClick={() => upQ(i, { options: x.options.filter((_, k) => k !== j) })}><Trash2 aria-hidden="true" /></button>
                    </div>
                  ))}
                  {optErr && <span className="field__error" role="alert">{optErr}</span>}
                  <div><button className="btn btn--sm" type="button" disabled={x.options.length >= 8} onClick={() => upQ(i, { options: [...x.options, ""] })}><Plus aria-hidden="true" /> Seçenek</button></div>
                </div>
              )}
              <div className="row" style={{ gap: "var(--s-3)", flexWrap: "wrap" }}>
                <label className="check"><input type="checkbox" checked={x.required} onChange={(e) => upQ(i, { required: e.target.checked })} /> Zorunlu</label>
                {qs.length > 1 && <button className="btn btn--ghost btn--sm ml-auto" type="button" onClick={() => setQs((y) => y.filter((_, k) => k !== i))}><Trash2 aria-hidden="true" /> Soruyu kaldır</button>}
              </div>
            </fieldset>
          );
        })}
        <div><button className="btn btn--sm" type="button" disabled={qs.length >= 20} onClick={() => setQs((x) => [...x, blank()])}><Plus aria-hidden="true" /> Soru ekle</button></div>
        <div className="grid grid--2">
          <Field label="Kim yanıt verir" required error={fieldError(m.error, "audience")}>{(p) => <select {...p} className="field__input" value={f.audience} onChange={(e) => setF((x) => ({ ...x, audience: e.target.value }))}>{["all", "owners", "tenants"].map((a) => <option key={a} value={a}>{pollAudience(a)}</option>)}</select>}</Field>
          <Field label="Bitiş tarihi" required error={fieldError(m.error, "ends_on")}>{(p) => <input {...p} className="field__input" type="date" min={todayIso()} value={f.ends_on} onChange={(e) => setF((x) => ({ ...x, ends_on: e.target.value }))} />}</Field>
        </div>
        {(blocks.data?.items.length ?? 0) > 1 && (
          <fieldset className="stack" style={{ gap: "var(--s-1)", border: 0, padding: 0, margin: 0 }}>
            <legend className="field__label">Bloklar (boşsa tüm site)</legend>
            <div className="row" style={{ gap: "var(--s-3)", flexWrap: "wrap" }}>{blocks.data!.items.map((b) => <label key={b.id} className="check"><input type="checkbox" checked={blockIds.includes(b.id)} onChange={() => setBlockIds((x) => (x.includes(b.id) ? x.filter((y) => y !== b.id) : [...x, b.id]))} /> {b.name}</label>)}</div>
            {fieldError(m.error, "block_ids") && <span className="field__error" role="alert">{fieldError(m.error, "block_ids")}</span>}
          </fieldset>
        )}
        <fieldset className="stack" style={{ gap: "var(--s-1)", border: 0, padding: 0, margin: 0 }}>
          <legend className="field__label">Gizlilik</legend>
          <label className="check"><input type="radio" name="privacy" checked={f.is_anonymous} onChange={() => setF((x) => ({ ...x, is_anonymous: true }))} /> Anonim — kimin yanıtladığı tutulmaz, yalnız toplamlar</label>
          <label className="check"><input type="radio" name="privacy" checked={!f.is_anonymous} onChange={() => setF((x) => ({ ...x, is_anonymous: false }))} /> İsimli — yanıt verenin adı kaydedilir (kişisel veri; dökümü yalnız anket yöneticisi görür)</label>
          <label className="check" style={{ marginTop: "var(--s-1)" }}><input type="checkbox" checked={f.one_per_unit} onChange={(e) => setF((x) => ({ ...x, one_per_unit: e.target.checked }))} /> Bölüm başına tek yanıt (işaretsizse kişi başına)</label>
        </fieldset>
      </div>
      <div className="card__foot row" style={{ gap: "var(--s-2)" }}>
        <SubmitButton busy={m.isPending}>Anketi aç</SubmitButton>
        <button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button>
      </div>
    </form>
  );
}
