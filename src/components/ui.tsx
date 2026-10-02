import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Info, Lock, SearchX } from "lucide-react";
import { ApiError } from "../api/client";
import { formatMoney, moneySign } from "../lib/format";

/* ---------- Durumlar: yükleniyor / hata / boş ---------- */

export function Loading({ label = "Yükleniyor…" }: { label?: string }) {
  return (
    <div className="loading" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
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

export function PageHead({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  useDocumentTitle(title);
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted mb-0">{subtitle}</p>}
      </div>
      {actions && <div className="page-head__actions">{actions}</div>}
    </div>
  );
}

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = `${title} — SiteYönetimi`;
  }, [title]);
}

/* ---------- KPI ---------- */

export function Kpi({ label, value, note, tone, small }: { label: string; value: ReactNode; note?: ReactNode; tone?: "ok" | "warn" | "danger" | "accent"; small?: boolean }) {
  return (
    <div className={`kpi${tone ? ` kpi--${tone}` : ""}`}>
      <span className="kpi__label">{label}</span>
      <span className={`kpi__value${small ? " kpi__value--sm" : ""}`}>{value}</span>
      {note && <span className="kpi__note">{note}</span>}
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
