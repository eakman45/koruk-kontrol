// Kontrol kuralları (arayüzden bağımsız, saf fonksiyonlar)
import { parseLabel } from "./label.js";

// Etiketi olmayan / ayrı okutulmayan kalemler
export function isOntray(it) { return it.galley === "ONTRAY" || it.type === "basket"; }

/** Kalem tek başına zorunlu mu? (fırın çantaları adet kotasıyla sayılır) */
export function isRequired(it, list, settings = {}) {
  if (isOntray(it)) return false;
  if (it.type === "ovenBag" && list && list.oven) return false;
  if (it.type === "oven") return !!settings.countGalleyOvens;
  return true;
}

export function ovenHave(list, session) {
  return list.items.filter((i) => i.type === "ovenBag" && session.scans[i.code]).length;
}

/** İlerleme: {done, total} */
export function progress(list, session, settings) {
  let done = 0, total = 0;
  for (const it of list.items) {
    if (!isRequired(it, list, settings)) continue;
    total++; if (session.scans[it.code]) done++;
  }
  if (list.oven) { total += list.oven.need; done += Math.min(list.oven.need, ovenHave(list, session)); }
  return { done, total };
}

/** Eksikler; fırın çantası kotası tek sanal satır olarak döner */
export function missing(list, session, settings) {
  const m = list.items.filter((it) => isRequired(it, list, settings) && !session.scans[it.code]);
  if (list.oven) {
    const h = ovenHave(list, session);
    if (h < list.oven.need) m.unshift({ virtual: "ovenBag", code: "FIRIN", type: "ovenBag", galley: "CARGO", have: h, need: list.oven.need, count: list.oven.need - h, ret: true });
  }
  return m;
}
export function missingCount(m) { return m.reduce((a, x) => a + (x.virtual ? x.count : 1), 0); }

/**
 * Okunan kodu değerlendirir. Oturumu değiştirmez.
 * @returns {{kind:'ok'|'warn'|'bad', type:string, label?:object, item?:object}}
 */
export function evaluateScan(raw, list, session, { allowPosOnly = false } = {}) {
  if (!session || !list) return { kind: "bad", type: "NO_SESSION" };
  const label = parseLabel(raw, list);
  if (!label) return { kind: "bad", type: "UNREADABLE", raw };
  // Okunan bir barkodda uçuş ve tarih yoksa kabul edilmez (yanlış uçuş kontrolü atlanamaz).
  // Sadece pozisyon kodu yalnızca elle girişte kabul edilir.
  if (label.posOnly && !allowPosOnly) return { kind: "bad", type: "UNREADABLE", raw };
  if (label.posOnly) { label.flight = session.flight; label.date = session.date; }
  if (label.flight !== session.flight) return { kind: "bad", type: "WRONG_FLIGHT", label };
  if (label.date !== session.date) return { kind: "bad", type: "WRONG_DATE", label };
  const prev = session.scans[label.pos] || session.extra[label.pos];
  if (prev) return { kind: "warn", type: "DUPLICATE", label, prev };
  const item = list.items.find((i) => i.code === label.pos);
  if (!item) {
    if (/^CRG/.test(label.pos)) return { kind: "ok", type: "OK_CARGO", label };
    return { kind: "warn", type: "NOT_IN_LIST", label };
  }
  if (item.type === "ovenBag" && list.oven && ovenHave(list, session) >= list.oven.need) {
    return { kind: "ok", type: "OK_EXTRA_OVENBAG", label, item };
  }
  return { kind: "ok", type: "OK", label, item };
}

/** Değerlendirme sonucunu oturuma işler ve olayı kaydeder */
export function applyScan(session, res, source, now = new Date()) {
  const t = now.toISOString();
  if (res.type === "OK" || res.type === "OK_EXTRA_OVENBAG") session.scans[res.label.pos] = { t, src: source };
  else if (res.type === "OK_CARGO" || res.type === "NOT_IN_LIST") session.extra[res.label.pos] = { t, src: source, cargo: res.type === "OK_CARGO" };
  session.events.push({
    t, kind: res.kind, type: res.type, src: source,
    pos: res.label ? res.label.pos : null,
    flight: res.label ? res.label.flight : null,
    date: res.label ? res.label.date : null,
    raw: res.type === "UNREADABLE" ? String(res.raw).slice(0, 80) : undefined,
  });
}
