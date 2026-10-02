# site-yonetim-frontend

Site, apartman, iş merkezi ve AVM yönetim platformunun **web arayüzü**:
yönetim paneli, sakin ekranı, güvenlik ekranı, platform paneli.

- **Yığın:** React 19 · Vite · TypeScript 5.9 · React Router · TanStack Query · decimal.js · Lucide
- **Backend:** [site-yonetim-backend](https://github.com/furkancelik95/site-yonetim-backend) (Python, JSON API)

## Çalıştırma

Gerekenler: Node 22+ ve çalışan backend (`http://127.0.0.1:8000`, demo verisiyle).

```bash
npm install
npm run dev          # http://127.0.0.1:5173 — /api istekleri Vite üzerinden backend'e geçer
```

Backend başka adresteyse `.env.local` dosyasına `API_PROXY_TARGET=http://…` yazın (örnek: `env.example`).
Geliştirmede giriş ekranında demo hesapları listelenir (parola `Demo1234!`).

| Komut | |
|---|---|
| `npm run typecheck` | TypeScript denetimi |
| `npm test` | Birim testleri (Vitest) |
| `npm run build` | Üretim derlemesi → `dist/` |
| `npm run api:types` | `openapi.json`'dan `src/api/schema.d.ts` üretir |

### API tipleri

Tipler elle yazılmaz. Backend şeması değişince `openapi.json`'ı güncelleyip tipleri yeniden üretin:

```bash
curl http://127.0.0.1:8000/api/v1/openapi.json -o openapi.json
npm run api:types
npm run typecheck    # şemadaki değişiklik hangi ekranı etkiliyorsa burada görünür
```

TypeScript 5.9'a sabit: `openapi-typescript` henüz TypeScript 7'nin derleyici API'siyle çalışmıyor.

## Klasörler

```
src/
  api/          client.ts (jeton, yenileme, hata, Idempotency-Key, indirme), hooks.ts, schema.d.ts (üretilmiş)
  auth/         oturum, açılış ekranı kuralı
  layouts/      AppShell (menü), site/sakin/platform düzenleri, yetki korumaları
  site/         site bağlamı: izin ve modül kontrolü (P, M sabitleri)
  components/   ortak bileşenler (durumlar, onay penceresi, sayfalama, bölüm seçici, Excel)
  lib/          biçimlendirme (tr-TR), etiketler (enum → Türkçe), adres durumu
  pages/        auth/, site/, resident/, platform/, PortfolioPage
  styles/       app.css (referans, olduğu gibi) + extra.css (eklemeler)
```

## Yapay zekâ ile çalışıyorsan

Önce **[AGENTS.md](AGENTS.md)**.

## Dokümanlar

| | |
|---|---|
| [01 — Ekranlar](docs/01-ekranlar.md) | Bütün ekranlar, kim görür, hangi uç noktayı kullanır |
| [02 — Tasarım sistemi](docs/02-tasarim-sistemi.md) | Renk, yazı, boşluk, bileşenler — tam CSS `docs/referans/app.css` |
| [03 — Backend ile çalışma](docs/03-backend-ile-calisma.md) | Servis isteği, sahte veri, tip üretimi |

Ürün, roller ve iş kuralları backend reposunda: `docs/`.
