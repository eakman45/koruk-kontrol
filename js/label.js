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
  const m = s.match(/^\s*([A-Z0-9\/][A-Z0-9\/\-]*?)\s*-\s*(TK\s?\d{3,5})\s*-\s*(\d{2}\.\d{2}\.\d{2})\s*(?:-\s*([A-Z0-9]*))?\s*(?:-\s*([A-Z0-9]*))?\s*(?:-\s*([A-Z0-9]*))?/);
  if (m) return { pos: m[1], flight: normFlight(m[2]), date: m[3], pbln: m[6] || "", raw: s };
  // Sadece pozisyon kodu (elle giriş): aktif checklist'te varsa ya da kod biçimine uyuyorsa
  const inList = list && list.items.some((i) => i.code === s);
  if (inList || /^[A-Z\/]{0,6}\d{1,6}[A-Z]?$/.test(s) || /^[A-Z]+-[A-Z]+\d*$/.test(s)) {
    return { pos: s, flight: null, date: null, raw: s, posOnly: true };
  }
  return null;
}
