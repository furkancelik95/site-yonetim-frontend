import { useState, type FormEvent } from "react";
import { Megaphone, Pin, Plus } from "lucide-react";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { Page, Schemas } from "../../api/types";
import { Alert, Badge, Empty, ErrorState, Field, FormError, Loading, PageHead, Pager, SubmitButton, fieldError } from "../../components/ui";
import { formatDate, formatDateTime } from "../../lib/format";
import { useUrlState } from "../../lib/hooks";
import { audience, channel, importance, importanceTone } from "../../lib/labels";
import { P, useSite } from "../../site/SiteContext";

type Ann = Schemas["AnnouncementOut"];
type Block = Schemas["BlockOut"];

const AUDIENCES = ["all_residents", "owners_only", "tenants_only", "debtors_only", "blocks"];
const CHANNELS = ["in_app", "email", "sms", "web_push"];

export function AnnouncementsPage() {
  const { can } = useSite();
  const [s, set] = useUrlState({ page: "1" });
  const r = useSiteGet<Page<Ann>>("/announcements", { page: s.page, page_size: 20 });
  const [adding, setAdding] = useState(false);

  return (
    <div className="stack">
      <PageHead
        title="Duyurular"
        subtitle="Sabitlenmiş duyurular üstte, sonra en yeni."
        actions={can(P.announcementsPublish) && <button className="btn btn--primary" type="button" aria-expanded={adding} onClick={() => setAdding((v) => !v)}><Plus aria-hidden="true" /> Duyuru yayınla</button>}
      />
      {adding && <NewAnnouncementForm onDone={() => setAdding(false)} />}

      {r.isPending ? (
        <Loading />
      ) : r.isError ? (
        <ErrorState error={r.error} onRetry={() => r.refetch()} />
      ) : r.data.items.length === 0 ? (
        <div className="card"><Empty title="Henüz duyuru yok" icon={<Megaphone aria-hidden="true" />} /></div>
      ) : (
        <div className="stack" style={{ gap: "var(--s-3)" }}>
          {r.data.items.map((a) => (
            <article key={a.id} className="card">
              <div className="card__head">
                {a.is_pinned && <span className="card__icon card__icon--accent" title="Sabitlendi"><Pin aria-hidden="true" /></span>}
                <h2 className="card__title" style={{ margin: 0 }}>{a.title}</h2>
                {a.importance !== "normal" && <Badge tone={importanceTone(a.importance)}>{importance(a.importance)}</Badge>}
                <span className="card__meta ml-auto">{formatDateTime(a.published_at)}</span>
              </div>
              <div className="card__body">
                <p className="mb-0" style={{ whiteSpace: "pre-wrap" }}>{a.body}</p>
              </div>
              <div className="card__foot row small muted" style={{ gap: "var(--s-3)" }}>
                <span>{audience(a.audience)}</span>
                {a.published_by && <span>· {a.published_by}</span>}
                {a.expires_on && <span>· {formatDate(a.expires_on)} tarihine kadar</span>}
                {a.recipient_count !== null && a.recipient_count !== undefined && (
                  <span className="ml-auto">{a.read_count ?? 0} / {a.recipient_count} kişi okudu</span>
                )}
              </div>
            </article>
          ))}
          <Pager page={r.data.page} pageSize={r.data.page_size} total={r.data.total} onPage={(p) => set({ page: String(p) })} />
        </div>
      )}
    </div>
  );
}

function NewAnnouncementForm({ onDone }: { onDone: () => void }) {
  const blocks = useSiteGet<Page<Block>>("/blocks", { page_size: 200 });
  const [f, setF] = useState({ title: "", body: "", importance: "normal", audience: "all_residents", expires_on: "", is_pinned: false });
  const [blockIds, setBlockIds] = useState<string[]>([]);
  const [channels, setChannels] = useState<string[]>(["in_app"]);
  const m = useSiteMutation<Record<string, unknown>, Ann>("POST", "/announcements", { onSuccess: onDone });
  const up = (k: "title" | "body" | "importance" | "audience" | "expires_on") => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  function submit(e: FormEvent) {
    e.preventDefault();
    m.mutate({
      title: f.title.trim(),
      body: f.body.trim(),
      importance: f.importance,
      audience: f.audience,
      audience_block_ids: f.audience === "blocks" ? blockIds : [],
      channels,
      expires_on: f.expires_on || null,
      is_pinned: f.is_pinned,
    });
  }

  return (
    <form className="card" onSubmit={submit} noValidate>
      <div className="card__head"><span className="card__title">Yeni duyuru</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        <Field label="Başlık" required error={fieldError(m.error, "title")}>{(p) => <input {...p} className="field__input" value={f.title} onChange={up("title")} />}</Field>
        <Field label="Metin" required error={fieldError(m.error, "body")}>{(p) => <textarea {...p} className="field__input" rows={4} value={f.body} onChange={up("body")} />}</Field>
        <div className="grid grid--kpi">
          <Field label="Önem">{(p) => <select {...p} className="field__input" value={f.importance} onChange={up("importance")}>{["normal", "important", "critical"].map((x) => <option key={x} value={x}>{importance(x)}</option>)}</select>}</Field>
          <Field label="Kime">{(p) => <select {...p} className="field__input" value={f.audience} onChange={up("audience")}>{AUDIENCES.map((x) => <option key={x} value={x}>{audience(x)}</option>)}</select>}</Field>
          <Field label="Yayından kalkış" hint="Boşsa süresiz.">{(p) => <input {...p} className="field__input" type="date" value={f.expires_on} onChange={up("expires_on")} />}</Field>
        </div>
        {f.audience === "blocks" && (
          <fieldset className="stack" style={{ gap: "var(--s-2)", border: 0, padding: 0, margin: 0 }}>
            <legend className="field__label">Bloklar</legend>
            <div className="row" style={{ gap: "var(--s-3)" }}>
              {blocks.data?.items.map((b) => (
                <label key={b.id} className="check"><input type="checkbox" checked={blockIds.includes(b.id)} onChange={() => setBlockIds((l) => toggle(l, b.id))} /> {b.name}</label>
              ))}
            </div>
          </fieldset>
        )}
        <fieldset className="stack" style={{ gap: "var(--s-2)", border: 0, padding: 0, margin: 0 }}>
          <legend className="field__label">Kanallar</legend>
          <div className="row" style={{ gap: "var(--s-3)" }}>
            {CHANNELS.map((c) => (
              <label key={c} className="check"><input type="checkbox" checked={channels.includes(c)} onChange={() => setChannels((l) => toggle(l, c))} /> {channel(c)}</label>
            ))}
          </div>
        </fieldset>
        {channels.some((c) => c !== "in_app") && (
          <Alert tone="info">SMS, e-posta ve tarayıcı bildirimi sağlayıcısı henüz seçilmedi; gönderim kaydı tutulur ama dışarıya ileti gitmez.</Alert>
        )}
        <label className="check"><input type="checkbox" checked={f.is_pinned} onChange={(e) => setF((x) => ({ ...x, is_pinned: e.target.checked }))} /> Üste sabitle</label>
      </div>
      <div className="card__foot row" style={{ gap: "var(--s-2)" }}>
        <SubmitButton busy={m.isPending} disabled={!f.title.trim() || !f.body.trim() || channels.length === 0 || (f.audience === "blocks" && blockIds.length === 0)}>Yayınla</SubmitButton>
        <button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button>
      </div>
    </form>
  );
}
