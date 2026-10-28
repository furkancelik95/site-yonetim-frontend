import { useState, type FormEvent } from "react";
import { CalendarClock, CheckCircle2, Plus, Trash2, Users, Vote } from "lucide-react";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { Page } from "../../api/types";
import { PollResults, type Poll } from "../../components/PollResults";
import { Alert, Badge, ConfirmButton, Empty, ErrorState, Field, FormError, Kpi, Loading, PageHead, Pager, SubmitButton, fieldError } from "../../components/ui";
import { formatDate, todayIso } from "../../lib/format";
import { useUrlState } from "../../lib/hooks";
import { pollAudience } from "../../lib/labels";
import { P, useSite } from "../../site/SiteContext";

/** Anketler (Apsiyon "Anket"): yönetim sorar, her bağımsız bölüm bir oy verir. Danışma niteliğindedir. */
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
        eyebrow="İletişim"
        subtitle="Sakinlerin görüşünü alın. Her bağımsız bölüm bir oy verir."
        actions={manage && <button className="btn btn--primary" type="button" aria-expanded={adding} onClick={() => setAdding((v) => !v)}><Plus aria-hidden="true" /> Anket aç</button>}
      >
        <div className="tabs" role="tablist" aria-label="Anket durumu">
          {[["open", "Açık"], ["closed", "Kapanan"]].map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={s.durum === k} className="tabs__tab" onClick={() => set({ durum: k!, page: "1" })}>{l}</button>
          ))}
        </div>
      </PageHead>
      <PollKpis />
      <Alert tone="info">Anket sonucu danışma niteliğindedir; genel kurul kararı yerine geçmez. Bağlayıcı karar için toplantı planlayın.</Alert>
      {adding && <NewPoll onDone={() => setAdding(false)} />}

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

/** Bant altı göstergeler: açık/kapanan anket sayısı, açık anketlerde verilen oy, en yakın bitiş. Kaynak /polls. */
function PollKpis() {
  const open = useSiteGet<Page<Poll>>("/polls", { status: "open", page: 1, page_size: 50 });
  const closed = useSiteGet<Page<Poll>>("/polls", { status: "closed", page: 1, page_size: 1 });
  if (open.isError || closed.isError) return null;
  if (!open.data || !closed.data) {
    return <div className="grid grid--kpi">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton skel__kpi" />)}</div>;
  }
  const votes = open.data.items.reduce((a, p) => a + (p.total_votes ?? 0), 0);
  const next = open.data.items.map((p) => p.ends_on).filter(Boolean).sort()[0];
  const days = next ? Math.ceil((new Date(next + "T23:59:59").getTime() - Date.now()) / 864e5) : null;
  return (
    <div className="grid grid--kpi rise">
      <Kpi label="Açık anket" tone="accent" icon={<Vote aria-hidden="true" />} value={open.data.total} note="oylamaya açık" />
      <Kpi label="Kapanan anket" icon={<CheckCircle2 aria-hidden="true" />} value={closed.data.total} note="sonucu sakinlere açık" />
      <Kpi label="Verilen oy" icon={<Users aria-hidden="true" />} value={votes} note="açık anketlerde, bölüm başına bir oy" />
      <Kpi label="En yakın bitiş" icon={<CalendarClock aria-hidden="true" />} value={next ? formatDate(next) : "—"} small note={days === null ? "açık anket yok" : days <= 0 ? "bugün bitiyor" : `${days} gün kaldı`} />
    </div>
  );
}

function PollCard({ p, manage }: { p: Poll; manage: boolean }) {
  const close = useSiteMutation<Record<string, never>, Poll>("POST", `/polls/${p.id}/close`);
  return (
    <div className="card">
      <div className="card__head">
        <span className={`card__icon ${p.status === "open" ? "card__icon--accent" : "card__icon--ok"}`}><Vote aria-hidden="true" /></span>
        <span className="card__title">{p.question}</span>
        <span className="ml-auto">{p.status === "open" ? <Badge tone="ok">Açık</Badge> : <Badge>Kapandı</Badge>}</span>
      </div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        {p.description && <p className="small mb-0">{p.description}</p>}
        <PollResults p={p} />
        <div className="small muted">{p.total_votes ?? 0} bölüm oy verdi · {pollAudience(p.audience)} · {p.status === "open" ? "bitiş" : "bitti"} {formatDate(p.ends_on)}</div>
      </div>
      {manage && p.status === "open" && (
        <div className="card__foot">
          <ConfirmButton className="btn btn--sm" title="Anketi kapat" confirmLabel="Kapat" body="Oy verme sona erer, sonuç sakinlere açılır." onConfirm={() => close.mutateAsync({})}>Erken kapat</ConfirmButton>
        </div>
      )}
    </div>
  );
}

function NewPoll({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ question: "", description: "", audience: "all", ends_on: "" });
  const [options, setOptions] = useState(["", ""]);
  const m = useSiteMutation<Record<string, unknown>, Poll>("POST", "/polls", { onSuccess: onDone });
  function submit(e: FormEvent) {
    e.preventDefault();
    m.mutate({ ...f, options: options.map((o) => o.trim()).filter(Boolean) });
  }
  return (
    <form className="card" onSubmit={submit} noValidate>
      <div className="card__head"><span className="card__title">Anket aç</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        <Field label="Soru" required error={fieldError(m.error, "question")}>{(p) => <input {...p} className="field__input" maxLength={200} placeholder="ör. Havuz açılış saati değişsin mi?" value={f.question} onChange={(e) => setF((x) => ({ ...x, question: e.target.value }))} />}</Field>
        <Field label="Açıklama" hint="İsteğe bağlı: maliyet, seçeneklerin ayrıntısı">{(p) => <textarea {...p} className="field__input" rows={2} maxLength={1000} value={f.description} onChange={(e) => setF((x) => ({ ...x, description: e.target.value }))} />}</Field>
        <fieldset className="stack" style={{ gap: "var(--s-2)", border: 0, padding: 0, margin: 0 }}>
          <legend className="field__label">Seçenekler * (2–8)</legend>
          {options.map((o, i) => (
            <div key={i} className="row" style={{ gap: "var(--s-2)", flexWrap: "nowrap" }}>
              <input aria-label={`${i + 1}. seçenek`} className="field__input" style={{ flex: 1, minWidth: 0 }} maxLength={100} value={o} onChange={(e) => setOptions((x) => x.map((y, j) => (j === i ? e.target.value : y)))} />
              <button className="btn btn--ghost btn--sm" type="button" aria-label={`${i + 1}. seçeneği kaldır`} disabled={options.length <= 2} onClick={() => setOptions((x) => x.filter((_, j) => j !== i))}><Trash2 aria-hidden="true" /></button>
            </div>
          ))}
          {fieldError(m.error, "options") && <span className="field__error" role="alert">{fieldError(m.error, "options")}</span>}
          <div><button className="btn btn--sm" type="button" disabled={options.length >= 8} onClick={() => setOptions((x) => [...x, ""])}><Plus aria-hidden="true" /> Seçenek ekle</button></div>
        </fieldset>
        <div className="grid grid--2">
          <Field label="Kim oy verir" required error={fieldError(m.error, "audience")}>{(p) => <select {...p} className="field__input" value={f.audience} onChange={(e) => setF((x) => ({ ...x, audience: e.target.value }))}>{["all", "owners", "tenants"].map((a) => <option key={a} value={a}>{pollAudience(a)}</option>)}</select>}</Field>
          <Field label="Bitiş tarihi" required error={fieldError(m.error, "ends_on")}>{(p) => <input {...p} className="field__input" type="date" min={todayIso()} value={f.ends_on} onChange={(e) => setF((x) => ({ ...x, ends_on: e.target.value }))} />}</Field>
        </div>
      </div>
      <div className="card__foot row" style={{ gap: "var(--s-2)" }}>
        <SubmitButton busy={m.isPending}>Anketi aç</SubmitButton>
        <button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button>
      </div>
    </form>
  );
}
