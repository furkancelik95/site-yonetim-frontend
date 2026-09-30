# 02 — Tasarım sistemi

Referans uygulamanın tasarım sistemi olduğu gibi taşınır. Tam CSS: `docs/referans/app.css`
(elle yazılmış, belirteç tabanlı, ~850 satır). Yeni bileşenler bu belirteçleri kullanır;
bileşen içinde ham renk kodu yazılmaz.

## 1. Kararlar ve gerekçeleri

| Karar | Neden |
|---|---|
| **Marka rengi indigo** | Türkiye'deki site yönetimi yazılımlarının neredeyse hepsi mavi/turkuaz; indigo ayrışır. Yeşil/kehribar/kırmızı yalnız **durum** için kalır — "ödendi" yeşili markayla karışmasın |
| **Yazı IBM Plex Sans / Mono** | Finans için tasarlanmış, rakamları sütunda hizalı (tabular) |
| **Tek tema, açık** | **Koyu mod bilinçli olarak kaldırıldı.** Birincil kullanıcı gündüz masaüstünde çalışan yönetici; iki temayı her ekranda doğrulamanın bedeli karşılığını vermiyor |
| **Yüzey katmanları gözle ayrılır** | Zemin ile kart arasında belirgin ton farkı + kenarlık + gölge. Önceki sürümde fark %3'tü, kartlar sayfadan ayrılmıyordu ("beyaz fazla beyaz" geri bildirimi) |
| **Renk tek başına anlam taşımaz** | Durum her zaman ikon ya da metinle birlikte |

## 2. Belirteçler

```css
:root {
  color-scheme: light;

  /* Marka — indigo */
  --brand-50:#eef2ff; --brand-100:#e0e7ff; --brand-200:#c7d2fe; --brand-300:#a5b4fc;
  --brand-400:#818cf8; --brand-500:#6366f1; --brand-600:#4f46e5; --brand-700:#4338ca;
  --brand-800:#3730a3; --brand-900:#312e81;

  /* Nötr */
  --n-0:#ffffff; --n-25:#fcfcfd; --n-50:#f8fafc; --n-100:#f1f5f9; --n-200:#e2e8f0;
  --n-300:#cbd5e1; --n-400:#94a3b8; --n-500:#64748b; --n-600:#475569; --n-700:#334155;
  --n-800:#1e293b; --n-900:#0f172a; --n-950:#020617;

  /* Durum — markadan ayrı */
  --ok-bg:#ecfdf5;     --ok-fg:#065f46;     --ok-line:#6ee7b7;     --ok-solid:#059669;
  --warn-bg:#fffbeb;   --warn-fg:#92400e;   --warn-line:#fcd34d;   --warn-solid:#d97706;
  --danger-bg:#fef2f2; --danger-fg:#991b1b; --danger-line:#fca5a5; --danger-solid:#dc2626;
  --info-bg:#eff6ff;   --info-fg:#1e40af;   --info-line:#93c5fd;   --info-solid:#2563eb;

  /* Yüzeyler — derinden yükseğe */
  --bg:#e9edf4;          /* sayfa zemini */
  --bg-sunken:#dfe5ef;   /* girinti, satır vurgusu */
  --bg-inset:#f4f7fb;    /* kart başlığı, tablo başlığı */
  --bg-raised:#ffffff;   /* kart */

  /* Metin ve çizgi */
  --fg:var(--n-900); --fg-muted:var(--n-500); --fg-subtle:var(--n-400); --fg-inverse:var(--n-0);
  --line:#dbe2ec; --line-strong:#bfc9da;

  /* Vurgu */
  --accent:var(--brand-700); --accent-hover:var(--brand-800);
  --accent-soft:var(--brand-50); --accent-fg:#ffffff; --ring:var(--brand-500);

  /* Boşluk — 4px ritim */
  --s-1:.25rem; --s-2:.5rem; --s-3:.75rem; --s-4:1rem; --s-5:1.25rem; --s-6:1.5rem;
  --s-8:2rem; --s-10:2.5rem; --s-12:3rem; --s-16:4rem;

  /* Köşe, gölge */
  --r-sm:6px; --r-md:9px; --r-lg:13px; --r-xl:18px; --r-full:999px;
  --shadow-sm:0 1px 2px rgb(15 23 42/.06), 0 1px 3px rgb(15 23 42/.04);
  --shadow-md:0 1px 3px rgb(15 23 42/.08), 0 6px 16px -4px rgb(15 23 42/.08);
  --shadow-lg:0 4px 6px -1px rgb(15 23 42/.07), 0 18px 36px -10px rgb(15 23 42/.14);

  /* Yerleşim, hareket */
  --header-h:3.5rem; --tabbar-h:4rem;
  --dur:180ms; --ease:cubic-bezier(.32,.72,0,1);
}

body {
  background: var(--bg);
  color: var(--fg);
  font-family: 'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', sans-serif;
  font-size: 15px;
  line-height: 1.55;
}

/* Para ve kodlar: rakamlar sütunda kaymasın */
.num, .money { font-variant-numeric: tabular-nums; }
.mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
```

Yazı ölçeği: `h1 1.5rem`, `h2 1.125rem`, `h3 1rem`, gövde 15px, küçük 0.8125rem, çok küçük 0.75rem.
Başlıklar 600 ağırlık, gövde 400.

## 3. Bileşenler (referans CSS'te hazır sınıflar)

| Bileşen | Sınıflar | Not |
|---|---|---|
| Kabuk | `.shell`, `.sidebar` (15rem, yapışkan), `.main`, `.topbar`, `.page` | 860px altında kenar çubuğu gizlenir |
| Platform kenar çubuğu | `.sidebar--platform` | **koyu** (`--n-900`) — müşteri panelinden ayrılsın |
| Menü | `.navlink`, `aria-current="page"` etkin öğe | |
| Kart | `.card`, `.card__head`, `.card__icon--{ok,warn,danger,info,accent}`, `.card__title`, `.card__meta`, `.card__body`, `.card__body--flush`, `.card__foot` | |
| KPI | `.grid--kpi`, `.kpi`, `.kpi--{ok,warn,danger,accent}` (sol kenar rengi), `.kpi__label`, `.kpi__value`, `.kpi__value--sm`, `.kpi__note` | |
| Tablo | `.table-wrap` (yatay kaydırma), `table.data`, `.right`, `.num`, `.cell-main`, `.cell-sub`, `tr.is-overdue` | başlık yapışkan |
| Rozet | `.badge--{ok,warn,danger,info,muted}` | |
| Uyarı kutusu | `.alert--{ok,warn,danger,info}`, `.alert__title` | başarı `role="status"`, hata `role="alert"` |
| Gösterge | `.meter`, `.meter__fill--{ok,warn,danger}` | `role="img"` + `aria-label` |
| Çubuk grafik | `.bars`, `.bars__row`, `.bars__fill`, `.legend-dot` | grafik kütüphanesi yok; değer yanında sayı olarak da yazılı |
| Form | `.field`, `.field__label`, `.field__input`, `.field__hint` (kalıcı yardım), `.field__error` | |
| Onay kutusu | `.check`, `.check--rich` (açıklamalı) | |
| Satır içi form | `.inline-form` (`<details>`), `.inline-form__body` | tablo satırında "Öde", "Geri al" |
| Düğme | `.btn`, `.btn--primary`, `.btn--danger`, `.btn--ghost`, `.btn--sm` | |
| Boş durum | `.empty`, `.empty__title` | her boş liste ne yapılacağını söyler |
| Sayfalama | `.pager` | |

## 4. Kurallar

- **Ekran başına tek birincil düğme** (`.btn--primary`).
- **Dokunma hedefi ≥ 44px**; hedefler arası ≥ 8px.
- **400px genişlikte yatay kaydırma yok** (yalnız tablo kendi kabında kayar).
- Odak halkası her zaman görünür (`:focus-visible`, 2px `--ring`).
- `prefers-reduced-motion`'da animasyon kapanır.
- Tıklanabilir her şeyde `cursor: pointer`.
- Hareket süresi 150–300 ms.
- Para her yerde `.num` (tabular), sağa yaslı.
- Tehlikeli işlem (ters kayıt, geri al) kırmızı düğme + onay.

## 5. Biçimlendirme yardımcıları

```ts
const TR = "tr-TR";
export const formatMoney = (s: string) =>
  new Intl.NumberFormat(TR, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .format(Number(s)) + " ₺";               // yalnız GÖSTERİM — hesap için decimal.js
export const formatDate = (iso: string) =>
  new Intl.DateTimeFormat(TR, { day: "2-digit", month: "2-digit", year: "numeric" })
    .format(new Date(iso + "T00:00:00"));     // "2026-06-15" → "15.06.2026"
export const trUpper = (s: string) => s.toLocaleUpperCase(TR);   // "işçi" → "İŞÇİ"
```

Kısa para gösterimi (KPI): `2,4 M ₺`, `141 B ₺`.

Para girişi: `<input inputmode="decimal">` (metin), kullanıcı `1.234,56` ya da `1234.56` yazabilir;
gönderirken **`"1234.56"` metnine** çevrilir. `type="number"` kullanılırsa tarayıcı her zaman noktayla
gönderir — o da kabul, ama değeri metin olarak iletmeyi unutma.
