# Körük Kontrol

Checklist'teki malzemelerin kamyona **eksiksiz ve doğru uçuşla** yüklendiğini, trolley/unit etiketlerindeki kare kodlardan (DataMatrix) kontrol eden web uygulaması.

**Adres:** https://eakman45.github.io/koruk-kontrol/ — iPhone'da Safari ile aç → Paylaş → *Ana Ekrana Ekle*. İlk açılıştan sonra internetsiz de çalışır.

## Kullanım
1. **Checklist yükle** — kamyonun CheckListRT PDF'i. Kontrol o uçuş için başlar.
2. **Etiket okut** — kamera açılır; kare kodları sırayla çerçeveye getir. Bluetooth barkod okuyucu da doğrudan çalışır.
3. **Yüklemeyi tamamla** — eksik varsa tamamlanmaz. Tamamlanan yükleme raporuyla birlikte *Tamamlanan yüklemeler*e düşer.

## Kurallar
| Durum | Sonuç |
|---|---|
| Uçuş + tarih aynı, pozisyon checklist'te | ✓ |
| Farklı uçuş | Yanlış uçuş (kırmızı alarm, canlı tarama durur) |
| Aynı uçuş, farklı tarih | Yanlış tarih (kırmızı) |
| Pozisyon tekrar okutuldu | Zaten okundu (sarı) |
| Pozisyon checklist'te yok | Listede yok (sarı) |

- Checklist'te adı geçen her kalem zorunludur. İstisnalar: galley fırınları (etiketsiz) ve ONTRAY sepetleri (dönüş trolleylerinin içinde).
- Dönüş fırın çantası (CANTA-FIRIN) adedi = dönüş bacağı Y/C sıcak yemek ÷ 32, yukarı yuvarlanır.
- YC sıcak havlu kargoya verilmez; checklist'te kargo bölümünde görünürse uyarı verilir.
- Okutma başladıktan sonra yükleme iptal edilemez; aktif yükleme bitmeden yeni checklist başlatılamaz.
- Etiket kodu: `POZİSYON -TKxxxx-GG.AA.YY-C-1-PBLN`

## Veri
Tüm veriler yalnızca cihazın tarayıcısında tutulur, hiçbir sunucuya gönderilmez. Checklist'teki yolcu isimleri okunmaz ve saklanmaz.

## Kod yapısı
```
index.html, css/app.css     arayüz
js/parser.js                CheckListRT PDF ayrıştırıcı
js/rules.js                 kontrol kuralları (saf fonksiyonlar)
js/label.js                 etiket kodu ayrıştırıcı
js/scanner.js               kamera / fotoğraf / okuyucu
js/store.js                 yerel depolama (ileride sunucu istemcisiyle değiştirilecek katman)
js/app.js                   ekranlar ve akış
sw.js                       çevrimdışı çalışma
vendor/                     pdf.js 3.11, zxing-wasm 2.2 (okuyucu)
```
