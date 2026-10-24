# [Servis] Plaka sorgu, giriş-çıkış kaydı ve otopark ihlali

Kaynak: Yazılım Dokümanı **GUV-04**, **OTP-02**. Park yeri ve tahsis (OTP-01) **K30**'a bağlı — bu istekte yok.

## Ekran
- **Kapı ekranı → Plaka**: plaka yaz → **Sorgula** → Kayıtlı (bölüm, sahip adı) / Misafir (davet eden bölüm, geçerlilik) /
  Kayıtsız; **Giriş**, **Çıkış** kaydı; **İhlal** (yer, not); bugünkü plaka kayıtları.

## Uç nokta
- `GET  /api/v1/sites/{slug}/plates/lookup?plate=34MSF77` → `{ plate, plate_display, result: "registered|guest|unknown", unit_name, owner_name, valid_until, detail }`
- `GET  …/gate-logs?date=` · `POST …/gate-logs` — `{ plate, direction: "in|out", gate_id }`
- `GET  …/parking-violations` · `POST …/parking-violations` — `{ plate, location, note }`

## İş kuralları
- Plaka normalize: büyük harf, boşluksuz; arama büyük/küçük harf ve boşluk duyarsız.
- Kaynaklar: kayıtlı araçlar (istek 22; misafir aracı `valid_until`'a kadar), geçerli ön davet plakaları (istek 41) ve
  bugün kullanılmış tek kullanımlık davet plakaları.
- Görevli **telefon görmez**; yalnız bölüm ve sahip adı. Plaka kişisel veri: saklama istek 40 ayarı (K8).
- İhlal: güvenlik doğrulamasıyla kaydedilir; plaka bir bölüme kayıtlıysa sakine, değilse yönetime bildirim (K5).
  Yetkili plakada ihlal için not zorunlu (409 `plate_authorized`). Ceza kuralı varsa dönem dışı ücret (istek 31) —
  ceza tutarı/kuralı ortak kararı. Fotoğraf belge modülüyle. Plaka kamerası Faz 2.

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Plaka boş/biçim | 422 `fields.plate` | "Plakayı 34 ABC 123 biçiminde yazın." |
| Yer yok | 422 `fields.location` | "Yeri yazın…" |
| Yetkili plaka, not yok | 409 `plate_authorized` | "34 ABC 123 yetkili (…). Yine de ihlal kaydedilecekse nedenini yazın." |

## Yetki
`security.visitors` (görevli), `units.read` (yönetici).
