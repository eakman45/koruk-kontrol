// CheckListRT PDF ayrıştırıcı.
// Yolcu isimleri (Pax List) okunmaz ve saklanmaz; sadece uçuş bilgisi, pozisyonlar,
// yemek sayıları ve özet tablo alınır.
import { normFlight } from "./label.js";
import { OVEN_CAPACITY } from "./config.js";

const GALLEY_FIX = { BUL: "BULK", GLY: "GLYT", ONT: "ONTRAY", CAR: "CARGO" };

// Özet tablo kategorisi -> tip
export const SUMMARY_TYPES = {
  "STANDARD UNIT (S/U)": "unit",
  "CUPBOARD": "cupboard",
  "FULL SIZE TROLLEY": "full",
  "HALF SIZE TROLLEY": "half",
  "OVEN": "oven",
  "PLASTIC BAG": "plasticBag",
  "BAG": "bag",
  "BAG-FIRIN": "ovenBag",
  "ICE UNIT": "iceUnit",
  "STRAFOR BOX": "strafor",
};

export function typeOf(raw) {
  const t = raw.toUpperCase();
  if (t.startsWith("1/1 TRL")) return "full";
  if (t.startsWith("1/2 TRL")) return "half";
  if (t.startsWith("S/U")) return "unit";
  if (t.startsWith("OVEN")) return "oven";
  if (t.startsWith("CUPBOARD") || t.startsWith("DOLAP")) return "cupboard";
  if (t.startsWith("ICE UNIT")) return "iceUnit";
  if (t.startsWith("ICE DRW")) return "iceDrawer";
  if (t.startsWith("STRAFOR")) return "strafor";
  if (t.startsWith("TRAY INTO")) return "tray";
  if (t.startsWith("CANTA-FIRIN") || t.startsWith("CANTA FIRIN")) return "ovenBag";
  if (t.startsWith("CANTA")) return "bag";
  if (t.startsWith("POSET")) return "plasticBag";
  if (t.startsWith("BULK")) return "bulk";
  if (t.startsWith("SEPET")) return "basket";
  return "other";
}

const POS_RE = /^([A-Z\/]{0,6}\d{1,6}[A-Z]?|DONUS)-(S\/U|OVEN|CUPBOARD|1\/1 TRL|1\/2 TRL|ICE DRW|TRAY INTO|CANTA|POSET|BULK\d*|CRG|SEPET\d+|[A-Z][A-Z0-9\/ ]{1,30})(.*)$/;
const SEAL_RE = /^TK[A-Z]?\d{5,}/;

/**
 * @param {*} pdfjs pdf.js kütüphanesi (window.pdfjsLib)
 * @param {Uint8Array} data PDF içeriği
 */
export async function parseChecklist(pdfjs, data) {
  const doc = await pdfjs.getDocument({ data }).promise;
  let flight = null, date = null;
  const info = {};
  const items = new Map();
  const summary = {};
  const meals = {}; // leg -> {Y/C: n, B/C: n, ...}

  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    const its = tc.items
      .filter((i) => i.str && i.str.trim())
      .map((i) => ({ s: i.str.trim(), x: i.transform[4], y: i.transform[5] }));
    const sameRow = (i, tol = 2) => its.filter((j) => Math.abs(j.y - i.y) < tol).sort((a, b) => a.x - b.x);

    // Başlık: "Flight No: TK1977 / Flight Date: 12.11.2026"
    for (const i of its) {
      const m = i.s.match(/Flight No:\s*(TK\s*\d+)\s*\/\s*Flight Date:\s*(\d{2})\.(\d{2})\.(\d{2,4})/i);
      if (m && !flight) { flight = normFlight(m[1]); date = `${m[2]}.${m[3]}.${m[4].slice(-2)}`; }
    }

    // Uçuş bilgi tablosu (kalkış saati, varış, uçak, tescil, park)
    if (!info.dest) {
      const hdr = its.find((i) => i.s === "Destination");
      if (hdr) {
        const heads = sameRow(hdr);
        const valRow = its
          .filter((i) => i.y < hdr.y - 4 && i.y > hdr.y - 25)
          .filter((i, _, arr) => Math.abs(i.y - Math.max(...arr.map((a) => a.y))) < 2);
        const pick = (label) => {
          const h = heads.find((x) => x.s === label);
          if (!h) return "";
          const v = valRow.slice().sort((a, b) => Math.abs(a.x - h.x) - Math.abs(b.x - h.x))[0];
          return v && Math.abs(v.x - h.x) < 30 ? v.s : "";
        };
        info.time = pick("Dept. Time");
        info.dest = pick("Destination");
        info.aircraft = pick("Aircraft");
        info.reg = pick("AC Reg. No");
        info.park = pick("Park Pos");
      }
    }

    // Yemek tablosu: "2 IST Y/C 122 HMYD - Hot Meal YC"
    for (const i of its) {
      if (!/^(Y\/C|B\/C|CR|CO1?|CA)$/.test(i.s)) continue;
      const row = sameRow(i);
      const k = row.indexOf(i);
      const leg = row.slice(0, k).find((j) => /^\d{1,2}$/.test(j.s));
      const st = row.slice(0, k).find((j) => /^[A-Z]{3}$/.test(j.s));
      const pax = row.slice(k + 1).find((j) => /^\d{1,4}$/.test(j.s));
      if (leg) {
        meals[leg.s] ??= { to: st ? st.s : "" };
        if (pax && /\/C$/.test(i.s) && meals[leg.s][i.s] == null) meals[leg.s][i.s] = Number(pax.s);
      }
    }

    // Özet tablo
    for (const i of its) {
      if (!SUMMARY_TYPES[i.s] && i.s !== "TOTAL COUNT") continue;
      const nums = its.filter((j) => Math.abs(j.y - i.y) < 2.5 && j.x > i.x && /^\d+$/.test(j.s)).sort((a, b) => a.x - b.x);
      if (nums.length) summary[i.s] = Number(nums[0].s);
    }

    // Pozisyon satırları
    const rows = [];
    for (const i of its) {
      const m = i.s.match(POS_RE);
      if (!m || /^\d{2}\.\d{2}/.test(i.s)) continue;
      rows.push({ i, code: m[1], type: (m[2] + m[3]).trim() });
    }
    if (!rows.length) continue;
    const xs = {};
    rows.forEach((r) => { const k = Math.round(r.i.x / 4); xs[k] = (xs[k] || 0) + 1; });
    const colX = Number(Object.entries(xs).sort((a, b) => b[1] - a[1])[0][0]) * 4;
    const posRows = rows.filter((r) => Math.abs(r.i.x - colX) < 8).sort((a, b) => b.i.y - a.i.y);
    const galleyMarks = its.filter((i) => i.x < colX - 20 && /^([A-Z]{1,4}\d{1,2}|[A-Z]{2,4})$/.test(i.s)).sort((a, b) => b.y - a.y);

    let galley = "";
    for (let k = 0; k < posRows.length; k++) {
      const r = posRows[k], y = r.i.y;
      const lowY = k + 1 < posRows.length ? Math.max(posRows[k + 1].i.y + 1.5, y - 20) : y - 12;
      const gm = galleyMarks.filter((g) => g.y >= y - 1.5 && g.y <= y + 4);
      if (gm.length) galley = GALLEY_FIX[gm[0].s] || gm[0].s;
      const near = its.filter((i) => i !== r.i && i.y <= y + 1.5 && i.y >= y - 6);
      const sealed = near.some((i) => i.s === "*" && i.x < colX);
      const desc = its
        .filter((i) => i !== r.i && i.x > colX + 30 && i.y <= y + 1.5 && i.y > lowY && !SEAL_RE.test(i.s) && !/^\d+$/.test(i.s))
        .sort((a, b) => b.y - a.y || a.x - b.x)
        .map((i) => i.s).join(" ").replace(/\s+/g, " ").trim();
      let code = r.code, rawType = r.type.replace(/\s+X$/, "");
      if (/^SEPET\d+/.test(rawType)) { code = code + "-" + rawType; rawType = "SEPET"; }
      if (code === "DONUS" && /^BULK/.test(rawType)) { code = "DONUS-" + rawType.split(" ")[0]; rawType = "BULK"; }
      if (items.has(code)) { const o = items.get(code); o.sealed = o.sealed || sealed; continue; }
      items.set(code, {
        code, galley, type: typeOf(rawType), rawType, desc, sealed,
        ret: /DONUS/i.test(desc + " " + rawType),
      });
    }
  }

  if (!flight) throw new Error("NO_FLIGHT");
  if (!items.size) throw new Error("NO_ITEMS");
  const list = [...items.values()];

  // Dönüş fırın çantası ihtiyacı = dönüş bacağı Y/C sıcak yemek / 32 (yukarı yuvarlanır)
  const legs = Object.keys(meals).map(Number).sort((a, b) => a - b);
  let oven = null;
  if (list.some((i) => i.type === "ovenBag") && legs.length > 1) {
    const leg = legs[legs.length - 1], pax = meals[leg]["Y/C"] || 0;
    oven = { leg, pax, need: Math.ceil(pax / OVEN_CAPACITY), rows: list.filter((i) => i.type === "ovenBag").length, summary: summary["BAG-FIRIN"] ?? null };
  }

  // Operasyon kuralı: YC sıcak havlu kargoya verilmez
  const notices = [];
  for (const i of list) {
    if (i.galley === "CARGO" && /SICAK HAVLU/.test(i.desc)) { i.warn = "towelCargo"; notices.push({ type: "towelCargo", code: i.code }); }
  }

  const check = checkSummary(list, summary, oven);
  const route = legs.map((l) => meals[l].to).filter(Boolean);

  return {
    key: flight + "|" + date, flight, date,
    info: { ...info, route: route.length ? ["IST", ...route].join("–") : "" },
    meals, items: list, summary, oven, notices, check,
  };
}

export function checkSummary(items, summary, oven) {
  const cats = Object.keys(summary).filter((k) => SUMMARY_TYPES[k]);
  if (!cats.length) return { ok: null, diffs: [] };
  const diffs = [];
  for (const c of cats) {
    const t = SUMMARY_TYPES[c];
    if (t === "ovenBag" && oven) {
      if (summary[c] !== oven.need) diffs.push({ cat: c, pdf: summary[c], found: oven.need, calc: true });
      continue;
    }
    const n = items.filter((i) => i.type === t).length;
    if (n !== summary[c]) diffs.push({ cat: c, pdf: summary[c], found: n });
  }
  for (const [c, t] of Object.entries(SUMMARY_TYPES)) {
    if (summary[c] == null) { const n = items.filter((i) => i.type === t).length; if (n) diffs.push({ cat: c, pdf: 0, found: n }); }
  }
  return { ok: diffs.length === 0, diffs };
}
