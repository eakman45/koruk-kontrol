# Körük Yükleme Kontrol

Catering körüğünde kamyona yüklenen trolley/unit etiketlerini (DataMatrix) okuyup uçuşun checklist'iyle karşılaştıran web uygulaması.

- Yanlış uçuş / yanlış tarih → kırmızı alarm
- Aynı pozisyon tekrar okutulursa → sarı uyarı
- "Yüklemeyi bitir" → checklist'te olup okutulmayan kalemler listelenir

## Kullanım
iPhone'da Safari ile GitHub Pages adresini aç → Paylaş → **Ana Ekrana Ekle**.

1. ☰ → **Checklist yükle** (uçuşun CheckListRT PDF'i)
2. **Etiket okut** → kamera açılır, etiketlerin kare kodlarını sırayla çerçeveye getir
3. Bitince **Yüklemeyi bitir**

Veriler (checklist'ler ve okutma kayıtları) yalnızca cihazın tarayıcısında tutulur, hiçbir sunucuya gönderilmez.

## Kurallar
- Etiket kodu: `POZİSYON -TKxxxx-GG.AA.YY-C-1-PBLN`
- Checklist'teki tüm kalemler zorunludur; istisnalar: galley fırınları (etiketsiz) ve ONTRAY sepetleri (dönüş trolleylerinin içinde).
- CRG ile başlayan kargo pozisyonları uçuş/tarih açısından kontrol edilir.

## Geliştirme
`index.html` tek dosyadır (pdf.js ve zxing-wasm gömülü). Kaynak `src/app.html`; derlemek için:

```
npm i zxing-wasm@2 pdfjs-dist@3.11.174
python3 src/build.py   # src.html -> index.html
```
