# 03 — Backend ile çalışma

## 1. Sözleşme nerede

- **Kurallar** (para metin, tarih biçimi, sayfalama, hata gövdesi, 403/404): backend
  `docs/06-api-sozlesmesi.md` §1 — **bağlayıcı**.
- **Uç nokta listesi:** aynı dosya §2.
- **Güncel şema:** backend çalışırken `GET /api/v1/openapi.json`. Tipler buradan üretilir:
  ```bash
  npx openapi-typescript $VITE_API_BASE_URL/openapi.json -o src/api/schema.d.ts
  ```
  Üretilmiş dosyayı elle düzenleme.

## 2. Servis isteği nasıl açılır

Bir ekran için uç nokta yoksa ya da eksikse, **backend reposunda** Issue aç → şablon *Servis isteği*.

İyi bir istek şunları içerir:
1. **Ekran ve rol** — "Borçlular, Yönetici ve Muhasebe görür, Güvenlik görmez"
2. **Uç nokta** — katalogdaki satır (`GET /sites/{slug}/debtors`)
3. **Örnek istek ve yanıt** — gerçek görünümlü JSON. Para `"1234.56"`, tarih `"2026-06-15"`,
   liste `{items, page, page_size, total}`
4. **İş kuralı** — backend `04-is-kurallari.md`'deki bölümü belirt (ör. §13 borçlu listesi)
5. **Hata durumları** — hangi durumda hangi kod ve Türkçe mesaj
6. **Kabul kriteri** — "yetkisiz rol 403, başka sitenin kullanıcısı 404"

Tek bir issue = tek bir ekranın ihtiyacı. Büyük ekranlarda birden fazla uç nokta aynı issue'da olabilir.

## 3. Sahte veri (MSW)

Servis gelene kadar ekranı bekletme:
```
src/mocks/
  handlers/
    auth.ts        # POST /auth/login, GET /me
    debtors.ts     # GET /sites/:slug/debtors
  data/            # örnek veriler — backend docs/10-demo-veri.md'deki sitelerle aynı
  browser.ts
```
- Handler, issue'daki **örnek yanıtla birebir aynı** şekli döner.
- Sahte veri gerçekçi olsun: Türkçe adlar, "Aksu Konakları", `A-12`, gerçekçi tutarlar.
- Hata durumlarını da taklit et (403, 404, 422 + `fields`) ki ekranın hata hâli test edilsin.
- `VITE_USE_MOCKS=false` olunca gerçek backend'e gider.

## 4. Servis geldiğinde

1. Tipleri yeniden üret.
2. `VITE_USE_MOCKS=false` ile ekranı dene.
3. Sahte yanıtla gerçek yanıt arasında fark varsa **issue'ya yorum yaz** — sessizce frontend'de
   uydurma. Sözleşme değiştiyse backend `06-api-sozlesmesi.md` güncellenmeli.
4. İlgili MSW handler'ını ya sil ya da yalnız test için tut.

## 5. Kimlik

- `POST /auth/login` → erişim jetonu (bellekte tut) + yenileme jetonu (backend httpOnly çereze yazar).
- Her istekte `Authorization: Bearer …`.
- 401 gelirse bir kez `/auth/refresh` dene; o da 401 ise girişe gönder.
- `GET /me` sonucu uygulama durumunda tutulur: izinler, siteler, platform yöneticisi mi, sakin mi.
