// Giriş alanı yardımcıları: telefon (iletişim formu standardı) ve plaka.

/** TR cep telefonu: yalnız rakam; 0 / 90 öneki atılır; 10 hane. */
export const phoneDigits = (v: string) => v.replace(/\D/g, "").replace(/^90/, "").replace(/^0/, "").slice(0, 10);
/** Giriş maskesi: 5XX XXX XX XX */
export const phoneMask = (d: string) => [d.slice(0, 3), d.slice(3, 6), d.slice(6, 8), d.slice(8, 10)].filter(Boolean).join(" ");
/** Sunucuya E.164: +905XXXXXXXXX */
export const toE164 = (v: string) => `+90${phoneDigits(v)}`;
export const isTrMobile = (v: string) => /^5\d{9}$/.test(phoneDigits(v));
/** +905321112233 → +90 532 111 22 33 */
export const formatPhone = (e164: string) => e164.replace(/^\+90(\d{3})(\d{3})(\d{2})(\d{2})$/, "+90 $1 $2 $3 $4");
/** Plaka girişi: büyük harf, yalnız harf/rakam/boşluk; 34 ABC 123 */
export const plateInput = (v: string) => v.toLocaleUpperCase("en-US").replace(/[^A-Z0-9 ]/g, "").slice(0, 12);
