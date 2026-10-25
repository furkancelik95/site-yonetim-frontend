# [Servis] Belge arşivi

Kaynak: Yazılım Dokümanı **RAP-03** ve **18.2** (belgeler). Diğer modüllerdeki "belge modülü gelince" notlarının karşılığı.

## Ekran
- **Belgeler** (`/dokumanlar`): **Belge yükle** (ad, tür, kapsam: tüm site / blok / bölüm, gizlilik, geçerlilik bitişi, dosya);
  süresi yaklaşan/biten uyarısı; arama, tür, "yalnız süresi yaklaşan"; liste (ad, tür, dosya, boyut, kapsam, gizlilik rozeti,
  geçerlilik ve kalan gün, sürüm); sürüm geçmişi (yükleyen, zaman, SHA-256 özeti, her sürümü indir); gizli belgede açılış kaydı.
- **Sakin → Belgeler** (`/sakin/{slug}/belgeler`): sakinlere açık ve kendi bölümüne özel belgeler, son sürüm indirilir.

## Uç nokta
- `GET …/documents?q=&kind=&expiring=1` → `[{ id, title, kind, scope, scope_name, confidentiality, valid_until, days_left, warning: "60|30|expired|null", version, file_name, size, sha256, uploaded_by, updated_at, versions: [{ v, file_name, size, sha256, uploaded_by, at }] }]`
- `POST …/documents` — çok parçalı dosya (sahte serviste `{ title, kind, scope, scope_id, scope_name, confidentiality, valid_until, file_name, data_url }`)
- `GET …/documents/{id}/versions/{v}/download` · `GET …/documents/{id}/access-log`
- `GET …/resident/documents` · `GET …/resident/documents/{id}/download` (belgede `/me/documents`)

## İş kuralları
- Türler: yönetim planı, site kuralları, sigorta poliçesi, yangın raporu, asansör etiketi/muayene, sözleşme, tutanak, mali tablo, diğer.
- **Dosya doğrulaması** (Furkan, 25.10.2026 — gider ekleriyle aynı altyapı): uzantıya değil içeriğe bakılır (PDF, PNG, JPEG,
  WebP imzası); **en fazla 10 MB** (20 MB gerekirse ayrıca konuşulur); dosya adı temizlenir, diskte sunucu üretimi ad;
  **web kökünün dışında** saklanır; SHA-256 özeti. **Virüs taraması ilk sürümde yok** — ekranda "taranmıştır" denmez.
- **Sürüm**: aynı ad + aynı kapsamla yüklenen dosya yeni sürüm olur, eski sürümler korunur; son sürümle aynı özetteki dosya reddedilir.
- **Gizlilik**: sakinlere açık · bölüme özel (bölüm kapsamı zorunlu; o bölümün sakinleri görür) · yönetim · gizli (yalnız
  atanan roller — sahte serviste `audit.read` ya da `members.manage` — ve **her açılış kayda geçer**; yetkisiz için 404).
- **Geçerlilik**: bitişe 60 ve 30 gün kala sorumluya uyarı (K5), listede kalan gün; saklama süresi K8 ile.
- Sakinden "okudum" onayı (yönetim planı, site kuralları) zorunlu okuma onayı altyapısıyla (istek 71) — sonraki adım.
- Poliçe, sözleşme, tutanak, fatura, denetim raporu gibi diğer modüllerdeki dosyalar bu arşive bağlanmalı.

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Alanlar | 422 `fields.title/kind/scope/confidentiality/valid_until` | "Bölüme özel belge bir bölüme bağlı olmalı." … |
| Dosya türü / boyut | 422 `fields.file` | "Yalnız PDF, PNG, JPEG ya da WebP (dosya içeriği doğrulandı)." / "Dosya en fazla 10 MB." |
| Aynı dosya | 409 `same_file` | "Bu dosya son sürümle aynı." |
| Yetkisiz gizli belge | 404 `not_found` | … |

## Yetki
Yükleme yönetim rolleri (sahte serviste `announcements.publish`); görüntüleme gizlilik ve kapsama göre.
