import { render, screen } from "@testing-library/react";
import { TrialView, describeVersion } from "./BillingRulesPage";

const trial = {
  lines: [
    { unit_id: "u1", unit_name: "A-1", amount: "600.00", explanation: "120 m² × 5,00 ₺" },
    { unit_id: "u2", unit_name: "A-2", amount: "400.00", explanation: "80 m² × 5,00 ₺" },
  ],
  unit_count: 2,
  period_total: "1000.00",
  pool: "1000.00",
  exempted: "0.00",
  annual_total: "12000.00",
  budget_income_target: "15000.00",
  warnings: [{ kind: "missing_weight_data" as const, message: "A-3 bölümünde m² yok" }],
};

describe("Aidat kuralları — deneme hesabı", () => {
  it("bölüm satırlarını, toplamları ve bütçe hedefi karşılaştırmasını gösterir", () => {
    render(<TrialView t={trial} />);
    expect(screen.getByText("A-1")).toBeInTheDocument();
    expect(screen.getByText("120 m² × 5,00 ₺")).toBeInTheDocument();
    expect(screen.getByText(/hedefin %80'i/)).toBeInTheDocument();
    expect(screen.getByText(/eksik 3.000,00/)).toBeInTheDocument();
    expect(screen.getByText(/A-3 bölümünde m² yok/)).toBeInTheDocument();
  });

  it("bütçe yoksa karşılaştırma yerine bilgi verir", () => {
    render(<TrialView t={{ ...trial, budget_income_target: null, warnings: [] }} />);
    expect(screen.getByText("yürürlükte bütçe yok")).toBeInTheDocument();
  });

  it("sürüm özetini Türkçe yazar", () => {
    const base = { kind: "by_area" as const, area_basis: "gross" as const, amount: "12000.00", amount_mode: "total" as const, frequency: "monthly" as const, components: [], discontinued: false };
    expect(describeVersion(base)).toMatch(/^Alana \(m²\) göre \(Brüt m²\) · .*12\.000,00.* \/ dönem · Aylık$/);
    expect(describeVersion({ ...base, kind: "composite", components: [{ kind: "by_area", percent: "70", area_basis: "gross" }, { kind: "equal", percent: "30", area_basis: "gross" }] })).toMatch(/^%70 Alana \(m²\) göre \+ %30 Eşit/);
    expect(describeVersion({ ...base, discontinued: true })).toBe("Kural bu dönemden itibaren durur");
  });
});
