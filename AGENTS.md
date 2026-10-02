# AGENTS.md — site-yonetim-frontend

Bu dosya, bu repoda çalışan yapay zekâ asistanı için yazıldı. Her oturumun başında oku.

## Bu repo ne

Site/tesis yönetim platformunun **web arayüzü**. Yönetim paneli, sakin ekranı, güvenlik ekranı
ve platform paneli burada. Tüm veri **backend API**'sinden gelir; bu repo iş kuralı hesaplamaz.

Ürün ve iş kuralları backend reposunda: **`furkancelik95/site-yonetim-backend`** → `docs/`.
Özellikle oku: `01-urun.md` (roller, modüller), `05-yetki.md` (kim neyi görür),
`06-api-sozlesmesi.md` (biçim kuralları ve uç nokta kataloğu).

## Ekip

| Kim | Ne | Nerede |
|---|---|---|
| **Burhan** (+ sen) | Frontend | **bu repo** |
| **Furkan** (+ kendi asistanı) | Backend (Python) | `site-yonetim-backend` |

## Teknoloji (karar verildi)

| Konu | Seçim |
|---|---|
| Çatı | **React 19 + Vite + TypeScript** (strict) |
| Yönlendirme | React Router |
| Sunucu verisi | **TanStack Query** — önbellek, yükleniyor/hata durumları, yeniden deneme |
| API tipleri | Backend'in OpenAPI şemasından **üretilir** (`openapi-typescript` → `src/api/schema.d.ts`). Elle tip yazma; kısa adlar `src/api/types.ts` |
| Sahte API | **MSW** (`src/mocks/handlers.ts`), yalnız henüz yazılmamış uçlar; diğer istekler gerçek backend'e gider. Hangi uçların sahte olduğu: `docs/servis-istekleri/README.md`. Kapatmak: `.env.local` → `VITE_USE_MOCKS=false` |
| Stil | Referans CSS olduğu gibi `src/styles/app.css`; eklemeler `src/styles/extra.css` (yalnız belirteç, ham renk yok) |
| Yazı tipi | `@fontsource` paketi — Google Fonts'a istek gitmez (KVKK: ziyaretçi IP'si yurt dışına gitmesin) |
| TypeScript | **5.9'a sabit** — `openapi-typescript` TS 7 derleyici API'siyle çalışmıyor |
| Ondalık | `decimal.js` (para hesabı gerekirse) |
| HTML temizleme | `DOMPurify` — `dangerouslySetInnerHTML` yalnız bununla |
| Test | Vitest + Testing Library; kritik akışlar için Playwright |

## Çalışma şekli: önce sahte veri, sonra servis isteği

1. Ekran için hangi uç nokta gerekiyor? Backend `docs/06-api-sozlesmesi.md` kataloğuna ve
   OpenAPI şemasına bak.
2. **Uç nokta hazırsa** → üretilmiş tiplerle kullan.
3. **Hazır değilse:**
   1. Backend reposunda **Issue aç** — şablon *Servis isteği*. İstek/yanıt örneği, iş kuralları,
      hata durumları, yetki yaz. Ayrıntı: `docs/03-backend-ile-calisma.md`.
   2. Aynı sözleşmeyle bir **MSW handler** yaz (`src/mocks/`), ekranı sahte veriyle bitir.
   3. Servis gelince handler'ı kapat, gerçeğe bağlan, farkları issue'da bildir.
4. Backend'in iş kuralını frontend'de **tekrar hesaplama.** Tahakkuk tutarı, bakiye, gecikme —
   hepsi API'den gelir. Frontend gösterir.

## ASLA / HER ZAMAN

1. **Para metindir.** API `"1234.56"` gönderir. Göstermek için `formatMoney("1234.56")` →
   `1.234,56 ₺`. **`parseFloat` ile toplama/çıkarma yapma**; gerekiyorsa `decimal.js`.
2. **Kullanıcıya dönük her metin Türkçe.** Tarih `15.06.2026`, sayı `1.234,56`.
   Büyük/küçük harf için `toLocaleUpperCase("tr-TR")` / `toLocaleLowerCase("tr-TR")` —
   `toUpperCase()` "i"yi "I" yapar, yanlış.
3. **Yetkiyi gizlemek güvenlik değildir.** `/me`'den gelen izinlere göre menü ve düğme gizlenir,
   ama asıl kontrol backend'dedir. Gizlenmiş bir ekrana adresle girilirse backend'in 403/404'ünü
   düzgün göster.
4. **403 ve 404 farklı ekranlardır.** 404 → "bulunamadı" (siteye erişimi olmayan da bunu görür).
   403 → "bu işlem için yetkiniz yok".
5. **Jeton `localStorage`'a yazılmaz.** Erişim jetonu bellekte, yenileme jetonu httpOnly çerezde
   (backend yönetir). XSS'te çalınmasın.
6. **Her liste sayfalıdır.** Tek seferde binlerce satır çizme — backend zaten sayfalı döner.
7. **Para yazan formlar iki kez gönderilmez.** Gönderimde düğme kilitlenir; istek
   `Idempotency-Key` başlığı taşır.
8. **Geri alınamaz işlem onay ister** (tahakkuk kaydı, ters kayıt, gider geri alma).
9. **Hata mesajı alanın altında.** Backend `422` + `fields` dönerse her mesajı ilgili alanın
   altına yaz. Genel hata üstte, `role="alert"`.
10. **Emoji ikon olarak kullanılmaz.** Tek SVG ikon ailesi (Lucide).

## Kod kalıpları (yeni ekran yazarken bunları kullan)

| İhtiyaç | Kullan |
|---|---|
| Sitenin altındaki bir kaynağı okumak | `useSiteGet<T>("/debtors", { page })` (`src/api/hooks.ts`) |
| Siteye yazmak | `useSiteMutation("POST", "/payments", { money: true })` — mesajı bildirim olarak gösterir, önbelleği tazeler; `money` → Idempotency-Key |
| İzin / modül kontrolü | `const { can, shows } = useSite(); can(P.financeRead); shows(M.requests, P.requestsRead)` |
| Sayfa ve filtre | `useUrlState({ q: "", page: "1" })` — adreste durur, geri tuşu çalışır |
| Yükleniyor/hata/403/404 | `<Loading />`, `<ErrorState error={…} />` (403 ve 404'ü kendisi ayırır) |
| Geri alınamaz işlem | `<ConfirmButton title body onConfirm>` |
| Form alanı | `<Field label error hint>{(p) => <input {...p} />}</Field>` — etiket, aria, hata bağlı gelir |
| Bölüm seçmek | `<UnitPicker>` — açılır liste değil arama (binlerce bölüm olabilir); güvenlik için `source="lookup"` |
| Para girişi | `parseMoneyInput("1.234,56")` → `"1234.56"`; göstermek için `formatMoney` / `<Money>` |
| Kod → Türkçe | `src/lib/labels.ts` |
| Excel indirmek | `<ExcelButton path query fileName>` (yetkili istekle indirir) |

## Doküman haritası

| İş | Oku |
|---|---|
| Hangi ekran var, kim görür, hangi uç noktayı kullanır | `docs/01-ekranlar.md` |
| Renk, yazı, boşluk, bileşen | `docs/02-tasarim-sistemi.md` |
| Backend'den servis isteme, sahte veri | `docs/03-backend-ile-calisma.md` |
| Kurallar, roller, API biçimi | backend reposu `docs/` |

## Bitti tanımı

- [ ] Yükleniyor, boş, hata, yetkisiz (403), bulunamadı (404) durumları var
- [ ] Para ve tarih tr-TR biçimli; para hesabı `parseFloat` ile yapılmıyor
- [ ] 400px genişlikte yatay kaydırma yok; dokunma hedefleri ≥ 44px
- [ ] Klavyeyle kullanılabiliyor, alanların etiketi var, odak görünür
- [ ] İzni olmayan rol için düğme/menü gizli **ve** doğrudan adresle girildiğinde düzgün hata
- [ ] Gerçek uç nokta yoksa MSW handler'ı var ve backend'de issue açık
