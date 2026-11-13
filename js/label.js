// Etiket (DataMatrix) içeriğini ayrıştırır.
// Örnek: "620F -TK0667-13.11.26-C-1-0", "DONUS-BULK1 -TK1751-13.08.26-C-1-0"

export function normFlight(f) {
  const m = String(f).toUpperCase().match(/TK\s*0*(\d+)/);
  return m ? "TK" + m[1].padStart(4, "0") : String(f).toUpperCase();
}

/**
 * @param {string} raw okunan metin
 * @param {{items:{code:string}[]}|null} list aktif checklist (elle pozisyon girişi için)
 * @returns {{pos:string, flight:string|null, date:string|null, pbln?:string, raw:string, posOnly?:boolean}|null}
 */
export function parseLabel(raw, list) {
  const s = String(raw).trim().toUpperCase();
  // Pozisyon bazı etiketlerde (ör. porsiyonlama/strafor) barkoda yazılmıyor: "-TK0537-2026.06.01-B-"
  const m = s.match(/^\s*([A-Z0-9\/][A-Z0-9\/\-]*?)?\s*-\s*(TK\s?\d{3,5})\s*-\s*(\d{4}\.\d{2}\.\d{2}|\d{2}\.\d{2}\.(?:\d{4}|\d{2}))(?!\d)\s*(?:-\s*([A-Z0-9]*))?\s*(?:-\s*([A-Z0-9]*))?\s*(?:-\s*([A-Z0-9]*))?/);
  if (m) {
    let d = m[3];
    if (/^\d{4}\./.test(d)) d = `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(2, 4)}`; // 2026.06.01 -> 01.06.26
    else if (d.length === 10) d = d.slice(0, 6) + d.slice(8);                         // 30.06.2026 -> 30.06.26
    return { pos: m[1] || "", flight: normFlight(m[2]), date: d, cls: m[4] || "", seals: m[5] || "", pbln: m[6] || "", raw: s };
  }
  // Sadece pozisyon kodu (elle giriş): aktif checklist'te varsa ya da kod biçimine uyuyorsa
  const inList = list && list.items.some((i) => i.code === s);
  if (inList || /^[A-Z\/]{0,6}\d{1,6}[A-Z]?$/.test(s) || /^[A-Z]+-[A-Z]+\d*$/.test(s)) {
    return { pos: s, flight: null, date: null, raw: s, posOnly: true };
  }
  return null;
}
