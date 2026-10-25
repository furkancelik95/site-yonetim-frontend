# [Servis] Rapor kataloğu, metrik sözlüğü ve talep/SLA raporu

Kaynak: Yazılım Dokümanı **RAP-01** ve **18.2** (rapor kataloğu, metrik sözlüğü).

## Ekran
**Rapor Kataloğu** (`/rapor-katalogu`): yalnız kullanıcının yetkili olduğu raporlar, gruplara göre (Finans, Operasyon, İK, Satın
alma, Yönetim); her kartta metrikler ve **nasıl hesaplandığı**; **Aç** ilgili rapor ekranına gider. **Talep ve SLA** raporu
katalog içinde açılır (`?rapor=requests_sla`): son 30 gün; KPI (talep, SLA uyumu, ortalama çözüm saati, memnuniyet); kategori tablosu.

## Uç nokta
- `GET …/reports/catalog` → `[{ key, name, group, permission, link, metrics: [{ name, definition }] }]` (belgede `GET /api/v1/reports/catalog`)
- `GET …/reports/requests-sla?to=YYYY-MM-DD` → `{ from, to, total: line, rows: [{ category, …line }] }`; line = `{ total, open, closed, sla_rate, avg_hours, satisfaction, rated }`

## İş kuralları
- Katalog yetkiye göre süzülür; yetkisiz raporun ucu 403 döner (belge kabulü: YK rolü güvenlik raporunu göremez; denetçi
  yalnız finans, satın alma ve denetim raporlarını görür — ölçüldü).
- **Metrik sözlüğü** tek kaynaktır; ekranlardaki "nasıl hesaplanır" metinleri buradan gelir. Tanımlar: tahsilat oranı =
  dönemde tahsil edilen / dönemde vadesi gelen; SLA uyumu = dönemde kapanan taleplerden SLA içinde çözülenlerin oranı; ortalama
  çözüm = açılıştan çözüme takvim saati; memnuniyet = kapanış puanı ortalaması; doluluk; devriye tamamlama; tüketim vb.
- **Veri kalitesi**: çözüm zamanı açılıştan önce olan kayıtlar ortalamaya girmez (demo verisinde bu tür kayıt var; sahte
  serviste ilk sürüm −19,3 saat gösterdi, düzeltildi). Backend bu kayıtları üretmemeli.
- Dışa aktarma (PDF/Excel) kayda geçer. Konsolide (şirket) raporlar ve YK mobil özeti sonraki adım; planlı rapor e-postası K5.

## Yetki
Rapor bazında (katalogdaki `permission`).
