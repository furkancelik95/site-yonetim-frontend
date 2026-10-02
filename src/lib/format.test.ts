import { formatDate, formatMoney, formatMonth, parseMoneyInput, trUpper } from "./format";

describe("formatMoney", () => {
  it("metin tutarı tr-TR biçiminde gösterir", () => {
    expect(formatMoney("1234.5")).toBe("1.234,50 ₺");
    expect(formatMoney("-0.10")).toBe("-0,10 ₺");
    expect(formatMoney(null)).toBe("—");
  });
});

describe("parseMoneyInput", () => {
  it.each([
    ["1.234,56", "1234.56"],
    ["1234,5", "1234.50"],
    ["1234.56", "1234.56"],
    ["1.234", "1234.00"],
    [" 250 ₺ ", "250.00"],
  ])("%s → %s", (raw, out) => expect(parseMoneyInput(raw)).toBe(out));

  it.each(["", "abc", "1,234,5", "12.345,678"])("%s geçersiz", (raw) => expect(parseMoneyInput(raw)).toBeNull());
});

describe("tarih", () => {
  it("ISO tarihi gün kaymadan gösterir", () => {
    expect(formatDate("2026-06-15")).toBe("15.06.2026");
    expect(formatMonth("2026-06-01")).toBe("Haziran 2026");
  });
});

it("Türkçe büyük harf: i → İ", () => {
  expect(trUpper("işçi")).toBe("İŞÇİ");
});
