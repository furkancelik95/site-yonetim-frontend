import { componentsTotal, formToVersionBody, needsCoefficients, nextPeriod, parseDecimalInput, versionToForm } from "./billing";

describe("aidat kuralı formu (K23)", () => {
  it("ondalık girişi virgülle kabul eder", () => {
    expect(parseDecimalInput("70,5")).toBe("70.5");
    expect(parseDecimalInput(" 100 ")).toBe("100");
    expect(parseDecimalInput("abc")).toBeNull();
    expect(parseDecimalInput("")).toBeNull();
  });

  it("bileşen toplamını hesaplar, geçersiz girişi saymaz", () => {
    expect(componentsTotal([{ kind: "by_area", percent: "70", area_basis: "gross" }, { kind: "equal", percent: "30", area_basis: "gross" }])).toBe("100");
    expect(componentsTotal([{ kind: "equal", percent: "x", area_basis: "gross" }, { kind: "equal", percent: "12,5", area_basis: "gross" }])).toBe("12.5");
  });

  it("katsayı alanı yalnız bölüm tipi ağırlığında gerekir", () => {
    expect(needsCoefficients({ kind: "by_unit_type_weight", components: [] })).toBe(true);
    expect(needsCoefficients({ kind: "composite", components: [{ kind: "by_unit_type_weight", percent: "50", area_basis: "gross" }] })).toBe(true);
    expect(needsCoefficients({ kind: "equal", components: [] })).toBe(false);
  });

  it("formu istek gövdesine çevirir; kapsam dışı listeleri boşaltır", () => {
    const f = { ...versionToForm(null, "2026-12"), kind: "fixed_per_unit" as const, amount: "1.250,00", basis_note: " Yönetim planı md. 12 ", scope_block_ids: ["b1"] };
    const { body, errors } = formToVersionBody(f);
    expect(errors).toEqual({});
    expect(body).toMatchObject({ effective_period: "2026-12", kind: "fixed_per_unit", amount: "1250.00", basis_note: "Yönetim planı md. 12", scope_block_ids: [], components: [] });
  });

  it("dayanak ve tutar yoksa alan hatası döner", () => {
    const { body, errors } = formToVersionBody(versionToForm(null, "2026-12"));
    expect(body).toBeNull();
    expect(errors.amount).toBeTruthy();
    expect(errors.basis_note).toBeTruthy();
  });

  it("sonraki dönemi yıl dönümünde doğru verir", () => {
    expect(nextPeriod("2026-11")).toBe("2026-12");
    expect(nextPeriod("2026-12")).toBe("2027-01");
  });
});
