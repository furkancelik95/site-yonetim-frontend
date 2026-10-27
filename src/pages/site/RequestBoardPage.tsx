import { useRef, useState, type DragEvent } from "react";
import { Link } from "react-router";
import { AlertTriangle, Inbox, List, Timer, UserX } from "lucide-react";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { Page, Schemas } from "../../api/types";
import { Avatar, Badge, ErrorState, FormError, Kpi, Loading, PageHead } from "../../components/ui";
import { formatDateTime } from "../../lib/format";
import { categoryIcon } from "../../lib/icons";
import { priorityTone, requestCategory, requestPriority, requestStatus } from "../../lib/labels";
import { P, useSite } from "../../site/SiteContext";
import { useUrlState } from "../../lib/hooks";
import { DepartmentFilter } from "./Departments";
import { SlaBadge } from "./RequestExtras";

type Req = Schemas["RequestOut"];
type Status = Req["status"];

// Panoda aktif akış (K18: Açık → Atandı → İşlemde → Beklemede → Çözüldü); kapanan/iptal edilenler listede görünür
const COLUMNS: Status[] = ["open", "assigned", "in_progress", "waiting", "resolved"];
/** Çözüldü için çözüm notu, iptal için gerekçe zorunlu (backend kuralı). */
const NEEDS_RESOLUTION = new Set<Status>(["resolved", "cancelled"]);
/** Aktif akış: göstergeler bu sütunlardan hesaplanır */
const ACTIVE: Status[] = ["open", "assigned", "in_progress", "waiting"];

/**
 * Talep panosu (Apsiyon "İş Takip Panosu" karşılığı). Mevcut liste ve durum değiştirme uçları
 * kullanılır; kart yalnız dokümandaki akışın izin verdiği sütuna bırakılır (`allowed_transitions`).
 * Sürükle-bırakın klavye karşılığı kart üstündeki "Taşı" seçimi.
 */
export function RequestBoardPage() {
  const { site, can } = useSite();
  const canMove = can(P.requestsAssign);
  const [s, set] = useUrlState({ departman: "" });
  const dep = s.departman;
  const cols = {
    open: useSiteGet<Page<Req>>("/requests", { status: "open", department_id: dep, page_size: 100 }),
    assigned: useSiteGet<Page<Req>>("/requests", { status: "assigned", department_id: dep, page_size: 100 }),
    in_progress: useSiteGet<Page<Req>>("/requests", { status: "in_progress", department_id: dep, page_size: 100 }),
    waiting: useSiteGet<Page<Req>>("/requests", { status: "waiting", department_id: dep, page_size: 100 }),
    resolved: useSiteGet<Page<Req>>("/requests", { status: "resolved", department_id: dep, page_size: 100 }),
  } as Record<string, ReturnType<typeof useSiteGet<Page<Req>>>>;
  const [pending, setPending] = useState<{ req: Req; to: Status } | null>(null);
  const [over, setOver] = useState<Status | null>(null);
  const dragged = useRef<Req | null>(null);

  const move = useSiteMutation<{ id: string; status: Status; resolution: string | null }, unknown>("POST", (v) => `/requests/${v.id}/status`);

  const [denied, setDenied] = useState<string | null>(null);

  function requestMove(req: Req, to: Status) {
    if (req.status === to) return;
    if (!req.allowed_transitions.includes(to)) {
      setDenied(`#${req.number} talep "${requestStatus(req.status)}" durumundan "${requestStatus(to)}" durumuna geçemez.${req.allowed_transitions.length ? ` Geçilebilecek: ${req.allowed_transitions.map((s) => requestStatus(s)).join(", ")}.` : ""}`);
      return;
    }
    setDenied(null);
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
  // Göstergeler panodaki sütunlardan hesaplanır (aktif akış: açık + atandı + işlemde + beklemede)
  const loaded = COLUMNS.every((c) => cols[c]!.data);
  const active = loaded ? ACTIVE.flatMap((c) => cols[c]!.data!.items) : [];
  const activeTotal = ACTIVE.reduce((a, c) => a + (cols[c]!.data?.total ?? 0), 0);
  // Talepler listesiyle aynı tanım: durumu "açık" olan acil talepler
  const urgentN = active.filter((r) => r.priority === "urgent" && r.status === "open").length;
  const unassigned = active.filter((r) => !r.assigned_to && !r.department_name).length;
  const slaRisk = active.filter((r) => r.sla?.state === "warning" || r.sla?.state === "breached").length;

  return (
    <div className="stack">
      <PageHead
        title="Talep panosu"
        eyebrow="Operasyon"
        subtitle={canMove ? "Kartı sürükleyerek ya da \"Taşı\" seçimiyle durumunu değiştirin." : "Taleplerin duruma göre dağılımı."}
        actions={<Link className="btn" to={`/s/${site.slug}/talepler`}><List aria-hidden="true" /> Liste görünümü</Link>}
      >
        <div className="hero__filter"><DepartmentFilter id="b-dep" value={dep} onChange={(v) => set({ departman: v })} /></div>
      </PageHead>
      {loaded ? (
        <div className="grid grid--kpi rise">
          <Kpi label="Aktif talep" icon={<Inbox aria-hidden="true" />} value={activeTotal} note="açık, atandı, işlemde, beklemede" />
          <Kpi label="Acil" tone={urgentN > 0 ? "danger" : undefined} icon={<AlertTriangle aria-hidden="true" />} value={urgentN} note="açık ve acil öncelikli" />
          <Kpi label="SLA riski" tone={slaRisk > 0 ? "warn" : "ok"} icon={<Timer aria-hidden="true" />} value={slaRisk} note="süresi doluyor ya da aşıldı" />
          <Kpi label="Sahipsiz" tone={unassigned > 0 ? "warn" : undefined} icon={<UserX aria-hidden="true" />} value={unassigned} note="kişiye ya da departmana atanmamış" />
        </div>
      ) : (
        <div className="grid grid--kpi">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton skel__kpi" />)}</div>
      )}
      <FormError error={move.error} />
      {denied && <p className="small field__error" role="alert">{denied}</p>}
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
                  {q.data?.items.map((r) => {
                    const Icon = categoryIcon(r.category);
                    return (
                    <article
                      key={r.id}
                      role="listitem"
                      className={`board__card${r.priority === "urgent" ? " board__card--urgent" : ""}`}
                      draggable={canMove && r.allowed_transitions.length > 0}
                      onDragStart={() => { dragged.current = r; }}
                    >
                      <div className="board__top">
                        <span className={`chip chip--sm${r.priority === "urgent" ? " chip--danger" : ""}`} aria-hidden="true"><Icon /></span>
                        <span className="xs muted">{r.category_name || requestCategory(r.category)}</span>
                        <span className="board__no">#{r.number}</span>
                      </div>
                      <Link to={`/s/${site.slug}/talepler/${r.id}`} className="cell-main">{r.title}</Link>
                      <div className="cell-sub">{r.unit_name ?? r.location ?? "Ortak alan"}</div>
                      <div className="req-badges" style={{ marginTop: "var(--s-2)" }}>
                        {(r.priority === "high" || r.priority === "urgent") && <Badge tone={priorityTone(r.priority)}>{requestPriority(r.priority)}</Badge>}
                        <SlaBadge s={r.sla} />
                        {r.department_name && <Badge tone="info">{r.department_name}</Badge>}
                      </div>
                      <div className="row row--between" style={{ marginTop: "var(--s-2)" }}>
                        <span className="row" style={{ gap: "var(--s-2)" }}>
                          {r.assigned_to && <><Avatar name={r.assigned_to} size="sm" soft /><span className="xs">{r.assigned_to}</span></>}
                          {!r.assigned_to && <span className="xs muted">{formatDateTime(r.created_at)}</span>}
                        </span>
                        {canMove && r.allowed_transitions.length > 0 && (
                          <select
                            className="board__move"
                            aria-label={`#${r.number} talebini taşı`}
                            value=""
                            disabled={move.isPending}
                            onChange={(e) => requestMove(r, e.target.value as Status)}
                          >
                            <option value="" disabled>Taşı…</option>
                            {r.allowed_transitions.map((s) => <option key={s} value={s}>{requestStatus(s)}</option>)}
                          </select>
                        )}
                      </div>
                    </article>
                    );
                  })}
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

/** Çözüldü için çözüm notu, iptal için gerekçe zorunlu (backend kuralı) — taşırken sorulur. */
function ResolutionDialog({ req, to, busy, onCancel, onConfirm }: { req: Req; to: Status; busy: boolean; onCancel: () => void; onConfirm: (r: string) => Promise<unknown> }) {
  const [text, setText] = useState("");
  const [err, setErr] = useState<string>();
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <dialog ref={(el) => { ref.current = el; if (el && !el.open) el.showModal(); }} className="dialog" onClose={onCancel}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return setErr(to === "cancelled" ? "İptal gerekçesi zorunlu." : "Çözüm notu zorunlu.");
          onConfirm(text.trim()).catch(() => {});
        }}
      >
        <div className="dialog__body">
          <h2 className="dialog__title">#{req.number} → {requestStatus(to)}</h2>
          <div className="field">
            <label className="field__label" htmlFor="res-text">{to === "cancelled" ? "İptal gerekçesi" : "Çözüm notu"} *</label>
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
