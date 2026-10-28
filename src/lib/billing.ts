// Aidat kuralı formu (K23, FIN-03) için saf yardımcılar: API sürümünü forma, formu istek gövdesine çevirir.
// Tutar hesabı yapılmaz (deneme hesabı backend'de); yalnız girişin biçimi denetlenir.
import Decimal from "decimal.js";
import type { Schemas } from "../api/types";
import { parseMoneyInput } from "./format";

export type BillingVersion = Schemas["BillingVersionOut"];
export type BillingVersionBody = Schemas["BillingVersionIn"];
export type AllocKind = BillingVersionBody["kind"];
export type AreaBasisKind = NonNullable<BillingVersionBody["area_basis"]>;
export type ScopeKindValue = NonNullable<BillingVersionBody["scope_kind"]>;
export type RuleFrequency = "monthly" | "quarterly" | "yearly";

/** Aidat kuralında seçilebilen dağıtım tipleri (backend: özel katsayı ve sayaç yok). */
export const RULE_KINDS: AllocKind[] = ["equal", "by_area", "by_land_share", "by_unit_type_weight", "fixed_per_unit", "composite"];
/** Bileşik kuralın bileşen tipleri. */
export const COMPONENT_KINDS: AllocKind[] = ["equal", "by_area", "by_land_share", "by_unit_type_weight"];
export const RULE_FREQUENCIES: RuleFrequency[] = ["monthly", "quarterly", "yearly"];

export interface ComponentRow { kind: AllocKind; percent: string; area_basis: AreaBasisKind }
export interface ExemptionRow { unit_id: string; unit_name: string | null; percent: string; reason: string }

export interface VersionForm {
  effective_period: string;
  kind: AllocKind;
  area_basis: AreaBasisKind;
  amount: string;
  frequency: RuleFrequency;
  components: ComponentRow[];
  /** bölüm tipi kimliği → katsayı metni ("1,5") */
  coefficients: Record<string, string>;
  exemptions: ExemptionRow[];
  scope_kind: ScopeKindValue;
  scope_block_ids: string[];
  scope_unit_type_ids: string[];
  scope_usage: string;
  discontinued: boolean;
  basis_note: string;
  basis_document_id: string | null;
}

/** "70,5" → "70.5"; geçersizse null. */
export function parseDecimalInput(raw: string): string | null {
  const v = raw.trim().replace(/\s/g, "").replace(",", ".");
  return /^\d+(\.\d+)?$/.test(v) ? v : null;
}

const toInput = (v: string) => v.replace(".", ",");

/** Kayıtlı sürümden (yeni sürüm için şablon ya da taslağı düzenleme) form; sürüm yoksa boş form. */
export function versionToForm(v: BillingVersion | null | undefined, period: string): VersionForm {
  if (!v) {
    return {
      effective_period: period, kind: "equal", area_basis: "gross", amount: "", frequency: "monthly",
      components: [{ kind: "by_area", percent: "50", area_basis: "gross" }, { kind: "equal", percent: "50", area_basis: "gross" }],
      coefficients: {}, exemptions: [], scope_kind: "whole_site", scope_block_ids: [], scope_unit_type_ids: [], scope_usage: "",
      discontinued: false, basis_note: "", basis_document_id: null,
    };
  }
  return {
    effective_period: period,
    kind: v.kind,
    area_basis: v.area_basis,
    amount: toInput(v.amount),
    frequency: (RULE_FREQUENCIES as string[]).includes(v.frequency) ? (v.frequency as RuleFrequency) : "monthly",
    components: v.components.map((c) => ({ kind: c.kind, percent: toInput(String(c.percent)), area_basis: c.area_basis })),
    coefficients: Object.fromEntries(v.type_coefficients.map((c) => [c.unit_type_id, toInput(String(c.coefficient))])),
    exemptions: v.exemptions.map((e) => ({ unit_id: e.unit_id, unit_name: null, percent: toInput(String(e.percent)), reason: e.reason })),
    scope_kind: v.scope_kind,
    scope_block_ids: [...v.scope_block_ids],
    scope_unit_type_ids: [...v.scope_unit_type_ids],
    scope_usage: v.scope_usage ?? "",
    discontinued: v.discontinued,
    basis_note: v.basis_note,
    basis_document_id: v.basis_document_id,
  };
}

/** Bileşen yüzdelerinin toplamı (gösterim için); geçersiz girişler sayılmaz. */
export function componentsTotal(rows: ComponentRow[]): string {
  return rows.reduce((s, r) => { const p = parseDecimalInput(r.percent); return p ? s.plus(p) : s; }, new Decimal(0)).toString();
}

/** Bölüm tipi katsayısı gerekiyor mu (doğrudan ya da bileşik kuralın bir bileşeni olarak). */
export function needsCoefficients(f: Pick<VersionForm, "kind" | "components">): boolean {
  return f.kind === "by_unit_type_weight" || (f.kind === "composite" && f.components.some((c) => c.kind === "by_unit_type_weight"));
}

/** Formu istek gövdesine çevirir; biçim hatası varsa alan adına göre hatalar döner (iş kuralı backend'de). */
export function formToVersionBody(f: VersionForm): { body: BillingVersionBody | null; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  if (!/^\d{4}-\d{2}$/.test(f.effective_period)) errors.effective_period = "Yürürlük dönemini seçin.";
  const amount = parseMoneyInput(f.amount);
  if (!amount && !f.discontinued) errors.amount = "Geçerli bir tutar girin.";
  if (!f.basis_note.trim()) errors.basis_note = "Dayanak zorunlu (ör. yönetim planı md. 12 ya da kurul kararı).";
  const components = f.kind === "composite" ? f.components.map((c) => ({ ...c, percent: parseDecimalInput(c.percent) })) : [];
  if (components.some((c) => c.percent == null)) errors.components = "Bileşen yüzdelerini sayı olarak girin.";
  const coefficients = needsCoefficients(f)
    ? Object.entries(f.coefficients).filter(([, v]) => v.trim() !== "").map(([unit_type_id, v]) => ({ unit_type_id, coefficient: parseDecimalInput(v) }))
    : [];
  if (coefficients.some((c) => c.coefficient == null)) errors.type_coefficients = "Katsayıları sayı olarak girin (ör. 1,5).";
  const exemptions = f.exemptions.map((e) => ({ unit_id: e.unit_id, percent: parseDecimalInput(e.percent), reason: e.reason.trim() }));
  if (exemptions.some((e) => e.percent == null)) errors.exemptions = "Muafiyet oranını sayı olarak girin.";
  else if (exemptions.some((e) => !e.unit_id)) errors.exemptions = "Muafiyet için bölüm seçin.";
  if (Object.keys(errors).length) return { body: null, errors };
  return {
    errors,
    body: {
      effective_period: f.effective_period,
      kind: f.kind,
      area_basis: f.area_basis,
      amount: amount ?? "0.00",
      frequency: f.frequency,
      components: components.map((c) => ({ kind: c.kind, percent: c.percent!, area_basis: c.area_basis })),
      type_coefficients: coefficients.map((c) => ({ unit_type_id: c.unit_type_id, coefficient: c.coefficient! })),
      exemptions: exemptions.map((e) => ({ unit_id: e.unit_id, percent: e.percent!, reason: e.reason })),
      scope_kind: f.scope_kind,
      scope_block_ids: f.scope_kind === "blocks" ? f.scope_block_ids : [],
      scope_unit_type_ids: f.scope_kind === "unit_types" ? f.scope_unit_type_ids : [],
      scope_usage: f.scope_kind === "usage" ? f.scope_usage || null : null,
      discontinued: f.discontinued,
      basis_note: f.basis_note.trim(),
      basis_document_id: f.basis_document_id,
    },
  };
}

/** "2026-11" → sonraki ay "2026-12". */
export function nextPeriod(period: string): string {
  const [y, m] = period.split("-").map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}
