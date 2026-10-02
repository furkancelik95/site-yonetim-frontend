import { useRef, useState, type DragEvent } from "react";
import { Link } from "react-router";
import { List } from "lucide-react";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { Page, Schemas } from "../../api/types";
import { Badge, ErrorState, FormError, Loading, PageHead } from "../../components/ui";
import { formatDateTime } from "../../lib/format";
import { priorityTone, requestCategory, requestPriority, requestStatus } from "../../lib/labels";
import { P, useSite } from "../../site/SiteContext";

type Req = Schemas["RequestOut"];
type Status = Req["status"];

// Panoda aktif akış; kapanan/iptal edilenler listede görünür
const COLUMNS: Status[] = ["open", "in_progress", "waiting", "resolved"];
const NEEDS_RESOLUTION = new Set<Status>(["resolved", "closed"]);

/**
 * Talep panosu (Apsiyon "İş Takip Panosu" karşılığı). Yeni servis gerekmez: mevcut liste ve
 * durum değiştirme uçları kullanılır. Sürükle-bırakın klavye karşılığı kart üstündeki "Taşı" seçimi.
 */
export function RequestBoardPage() {
  const { site, can } = useSite();
  const canMove = can(P.requestsAssign);
  const cols = {
    open: useSiteGet<Page<Req>>("/requests", { status: "open", page_size: 100 }),
    in_progress: useSiteGet<Page<Req>>("/requests", { status: "in_progress", page_size: 100 }),
    waiting: useSiteGet<Page<Req>>("/requests", { status: "waiting", page_size: 100 }),
    resolved: useSiteGet<Page<Req>>("/requests", { status: "resolved", page_size: 100 }),
  } as Record<string, ReturnType<typeof useSiteGet<Page<Req>>>>;
  const [pending, setPending] = useState<{ req: Req; to: Status } | null>(null);
  const [over, setOver] = useState<Status | null>(null);
  const dragged = useRef<Req | null>(null);

  const move = useSiteMutation<{ id: string; status: Status; resolution: string | null }, unknown>("POST", (v) => `/requests/${v.id}/status`);

  function requestMove(req: Req, to: Status) {
    if (req.status === to) return;
    if (NEEDS_RESOLUTION.has(to)) setPending({ req, to });
    else move.mutate({ id: req.id, status: to, resolution: null });
  }

  const onDrop = (to: Status) => (e: DragEvent) => {
    e.preventDefault();
    setOver(null);
    if (dragged.current) requestMove(dragged.current, to);
    dragged.current = null;
  };

  const anyError = Object.values(cols).find((c) => c.isError);

  return (
    <div className="stack">
      <PageHead
        title="Talep panosu"
        subtitle={canMove ? "Kartı sürükleyerek ya da \"Taşı\" seçimiyle durumunu değiştirin." : "Taleplerin duruma göre dağılımı."}
        actions={<Link className="btn" to={`/s/${site.slug}/talepler`}><List aria-hidden="true" /> Liste görünümü</Link>}
      />
      <FormError error={move.error} />
      {anyError && <ErrorState error={anyError.error} />}

      <div className="board" role="list">
        {COLUMNS.map((status) => {
          const q = cols[status]!;
          return (
            <section
              key={status}
              className={`board__col${over === status ? " board__col--over" : ""}`}
              aria-label={`${requestStatus(status)} sütunu`}
              onDragOver={canMove ? (e) => { e.preventDefault(); setOver(status); } : undefined}
              onDragLeave={() => setOver((x) => (x === status ? null : x))}
              onDrop={canMove ? onDrop(status) : undefined}
            >
              <header className="board__head">
                <span>{requestStatus(status)}</span>
                <span className="board__count">{q.data?.total ?? "…"}</span>
              </header>
              {q.isPending ? <Loading /> : (
                <div className="board__cards" role="list">
                  {q.data?.items.map((r) => (
                    <article
                      key={r.id}
                      role="listitem"
                      className={`board__card${r.priority === "urgent" ? " board__card--urgent" : ""}`}
                      draggable={canMove}
                      onDragStart={() => { dragged.current = r; }}
                    >
                      <Link to={`/s/${site.slug}/talepler/${r.id}`} className="cell-main">#{r.number} {r.title}</Link>
                      <div className="cell-sub">{r.unit_name ?? r.location ?? "Ortak alan"} · {requestCategory(r.category)}</div>
                      <div className="row" style={{ gap: "var(--s-1)", marginTop: "var(--s-2)" }}>
                        {(r.priority === "high" || r.priority === "urgent") && <Badge tone={priorityTone(r.priority)}>{requestPriority(r.priority)}</Badge>}
                        {r.assigned_to && <Badge tone="info">{r.assigned_to}</Badge>}
                      </div>
                      <div className="row row--between" style={{ marginTop: "var(--s-2)" }}>
                        <span className="xs muted">{formatDateTime(r.created_at)}</span>
                        {canMove && (
                          <select
                            className="board__move"
                            aria-label={`#${r.number} talebini taşı`}
                            value=""
                            disabled={move.isPending}
                            onChange={(e) => requestMove(r, e.target.value as Status)}
                          >
                            <option value="" disabled>Taşı…</option>
                            {[...COLUMNS, "closed", "cancelled"].filter((s) => s !== r.status).map((s) => <option key={s} value={s}>{requestStatus(s)}</option>)}
                          </select>
                        )}
                      </div>
                    </article>
                  ))}
                  {q.data?.items.length === 0 && <p className="xs muted" style={{ textAlign: "center", margin: "var(--s-4) 0" }}>Boş</p>}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {pending && (
        <ResolutionDialog
          req={pending.req}
          to={pending.to}
          busy={move.isPending}
          onCancel={() => setPending(null)}
          onConfirm={(resolution) => move.mutateAsync({ id: pending.req.id, status: pending.to, resolution }).then(() => setPending(null))}
        />
      )}
    </div>
  );
}

/** Çözüldü/kapandı için çözüm notu zorunlu (backend kuralı) — taşırken sorulur. */
function ResolutionDialog({ req, to, busy, onCancel, onConfirm }: { req: Req; to: Status; busy: boolean; onCancel: () => void; onConfirm: (r: string) => Promise<unknown> }) {
  const [text, setText] = useState("");
  const [err, setErr] = useState<string>();
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <dialog ref={(el) => { ref.current = el; if (el && !el.open) el.showModal(); }} className="dialog" onClose={onCancel}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return setErr("Çözüm notu zorunlu.");
          onConfirm(text.trim()).catch(() => {});
        }}
      >
        <div className="dialog__body">
          <h2 className="dialog__title">#{req.number} → {requestStatus(to)}</h2>
          <div className="field">
            <label className="field__label" htmlFor="res-text">Çözüm notu *</label>
            <textarea id="res-text" className="field__input" rows={3} value={text} onChange={(e) => setText(e.target.value)} aria-invalid={err ? true : undefined} autoFocus />
            {err && <span className="field__error" role="alert">{err}</span>}
          </div>
        </div>
        <div className="dialog__foot">
          <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={busy}>Vazgeç</button>
          <button type="submit" className="btn btn--primary" disabled={busy} aria-busy={busy || undefined}>Kaydet</button>
        </div>
      </form>
    </dialog>
  );
}
