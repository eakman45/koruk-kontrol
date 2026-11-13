// Yerel depolama katmanı. İleride merkezi sunucuya geçişte bu modülün yerine
// aynı arayüzü sağlayan bir API istemcisi konacak.
import { STORE_KEY, LEGACY_KEYS, HISTORY_LIMIT } from "./config.js";

const empty = () => ({
  version: 1,
  settings: { lang: "tr", sound: true, countGalleyOvens: false, lastDock: "" },
  operator: null,          // {sicil, name}
  checklists: {},          // key -> parsed checklist (bekleyen)
  session: null,           // aktif yükleme
  history: [],             // tamamlanan yüklemeler
});

let state = empty();
let storageOk = true;

function readRaw(k) { try { return localStorage.getItem(k); } catch { storageOk = false; return null; } }

export function load() {
  const raw = readRaw(STORE_KEY);
  if (raw) {
    try { state = Object.assign(empty(), JSON.parse(raw)); state.settings = Object.assign(empty().settings, state.settings); }
    catch { state = empty(); }
  } else {
    migrateLegacy();
  }
  return state;
}

// Prototip sürümünden tamamlanan yüklemeleri taşı
function migrateLegacy() {
  try {
    const h = JSON.parse(readRaw("kk_hist") || "[]");
    if (Array.isArray(h) && h.length) {
      state.history = h.map((x) => ({
        id: "legacy-" + x.key + "-" + x.at, key: x.key, flight: x.flight, date: x.date,
        finishedAt: null, finishedLabel: x.at, done: x.rd, total: x.rt, alarms: x.alarms || 0,
        report: x.report, operator: null, legacy: true,
      }));
    }
    LEGACY_KEYS.forEach((k) => { try { localStorage.removeItem(k); } catch {} });
    save();
  } catch {}
}

export function save() {
  if (state.history.length > HISTORY_LIMIT) state.history.length = HISTORY_LIMIT;
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); storageOk = true; }
  catch { storageOk = false; }
  return storageOk;
}

export function get() { return state; }
export function isPersistent() { return storageOk; }

export function wipe() { state = empty(); save(); }
