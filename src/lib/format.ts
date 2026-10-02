// Gösterim biçimleri. Para API'den metin gelir ("1234.56"); burada yalnız GÖSTERİLİR.
// Hesap gerekiyorsa decimal.js — parseFloat ile toplama/çıkarma yapılmaz.
import Decimal from "decimal.js";

const TR = "tr-TR";

const moneyFmt = new Intl.NumberFormat(TR, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const intFmt = new Intl.NumberFormat(TR);
const dateFmt = new Intl.DateTimeFormat(TR, { day: "2-digit", month: "2-digit", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat(TR, {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const monthFmt = new Intl.DateTimeFormat(TR, { month: "long", year: "numeric" });

type MoneyIn = string | number | null | undefined;

function toDecimal(v: MoneyIn): Decimal | null {
  if (v === null || v === undefined || v === "") return null;
  try {
    return new Decimal(v);
  } catch {
    return null;
  }
}

/** "1234.5" → "1.234,50 ₺" */
export function formatMoney(v: MoneyIn, withSymbol = true): string {
  const d = toDecimal(v);
  if (!d) return "—";
  // Intl'e giden değer yalnız gösterim için; iki basamağa yuvarlanmış metinden üretilir.
  const s = moneyFmt.format(Number(d.toFixed(2)));
  return withSymbol ? `${s} ₺` : s;
}

/** KPI için kısa gösterim: 2,4 M ₺ · 141 B ₺ */
export function formatMoneyShort(v: MoneyIn): string {
  const d = toDecimal(v);
  if (!d) return "—";
  const abs = d.abs();
  const one = new Intl.NumberFormat(TR, { maximumFractionDigits: 1 });
  if (abs.gte(1_000_000)) return `${one.format(Number(d.div(1_000_000).toFixed(1)))} M ₺`;
  if (abs.gte(10_000)) return `${new Intl.NumberFormat(TR, { maximumFractionDigits: 0 }).format(Number(d.div(1000).toFixed(0)))} B ₺`;
  return formatMoney(v);
}

export function moneySign(v: MoneyIn): -1 | 0 | 1 {
  const d = toDecimal(v);
  if (!d || d.isZero()) return 0;
  return d.isNegative() ? -1 : 1;
}

export function formatInt(v: number | null | undefined): string {
  return v === null || v === undefined ? "—" : intFmt.format(v);
}

export function formatPercent(v: string | number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || v === "") return "—";
  return `%${new Intl.NumberFormat(TR, { maximumFractionDigits: digits }).format(Number(v))}`;
}

/** "2026-06-15" → "15.06.2026". Saat dilimi kaymasın diye yerel gece yarısı kullanılır. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = iso.length === 10 ? new Date(iso + "T00:00:00") : new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : dateFmt.format(d);
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : dateTimeFmt.format(d);
}

/** "2026-06-01" → "Haziran 2026" */
export function formatMonth(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso.slice(0, 10) + "T00:00:00");
  if (Number.isNaN(d.getTime())) return "—";
  const s = monthFmt.format(d);
  return s.charAt(0).toLocaleUpperCase(TR) + s.slice(1);
}

export const trUpper = (s: string) => s.toLocaleUpperCase(TR);
export const trLower = (s: string) => s.toLocaleLowerCase(TR);

export function initials(fullName: string | null | undefined): string {
  return (fullName ?? "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toLocaleUpperCase(TR))
    .join("");
}

/**
 * Kullanıcının yazdığı tutarı API biçimine çevirir: "1.234,56" / "1234,56" / "1234.56" → "1234.56".
 * Geçersizse null.
 */
export function parseMoneyInput(raw: string): string | null {
  let s = raw.trim().replace(/\s|₺/g, "");
  if (!s) return null;
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, "");
  }
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) return null;
  return new Decimal(s).toFixed(2);
}

export function todayIso(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
