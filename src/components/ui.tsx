import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CheckCircle2, ChevronLeft, ChevronRight, Info, Lock, Minus, SearchX } from "lucide-react";
import { ApiError } from "../api/client";
import { formatMoney, initials, moneySign } from "../lib/format";

/* ---------- Durumlar: yükleniyor / hata / boş ---------- */

/** Yükleniyor: dönen çark yerine sayfanın iskeleti (kart + satır biçimleri). */
export function Loading({ label = "Yükleniyor…" }: { label?: string }) {
  return (
    <div className="skel" role="status" aria-live="polite">
      <span className="visually-hidden">{label}</span>
      <div className="skel__kpis" aria-hidden="true">
        <div className="skeleton skel__kpi" />
        <div className="skeleton skel__kpi" />
        <div className="skeleton skel__kpi" />
      </div>
      <div className="skeleton skel__line" style={{ width: "62%" }} aria-hidden="true" />
      <div className="skeleton skel__line" style={{ width: "84%" }} aria-hidden="true" />
      <div className="skeleton skel__line" style={{ width: "48%" }} aria-hidden="true" />
    </div>
  );
}

/** API hatasını türüne göre gösterir: 404 bulunamadı, 403 yetki yok, diğerleri genel hata. */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  if (error instanceof ApiError && error.status === 404) return <NotFound />;
  if (error instanceof ApiError && error.status === 403) return <Forbidden message={error.message} />;
  const message = error instanceof ApiError ? error.message : "Bağlantı kurulamadı. İnternet bağlantınızı kontrol edin.";
  return (
    <div className="alert alert--danger" role="alert">
      <AlertTriangle aria-hidden="true" />
      <div>
        <div className="alert__title">Veri alınamadı</div>
        {message}
        {onRetry && (
          <div className="mt-2">
            <button className="btn btn--sm" type="button" onClick={onRetry}>
              Tekrar dene
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function NotFound() {
  return (
    <div className="card">
      <div className="empty">
        <SearchX aria-hidden="true" />
        <div className="empty__title">Bulunamadı</div>
        <p className="small">Aradığınız sayfa ya da kayıt yok, ya da görüntüleme izniniz bulunmuyor.</p>
        <Link className="btn" to="/">
          Ana sayfaya dön
        </Link>
      </div>
    </div>
  );
}

export function Forbidden({ message }: { message?: string }) {
  return (
    <div className="card">
      <div className="empty">
        <Lock aria-hidden="true" />
        <div className="empty__title">Bu işlem için yetkiniz yok</div>
        <p className="small">{message ?? "Hesabınızın rolü bu ekrana izin vermiyor. Yetki gerekiyorsa site yöneticinizle görüşün."}</p>
      </div>
    </div>
  );
}

export function Empty({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="empty">
      {icon}
      <div className="empty__title">{title}</div>
      {children && <div className="small">{children}</div>}
    </div>
  );
}

/* ---------- Uyarı kutusu ---------- */

type Tone = "ok" | "warn" | "danger" | "info";
const toneIcon = { ok: CheckCircle2, warn: AlertTriangle, danger: AlertTriangle, info: Info };

export function Alert({ tone, title, children }: { tone: Tone; title?: string; children?: ReactNode }) {
  const Icon = toneIcon[tone];
  return (
    <div className={`alert alert--${tone}`} role={tone === "danger" ? "alert" : "status"}>
      <Icon aria-hidden="true" />
      <div>
        {title && <div className="alert__title">{title}</div>}
        {children}
      </div>
    </div>
  );
}

/** Formun üstündeki genel hata (alan hataları alanların altında gösterilir). */
export function FormError({ error }: { error: unknown }) {
  if (!error) return null;
  // Salt okunur erişimde (sakin olarak görüntüleme, destek oturumu) backend yazmayı 403 `read_only` ile reddeder
  if (error instanceof ApiError && error.code === "read_only") {
    return (
      <Alert tone="warn" title="Salt okunur görünüm">
        {error.message}
      </Alert>
    );
  }
  // ApiError: backend'in Türkçe mesajı. Düz Error: formun kendi doğrulaması. TypeError: ağ hatası.
  const message =
    error instanceof ApiError || (error instanceof Error && !(error instanceof TypeError))
      ? error.message
      : "İşlem tamamlanamadı. Bağlantınızı kontrol edip tekrar deneyin.";
  return (
    <Alert tone="danger" title="İşlem yapılamadı">
      {message}
    </Alert>
  );
}

export function fieldError(error: unknown, name: string): string | undefined {
  return error instanceof ApiError ? (error.fields?.[name] ?? undefined) : undefined;
}

/* ---------- Para ---------- */

/** Para tutarı. tone="balance": borç kırmızı, alacak yeşil. */
export function Money({ value, tone, className = "" }: { value: string | null | undefined; tone?: "balance"; className?: string }) {
  let cls = "num";
  if (tone === "balance") {
    const s = moneySign(value);
    cls += s > 0 ? " amount-pos" : s < 0 ? " amount-neg" : " amount-zero";
  }
  return <span className={`${cls} ${className}`.trim()}>{formatMoney(value)}</span>;
}

/* ---------- Rozet ---------- */

export function Badge({ tone = "muted", children }: { tone?: "ok" | "warn" | "danger" | "info" | "muted"; children: ReactNode }) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

/* ---------- Sayfa başlığı ---------- */

/**
 * Her sayfanın başlık bandı: açık mavi zemin, koyu yazı, sağda eylemler. Hemen altına
 * `.grid--kpi` gelirse KPI kartları bandın alt kenarına biner (CSS: .hero + .grid--kpi).
 */
export function PageHead({ title, subtitle, actions, eyebrow, photo, band = true, children }: {
  title: string; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode; photo?: string;
  /** Fotoğrafsız geniş bant: menü grubunun tonu + sağda sayfanın menü ikonu (büyük, soluk) */
  band?: boolean; children?: ReactNode;
}) {
  useDocumentTitle(title);
  const auto = useNavGroupLabel(eyebrow === undefined);
  const shown = eyebrow ?? auto;
  const mark = useRef<HTMLSpanElement>(null);
  const [tone, setTone] = useState("blue");
  useEffect(() => {
    if (!band) return;
    // Ayrıntı sayfalarında (cari, makbuz…) site menüsünde eşleşen öğe yoktur; yalnızca "Siteler"
    // listesindeki site bağlantısı etkin görünür. O bağlantı sayfanın kendisi olmadığından atlanır.
    const groupOf = (el: Element) => el.closest(".sidebar__group")?.querySelector(".sidebar__label")?.textContent?.trim().toLocaleLowerCase("tr-TR") ?? "";
    const active = [...document.querySelectorAll('.sidebar .navlink[aria-current="page"]')].find((el) => groupOf(el) !== "siteler");
    const group = active ? groupOf(active) : "";
    setTone(group.startsWith("operasyon") ? "teal" : group.startsWith("yönetim") ? "violet" : group.startsWith("finans") ? "indigo" : "blue");
    // Menüdeki ikonun kopyası: aynı SVG düğümü klonlanır (HTML metni enjekte edilmez)
    const svg = active?.querySelector("svg");
    const host = mark.current;
    if (svg && host) {
      host.replaceChildren(svg.cloneNode(true));
      return () => host.replaceChildren();
    }
  }, [band, title]);
  const cls = photo ? "hero--photo hero--page" : band ? `hero--page hero--band hero--${tone}` : "hero--slim";
  return (
    <section className={`hero ${cls}`}>
      {photo && <img className="hero__photo" src={photo} alt="" decoding="async" />}
      {band && <span className="hero__mark" ref={mark} aria-hidden="true" />}
      <div className="hero__veil" aria-hidden="true" />
      <div className="hero__top">
        <div className="hero__text">
          {shown && <div className="hero__eyebrow">{shown}</div>}
          <h1>{title}</h1>
          {subtitle && <p className="hero__sub">{subtitle}</p>}
        </div>
        {actions && <div className="hero__actions">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = `${title} — SiteYönetimi`;
  }, [title]);
}

/**
 * Başlık bandının üst satırı için sayfanın menüdeki grubunu okur ("Finans yönetimi",
 * "Operasyon", site adı…). Menü izin/modül süzgecinden geçtiği için grup adı kullanıcının
 * gördüğü menüyle birebir aynıdır; menüde olmayan sayfalarda (ayrıntı ekranları) boş kalır.
 */
function useNavGroupLabel(enabled: boolean): string {
  const [label, setLabel] = useState("");
  useEffect(() => {
    if (!enabled) return;
    const groupOf = (el: Element) => el.closest(".sidebar__group")?.querySelector(".sidebar__label")?.textContent?.trim() ?? "";
    // "Siteler" listesindeki site bağlantısı ayrıntı sayfalarında da etkin görünür; grup adı sayılmaz
    const active = [...document.querySelectorAll('.sidebar .navlink[aria-current="page"]')].find((el) => groupOf(el) !== "Siteler");
    setLabel(active ? groupOf(active) : "");
  }, [enabled]);
  return label;
}

/* ---------- Sayfa başı bandı (hero) ---------- */

/**
 * Pano sayfalarının geniş başlık bandı: sağda fotoğraf (soldan beyaza erir), üst satır
 * (eyebrow), başlık, alt başlık, sağda eylemler; `children` ikinci satır (dönem seçici vb.).
 * Hemen altına gelen `.grid--kpi` bandın alt kenarından taşar.
 */
export function Hero({ eyebrow, title, subtitle, actions, photo, children }: { eyebrow?: ReactNode; title: string; subtitle?: ReactNode; actions?: ReactNode; photo?: string; children?: ReactNode }) {
  useDocumentTitle(title);
  return (
    <section className={`hero${photo ? " hero--photo" : ""}`}>
      {photo && <img className="hero__photo" src={photo} alt="" decoding="async" fetchPriority="high" />}
      <div className="hero__veil" aria-hidden="true" />
      <div className="hero__top">
        <div className="hero__text">
          {eyebrow && <div className="hero__eyebrow">{eyebrow}</div>}
          <h1>{title}</h1>
          {subtitle && <p className="hero__sub">{subtitle}</p>}
        </div>
        {actions && <div className="hero__actions">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

/* ---------- Dönem seçici ---------- */

/** Hap biçimli seçenek grubu ("Bu ay | Toplam"). Seçili parça beyaz. */
export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" className="seg__btn" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- Değişim rozeti ve ikon çipi ---------- */

/** Yön oku + metin: yukarı yeşil, aşağı kırmızı, düz gri. `good` tersine çevirir (borç artışı kötüdür). */
export function Delta({ dir, children, good = "up" }: { dir: "up" | "down" | "flat"; children: ReactNode; good?: "up" | "down" }) {
  const tone = dir === "flat" ? "muted" : (dir === good ? "ok" : "danger");
  const Icon = dir === "up" ? ArrowUpRight : dir === "down" ? ArrowDownRight : Minus;
  return (
    <span className={`badge badge--${tone}`}>
      <Icon aria-hidden="true" />
      {children}
    </span>
  );
}

/** Daire içinde ikon (tablo satırında kategori gibi). Dekoratif; metin yanında yazılır. */
export function IconChip({ children, tone }: { children: ReactNode; tone?: "ok" | "warn" | "danger" | "muted" }) {
  return (
    <span className={`chip${tone ? ` chip--${tone}` : ""}`} aria-hidden="true">
      {children}
    </span>
  );
}

/** Bugünün tarihi, uzun Türkçe biçim ("26 Ekim 2026 Pazartesi"). Hero üst satırı için. */
export function todayLong(): string {
  return new Date().toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

/* ---------- Avatar ---------- */

/** Baş harfli avatar. Dekoratif: adın kendisi yanında metin olarak yazılır. */
export function Avatar({ name, size, soft }: { name: string | null | undefined; size?: "sm"; soft?: boolean }) {
  return (
    <span className={`avatar${size ? ` avatar--${size}` : ""}${soft ? " avatar--soft" : ""}`} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

/* ---------- KPI ---------- */

/**
 * KPI kartı. `icon` etiketin solundaki soluk daireye girer; `delta` notun başında rozet
 * olarak gösterilir (ör. "bu ay %35,9"; `dir` verilirse ok ikonlu). İkisi de isteğe bağlı —
 * eski çağrılar aynen çalışır.
 */
export function Kpi({
  label,
  value,
  note,
  tone,
  small,
  icon,
  delta,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  tone?: "ok" | "warn" | "danger" | "accent";
  small?: boolean;
  icon?: ReactNode;
  delta?: { tone: "ok" | "warn" | "danger" | "info" | "muted"; label: ReactNode; dir?: "up" | "down" | "flat" };
}) {
  const DeltaIcon = delta?.dir === "up" ? ArrowUpRight : delta?.dir === "down" ? ArrowDownRight : delta?.dir === "flat" ? Minus : null;
  return (
    <div className={`kpi${tone ? ` kpi--${tone}` : ""}`}>
      <span className="kpi__label">
        {icon && (
          <span className="kpi__icon" aria-hidden="true">
            {icon}
          </span>
        )}
        {label}
      </span>
      <span className={`kpi__value${small ? " kpi__value--sm" : ""}`}>{value}</span>
      {(note || delta) && (
        <span className="kpi__note">
          {delta && (
            <Badge tone={delta.tone}>
              {DeltaIcon && <DeltaIcon aria-hidden="true" />}
              {delta.label}
            </Badge>
          )}
          {note && <span>{note}</span>}
        </span>
      )}
    </div>
  );
}

/* ---------- Sayfalama ---------- */

export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav className="pager" aria-label="Sayfalama">
      <span className="small muted">
        {from}–{to} / {total}
      </span>
      <div className="row" style={{ gap: "var(--s-2)" }}>
        <button className="btn btn--sm" type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft aria-hidden="true" /> Önceki
        </button>
        <span className="small">
          Sayfa {page} / {pages}
        </span>
        <button className="btn btn--sm" type="button" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Sonraki <ChevronRight aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}

/* ---------- Form alanı ---------- */

export function Field({
  label,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  /** id, aria-* özniteliklerini alan bir çocuk üretir. */
  children: (props: { id: string; "aria-invalid"?: true; "aria-describedby"?: string; required?: boolean }) => ReactNode;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(" ") || undefined;
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      {children({ id, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy, required })}
      {hint && (
        <span className="field__hint" id={hintId}>
          {hint}
        </span>
      )}
      {error && (
        <span className="field__error" id={errId} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

/* ---------- Onay penceresi ---------- */

/**
 * Geri alınamaz işlemler için onay (tahakkuk kaydı, ters kayıt, gider geri alma).
 * Kullanım: <ConfirmButton title=… body=… onConfirm={…}>Geri al</ConfirmButton>
 */
export function ConfirmButton({
  children,
  title,
  body,
  confirmLabel = "Onayla",
  danger,
  className = "btn",
  disabled,
  onConfirm,
}: {
  children: ReactNode;
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  className?: string;
  disabled?: boolean;
  onConfirm: () => Promise<unknown> | void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      ref.current?.close();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className={className} disabled={disabled} onClick={() => ref.current?.showModal()}>
        {children}
      </button>
      <dialog ref={ref} className="dialog" aria-labelledby={undefined} onClose={() => setError(null)}>
        <div className="dialog__body">
          <h2 className="dialog__title">{title}</h2>
          <div className="small">{body}</div>
          <FormError error={error} />
        </div>
        <div className="dialog__foot">
          <button type="button" className="btn btn--ghost" onClick={() => ref.current?.close()} disabled={busy}>
            Vazgeç
          </button>
          <button
            type="button"
            className={`btn ${danger ? "btn--danger" : "btn--primary"}`}
            onClick={confirm}
            disabled={busy}
            aria-busy={busy || undefined}
          >
            {busy && <span className="spinner" aria-hidden="true" />}
            {confirmLabel}
          </button>
        </div>
      </dialog>
    </>
  );
}

/* ---------- Gönder düğmesi ---------- */

export function SubmitButton({ busy, children, className = "btn btn--primary", disabled }: { busy: boolean; children: ReactNode; className?: string; disabled?: boolean }) {
  return (
    <button className={className} type="submit" disabled={busy || disabled} aria-busy={busy || undefined}>
      {busy && <span className="spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}
