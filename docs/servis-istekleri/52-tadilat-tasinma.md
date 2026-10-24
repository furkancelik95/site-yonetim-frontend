# [Servis] Tadilat ve taşınma izinleri

Kaynak: Yazılım Dokümanı **HIZ-05**.

## Ekran
- **Sakin → Tadilat ve taşınma** (`/sakin/{slug}/tadilat`): kurallar (saatler, depozito), başvuru (tadilat / taşınma giriş /
  çıkış, tarih(ler), firma, açıklama), başvurularım.
- **Tadilat ve taşınma** (`/tadilat-tasinma`): kurallar (hafta içi ve cumartesi saatleri, pazar, depozito, tamamlanma kontrol
  listesi); Onay bekleyen / Onaylı / Tamamlanan / Reddedilen; **Onayla**, **Reddet** (gerekçe), **Tamamla** (kontrol listesi,
  depozito iadesi).

## Uç nokta
- `GET/PUT …/settings/permits` — `{ weekday_hours: "09:00-18:00", saturday_hours: "10:00-16:00", sunday_allowed, deposit_amount, checklist: [] }`
- `GET  …/permits?status=` · `POST …/permits/{id}/approve` · `…/reject` `{ reason }` · `…/complete` `{ checklist: [{ item, ok }], refund_deposit }`
- `GET/POST …/resident/permits` (belgede `/me/permits`)

İzin: `{ id, unit_id, unit_name, type: "renovation|move_in|move_out", date_from, date_to, contractor, description, status: "pending|approved|rejected|completed", reject_reason, checklist, deposit, created_by, decided_by, completed_by, completed_at }`.

## İş kuralları
- Tarih bugünden önce olamaz; tadilatta bitiş ≥ başlangıç. Belgede başvuru "Tadilat izni" onay kuralından geçer (K21).
- Onayda: çalışma saatleri sakine, **komşu bölümlere ve güvenliğe** bilgi (K5); güvenlik firma personeli girişini izne bağlı
  kontrol eder. Depozito > 0 ise malik hesabına dönem dışı ücret (kaynak `renovation`).
- Tamamlamada kontrol listesi zorunlu (giriş taşınması hariç); depozito iadesi **ters kayıtla**.
- Taşınma: asansör ve yükleme alanı rezervasyonu önerilir (rezervasyon modülüyle); çıkışta bölümün açık borçları gösterilir,
  hasar kontrol listesi, anahtar/kart teslimi; ilişki bitiş tarihi bölüm kartından (YAP-04).

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Alan hatası | 422 `fields.type/date_from/date_to/description` | … |
| Saat biçimi | 422 `fields.weekday_hours/saturday_hours` | "SS:DD-SS:DD biçiminde." |
| Ret gerekçesi | 422 `fields.reason` | "Ret gerekçesi yazın." |
| Kontrol listesi | 422 `fields.checklist` | "Kontrol listesini doldurun." |
| Yanlış durum | 409 `invalid_status` | … |

## Yetki
Personel `requests.assign`; sakin oturum sahibi.
