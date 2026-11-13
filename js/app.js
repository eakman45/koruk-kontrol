import { APP_VERSION } from "./config.js";
import * as store from "./store.js";
import { parseChecklist } from "./parser.js";
import { evaluateScan, applyScan, progress, missing, missingCount, isRequired, isOntray, ovenHave } from "./rules.js";
import { initDecoder, decodeFile, LiveScanner, liveSupported, attachKeyboardWedge } from "./scanner.js";
import { beep, unlockAudio } from "./audio.js";

/* ---------- yardımcılar ---------- */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const hm = (iso) => new Date(iso).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
const dt = (iso) => new Date(iso).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const I = {
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  alert: '<svg viewBox="0 0 24 24"><path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.01"/></svg>',
  info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.01"/></svg>',
  scan: '<svg viewBox="0 0 24 24"><path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3M7 12h10"/></svg>',
  doc: '<svg viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>',
  list: '<svg viewBox="0 0 24 24"><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/></svg>',
  cam: '<svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  key: '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10"/></svg>',
  clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  sound: '<svg viewBox="0 0 24 24"><path d="M4 10v4h4l5 4V6L8 10z"/><path d="M16 9a4 4 0 0 1 0 6"/></svg>',
  stop: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M8 8l8 8"/></svg>',
};
const TYPE_NAMES = { full: "Full size", half: "Half size", unit: "Unit", oven: "Fırın", cupboard: "Cupboard", iceUnit: "Buz unit", iceDrawer: "Buz çekmece", strafor: "Strafor", tray: "Tray", ovenBag: "Fırın çanta", bag: "Çanta", plasticBag: "Poşet", bulk: "Bulk", basket: "Sepet", other: "Diğer" };
const typeName = (t) => TYPE_NAMES[t] || t;

/* ---------- durum ---------- */
const S = store.load();
const list = () => (S.session ? S.checklists[S.session.key] : null);
let listMode = "missing";
let view = "home";

/* ---------- toast & sheet ---------- */
let toastT = 0;
function toast(msg) { const t = $("toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("on"), 2400); }
function sheet(html) { $("sheet").innerHTML = html; $("sheetBg").classList.add("on"); }
function closeSheet() { $("sheetBg").classList.remove("on"); }
$("sheetBg").addEventListener("click", (e) => { if (e.target.id === "sheetBg") closeSheet(); });
function confirmSheet({ title, text, ok, danger, onOk }) {
  sheet(`<h2>${esc(title)}</h2>${text ? `<p>${esc(text)}</p>` : ""}<div class="actions"><button class="btn ghost" data-a="no">Vazgeç</button><button class="btn ${danger ? "danger" : "primary"}" data-a="yes">${esc(ok)}</button></div>`);
  $("sheet").querySelector('[data-a="no"]').onclick = closeSheet;
  $("sheet").querySelector('[data-a="yes"]').onclick = () => { closeSheet(); onOk(); };
}

/* ---------- geri bildirim ---------- */
const MSG = {
  OK: (r) => [`${r.label.pos}`, `${typeName(r.item.type)} · ${r.item.desc}${r.item.ret ? " · Dönüş" : ""}`],
  OK_EXTRA_OVENBAG: (r) => [`${r.label.pos}`, `Fırın çanta · gereken ${list().oven.need} adet zaten tamam`],
  OK_CARGO: (r) => [`${r.label.pos}`, "Kargo · uçuş ve tarih doğru"],
  WRONG_FLIGHT: (r) => ["Yanlış uçuş", `Etiket ${r.label.flight} · ${r.label.date} · poz. ${r.label.pos}`],
  WRONG_DATE: (r) => ["Yanlış tarih", `Etiket tarihi ${r.label.date} · poz. ${r.label.pos}`],
  DUPLICATE: (r) => ["Zaten okundu", `Poz. ${r.label.pos} · ${hm(r.prev.t)}`],
  NOT_IN_LIST: (r) => ["Listede yok", `Poz. ${r.label.pos} bu checklist'te yok`],
  UNREADABLE: (r) => ["Tanınmayan kod", String(r.raw).slice(0, 60)],
  NO_SESSION: () => ["Checklist yok", "Önce kamyonun checklist'ini yükle"],
};
const ICON_FOR = { ok: I.check, warn: I.alert, bad: I.x, idle: I.scan };
function feedback(kind, title, sub, flash) {
  const f = $("fb");
  f.className = "feedback " + kind;
  $("fbIcon").innerHTML = ICON_FOR[kind] || I.scan;
  $("fbTitle").textContent = title;
  $("fbSub").textContent = sub || "";
  if (flash) { void f.offsetWidth; f.classList.add("flash"); }
  live.result(kind, title, sub);
}

/* ---------- okuma ---------- */
function onCode(raw, src) {
  unlockAudio();
  const l = list();
  const res = evaluateScan(raw, l, S.session);
  if (S.session && res.type !== "NO_SESSION") { applyScan(S.session, res, src); store.save(); }
  const [t, s] = MSG[res.type](res);
  feedback(res.kind, t, s, res.kind !== "ok");
  beep(res.kind, S.settings.sound);
  if (view === "load") window.scrollTo({ top: 0, behavior: "smooth" });
  render();
}
attachKeyboardWedge((c) => onCode(c, "scanner"));

function manualConfirm(code) {
  const l = list(), it = l.items.find((i) => i.code === code);
  confirmSheet({
    title: `${code} elle onaylansın mı?`,
    text: `${typeName(it.type)} · ${it.desc}. Etiket okunamıyorsa kullan; raporda "elle" olarak görünür.`,
    ok: "Elle onayla",
    onOk: () => onCode(code, "manual"),
  });
}
function undoScan(code) {
  const s = S.session.scans[code];
  confirmSheet({
    title: `${code} işareti kaldırılsın mı?`,
    text: `${hm(s.t)} saatinde ${s.src === "manual" ? "elle onaylandı" : "okundu"}.`,
    ok: "Kaldır", danger: true,
    onOk: () => { delete S.session.scans[code]; S.session.events.push({ t: new Date().toISOString(), kind: "warn", type: "UNDO", pos: code }); store.save(); render(); },
  });
}

/* ---------- checklist yükleme ---------- */
$("pdfIn").addEventListener("change", async (e) => {
  const f = e.target.files[0]; e.target.value = ""; closeSheet();
  if (!f) return;
  toast("Checklist okunuyor…");
  let L;
  try { L = await parseChecklist(window.pdfjsLib, new Uint8Array(await f.arrayBuffer())); }
  catch (err) {
    const m = err.message === "NO_FLIGHT" || err.message === "NO_ITEMS" ? "Bu dosya bir checklist gibi görünmüyor." : "PDF okunamadı.";
    sheet(`<div class="result bad">${I.x}<div><b>Checklist okunamadı</b>${esc(f.name)}</div></div><p>${m} CheckListRT PDF'ini yüklediğinden emin ol.</p><button class="btn ghost" id="sClose">Tamam</button>`);
    $("sClose").onclick = closeSheet; beep("bad", S.settings.sound); return;
  }
  L.file = f.name; L.loadedAt = new Date().toISOString();
  const ses = S.session;
  if (ses && ses.key === L.key) { S.checklists[L.key] = Object.assign(L, { notices: L.notices }); store.save(); toast("Aynı checklist, kontrol devam ediyor"); render(); return; }
  if (ses && Object.keys(ses.scans).length) {
    const l = list(), n = missingCount(missing(l, ses, S.settings));
    sheet(`<div class="result bad">${I.alert}<div><b>${esc(ses.flight)} bitmedi</b>${n} eksik var</div></div><p>Aktif yükleme tamamlanmadan yeni checklist başlatılamaz.</p><button class="btn primary" id="sClose">Yüklemeye dön</button>`);
    $("sClose").onclick = closeSheet; beep("bad", S.settings.sound); return;
  }
  const done = S.history.find((h) => h.key === L.key);
  if (done) {
    confirmSheet({ title: `${L.flight} zaten tamamlandı`, text: `${L.date} uçuşu ${done.finishedAt ? dt(done.finishedAt) : done.finishedLabel} tarihinde tamamlandı. Yine de yeni kontrol başlatılsın mı?`, ok: "Başlat", onOk: () => start(L) });
    beep("warn", S.settings.sound); return;
  }
  start(L);
});

function start(L) {
  if (S.session && S.session.key !== L.key) delete S.checklists[S.session.key];
  S.checklists = { [L.key]: L };
  S.session = { id: L.key + "|" + Date.now(), key: L.key, flight: L.flight, date: L.date, startedAt: new Date().toISOString(), scans: {}, extra: {}, events: [] };
  store.save();
  listMode = "missing";
  go("load");
  const p = progress(L, S.session, S.settings);
  feedback("idle", "Etiketleri okut", `${p.total} kalem bekleniyor`);
  if (L.notices.length || (L.check && L.check.ok === false)) beep("warn", S.settings.sound);
}

/* ---------- tamamlama ---------- */
function reportText(L, ses, done, finishedAt) {
  const p = progress(L, ses, S.settings);
  const ev = ses.events;
  const alarms = ev.filter((e) => e.kind === "bad");
  const manual = Object.entries(ses.scans).filter(([, v]) => v.src === "manual").map(([k]) => k);
  const extra = Object.keys(ses.extra);
  let t = `KÖRÜK YÜKLEME KONTROLÜ\n${ses.flight} · ${ses.date}${L.info.route ? " · " + L.info.route : ""}\n`;
  if (L.info.aircraft) t += `Uçak: ${L.info.aircraft}${L.info.reg ? " " + L.info.reg : ""}${L.info.park ? " · Park " + L.info.park : ""}\n`;
  t += `Başlangıç: ${dt(ses.startedAt)}  Bitiş: ${dt(finishedAt)}\n`;
  t += `Sonuç: ${done ? "TAMAMLANDI" : "EKSİK"} · ${p.done}/${p.total}\n`;
  if (L.oven) t += `Fırın çanta: ${Math.min(ovenHave(L, ses), L.oven.need)}/${L.oven.need} (dönüş Y/C ${L.oven.pax} yemek ÷ 32)\n`;
  if (manual.length) t += `Elle onaylanan: ${manual.join(", ")}\n`;
  if (extra.length) t += `Liste dışı okutulan: ${extra.join(", ")}\n`;
  if (alarms.length) t += `Alarmlar (${alarms.length}):\n` + alarms.map((a) => `  ${hm(a.t)} ${MSG[a.type] ? MSG[a.type]({ label: { pos: a.pos, flight: a.flight, date: a.date }, raw: a.raw })[0] : a.type}${a.flight ? ` · ${a.flight} ${a.date}` : ""}${a.pos ? ` · ${a.pos}` : ""}`).join("\n") + "\n";
  if (L.notices.length) t += `Checklist uyarısı: ${L.notices.map(noticeText).join(" ")}\n`;
  return t;
}

$("finishBtn").addEventListener("click", () => {
  const L = list(), ses = S.session;
  if (!L) return;
  const m = missing(L, ses, S.settings);
  if (m.length) {
    beep("bad", S.settings.sound);
    sheet(`<div class="result bad">${I.x}<div><b>${missingCount(m)} eksik</b>Eksikler okutulmadan yükleme tamamlanamaz</div></div>${groupedRows(m)}<div class="actions"><button class="btn primary" id="sBack">Yüklemeye dön</button></div>`);
    $("sBack").onclick = closeSheet; return;
  }
  const finishedAt = new Date().toISOString();
  const rep = reportText(L, ses, true, finishedAt);
  const p = progress(L, ses, S.settings);
  const alarms = ses.events.filter((e) => e.kind === "bad").length;
  beep("ok", S.settings.sound);
  sheet(`<div class="result ok">${I.check}<div><b>Yükleme tamam</b>${p.done}/${p.total} kalem okundu</div></div>
    <dl class="kv"><dt>Uçuş</dt><dd>${esc(ses.flight)} · ${esc(ses.date)}</dd>${L.info.route ? `<dt>Rota</dt><dd>${esc(L.info.route)}</dd>` : ""}<dt>Süre</dt><dd>${hm(ses.startedAt)} – ${hm(finishedAt)}</dd><dt>Alarm</dt><dd>${alarms || "Yok"}</dd></dl>
    <div class="actions"><button class="btn primary" id="sDone">Tamamla</button></div>`);
  $("sDone").onclick = () => {
    S.history.unshift({ id: ses.id, key: ses.key, flight: ses.flight, date: ses.date, route: L.info.route, startedAt: ses.startedAt, finishedAt, done: p.done, total: p.total, alarms, manual: Object.values(ses.scans).filter((v) => v.src === "manual").length, report: rep });
    S.session = null; S.checklists = {};
    store.save(); closeSheet(); go("home");
    toast(`${ses.flight} tamamlandı`);
  };
});

/* ---------- görünümler ---------- */
function go(v) {
  view = v;
  $("homeView").classList.toggle("hide", v !== "home");
  $("loadView").classList.toggle("hide", v !== "load");
  $("histView").classList.toggle("hide", v !== "hist");
  $("bottom").classList.toggle("hide", v !== "load");
  window.scrollTo(0, 0);
  render();
}

function noticeText(n) {
  if (n.type === "towelCargo") return `${n.code}: sıcak havlu kargo pozisyonunda. Sıcak havlu kargoya verilmez, uçakta uygun pozisyona yerleştirilmeli.`;
  return n.type;
}

function rowHtml(it, L) {
  if (it.virtual) return `<div class="row na"><div class="mk"></div><div class="code">${it.count}× Fırın çanta</div><div class="desc">${it.have}/${it.need} okundu<small>Dönüş Y/C ${L.oven.pax} yemek ÷ 32</small><div class="tags"><span class="tag ret">Dönüş</span></div></div></div>`;
  const s = S.session.scans[it.code];
  const req = isRequired(it, L, S.settings);
  const quota = it.type === "ovenBag" && L.oven;
  const cls = s ? (s.src === "manual" ? "manual" : "done") : (!req && !quota ? "na" : "");
  const note = isOntray(it) ? "Dönüş trolleylerinin içinde" : it.type === "oven" && !req ? "Etiketsiz · sayılmaz" : quota ? `${L.oven.need} adet yeterli` : "";
  const tags = (it.ret ? '<span class="tag ret">Dönüş</span>' : "") + (it.warn ? '<span class="tag warn">Kargoya verilmez</span>' : "");
  return `<div class="row ${cls}" ${cls === "na" ? "" : `data-code="${esc(it.code)}"`}><div class="mk">${s ? I.check : ""}</div><div class="code">${esc(it.code)}</div><div class="desc">${esc(it.desc)}<small>${esc(typeName(it.type))}${note ? " · " + esc(note) : ""}${s ? " · " + (s.src === "manual" ? "elle " : "") + hm(s.t) : ""}</small>${tags ? `<div class="tags">${tags}</div>` : ""}</div></div>`;
}
function groupedRows(arr) {
  const L = list(), g = {};
  arr.forEach((it) => (g[it.galley || "—"] ??= []).push(it));
  return Object.entries(g).map(([k, v]) => `<div class="group">${esc(k)}</div><div class="card-list">${v.map((it) => rowHtml(it, L)).join("")}</div>`).join("");
}

function renderHome() {
  const h = S.history.slice(0, 3);
  $("recent").innerHTML = h.length ? `<div class="section-title"><h3>Son tamamlananlar</h3><button class="link" id="seeAll">Tümü</button></div><div class="card-list hist">${h.map(histRow).join("")}</div>` : "";
  const sa = $("seeAll"); if (sa) sa.onclick = () => go("hist");
}
function histRow(h, i) {
  return `<div class="row" data-h="${S.history.indexOf(h)}"><div class="mk">${I.check}</div><div class="desc"><b style="color:var(--ink)">${esc(h.flight)}</b> · ${esc(h.date)}<small>${h.finishedAt ? dt(h.finishedAt) : esc(h.finishedLabel || "")} · ${h.done}/${h.total}${h.route ? " · " + esc(h.route) : ""}</small></div>${h.alarms ? `<span class="badge">${h.alarms} alarm</span>` : ""}</div>`;
}

function renderLoad() {
  const L = list(), ses = S.session;
  if (!L) return;
  $("fNo").textContent = L.flight;
  const meta = [L.date, L.info.route, L.info.aircraft && `${L.info.aircraft}${L.info.reg ? " " + L.info.reg : ""}`, L.info.park && "Park " + L.info.park].filter(Boolean);
  $("fMeta").textContent = meta.join(" · ");
  const p = progress(L, ses, S.settings);
  $("pDone").textContent = p.done; $("pTotal").textContent = "/" + p.total;
  $("ringFg").style.strokeDashoffset = String(97.4 * (1 - (p.total ? p.done / p.total : 0)));
  $("ringFg").style.stroke = p.done === p.total ? "var(--ok)" : "var(--ink)";
  // uyarılar
  const n = [];
  if (L.oven) n.push(`<div class="notice info">${I.info}<span>Dönüş Y/C ${L.oven.pax} yemek → <b>${L.oven.need} fırın çanta</b> gerekiyor.</span></div>`);
  L.notices.forEach((x) => n.push(`<div class="notice">${I.alert}<span>${esc(noticeText(x))}</span></div>`));
  if (L.check && L.check.ok === false) n.push(`<div class="notice">${I.alert}<span>Checklist satırları ile özet tablo farklı: ${esc(L.check.diffs.map((d) => `${d.cat} özette ${d.pdf}, ${d.calc ? "hesaplanan" : "satırlarda"} ${d.found}`).join("; "))}. Liste checklist satırlarına göre oluşturuldu.</span></div>`);
  $("notices").innerHTML = n.join("");
  // liste
  const m = missing(L, ses, S.settings), mc = missingCount(m);
  $("cMiss").textContent = mc ? `(${mc})` : "";
  document.querySelectorAll("#seg button").forEach((b) => b.classList.toggle("on", b.dataset.v === listMode));
  let h = "";
  if (listMode === "missing") {
    h = m.length ? groupedRows(m) : `<div class="all-done">${I.check}<span>Eksik yok. Yüklemeyi tamamlayabilirsin.</span></div>`;
  } else {
    h = groupedRows(L.items);
  }
  const ex = Object.keys(ses.extra);
  if (ex.length) h += `<div class="group">LİSTE DIŞI OKUTULANLAR</div><div class="card-list">${ex.map((k) => `<div class="row ${ses.extra[k].cargo ? "done" : ""}"><div class="mk" ${ses.extra[k].cargo ? "" : 'style="background:var(--warn);border-color:var(--warn)"'}>${ses.extra[k].cargo ? I.check : "?"}</div><div class="code">${esc(k)}</div><div class="desc">${ses.extra[k].cargo ? "Kargo" : "Checklist'te yok"}<small>${hm(ses.extra[k].t)}</small></div></div>`).join("")}</div>`;
  $("items").innerHTML = h;
  $("finishBtn").textContent = mc ? `Yüklemeyi tamamla · ${mc} eksik` : "Yüklemeyi tamamla";
}

function renderHist() {
  $("histList").innerHTML = S.history.length ? `<div class="card-list hist">${S.history.map(histRow).join("")}</div>` : `<div class="empty">Henüz tamamlanan yükleme yok.</div>`;
}
function openReport(i) {
  const h = S.history[i];
  sheet(`<h2>${esc(h.flight)} · ${esc(h.date)}</h2><dl class="kv"><dt>Tamamlandı</dt><dd>${h.finishedAt ? dt(h.finishedAt) : esc(h.finishedLabel || "")}</dd><dt>Okunan</dt><dd>${h.done}/${h.total}</dd><dt>Alarm</dt><dd>${h.alarms || "Yok"}</dd></dl><pre class="report" id="rep">${esc(h.report)}</pre><div class="actions"><button class="btn ghost" id="sClose">Kapat</button><button class="btn primary" id="sShare">Paylaş</button></div>`);
  $("sClose").onclick = closeSheet;
  $("sShare").onclick = () => shareText(h.report, $("sShare"));
}
async function shareText(text, btn) {
  try { if (navigator.share) { await navigator.share({ text }); return; } } catch (e) { if (e && e.name === "AbortError") return; }
  try { await navigator.clipboard.writeText(text); btn.textContent = "Kopyalandı"; }
  catch { const r = document.createRange(); r.selectNodeContents($("rep")); const s = getSelection(); s.removeAllRanges(); s.addRange(r); btn.textContent = "Metin seçildi"; }
}

function render() {
  if (view === "load" && !S.session) view = "home";
  if (view === "home") renderHome();
  if (view === "load") renderLoad();
  if (view === "hist") renderHist();
}

/* ---------- olaylar ---------- */
document.addEventListener("click", (e) => {
  const h = e.target.closest("[data-h]");
  if (h) { openReport(+h.dataset.h); return; }
  const r = e.target.closest("#items .row[data-code], #sheet .row[data-code]");
  if (r && S.session) { closeSheet(); const c = r.dataset.code; S.session.scans[c] ? undoScan(c) : manualConfirm(c); }
});
$("seg").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { listMode = b.dataset.v; render(); } });
$("histBack").onclick = () => go(S.session ? "load" : "home");

$("menuBtn").onclick = () => {
  const ses = S.session;
  const items = [];
  if (!ses) items.push(`<label class="menu-item" for="pdfIn">${I.doc}Checklist yükle</label>`);
  if (ses) items.push(`<button class="menu-item" data-m="photo">${I.cam}Fotoğrafla oku</button>`, `<button class="menu-item" data-m="manual">${I.key}Pozisyon kodu gir</button>`, `<button class="menu-item" data-m="log">${I.list}Okutma kaydı<span class="end">${ses.events.length}</span></button>`);
  items.push(`<button class="menu-item" data-m="hist">${I.clock}Tamamlanan yüklemeler<span class="end">${S.history.length}</span></button>`);
  items.push(`<label class="menu-item">${I.sound}Ses<input type="checkbox" id="mSound" ${S.settings.sound ? "checked" : ""}></label>`);
  if (ses) items.push(`<button class="menu-item danger" data-m="cancel">${I.stop}Yüklemeyi iptal et</button>`);
  sheet(items.join("") + `<p class="muted" style="text-align:center;color:var(--muted);font-size:12.5px;margin:14px 0 0">Körük Kontrol v${APP_VERSION}${store.isPersistent() ? "" : " · veriler kaydedilemiyor"}</p>`);
  $("mSound").onchange = (e) => { S.settings.sound = e.target.checked; store.save(); };
  $("sheet").querySelectorAll("[data-m]").forEach((b) => (b.onclick = () => menuAction(b.dataset.m)));
};
function menuAction(m) {
  closeSheet();
  const ses = S.session;
  if (m === "photo") $("photoIn").click();
  if (m === "hist") go("hist");
  if (m === "manual") {
    sheet(`<h2>Pozisyon kodu gir</h2><p>Etiket okunamıyorsa etiketteki pozisyon kodunu yaz (örn. 520).</p><form id="mf" autocomplete="off"><input class="text" id="mIn" placeholder="520" autocapitalize="characters" spellcheck="false"><div class="actions"><button type="button" class="btn ghost" id="mNo">Vazgeç</button><button class="btn primary">Onayla</button></div></form>`);
    $("mNo").onclick = closeSheet; setTimeout(() => $("mIn").focus(), 50);
    $("mf").onsubmit = (e) => { e.preventDefault(); const v = $("mIn").value.trim(); if (v) { closeSheet(); onCode(v, /TK\s?\d/i.test(v) ? "scanner" : "manual"); } };
  }
  if (m === "log") {
    const lab = (e) => (MSG[e.type] ? MSG[e.type]({ label: { pos: e.pos, flight: e.flight, date: e.date }, item: { type: "", desc: "" }, prev: { t: e.t }, raw: e.raw })[0] : e.type === "UNDO" ? "İşaret kaldırıldı" : e.type);
    sheet(`<h2>Okutma kaydı</h2><div class="log">${ses.events.length ? ses.events.slice().reverse().map((e) => `<div class="${e.kind}"><time>${hm(e.t)}</time>${esc(e.type.startsWith("OK") ? "✓ " + (e.pos || "") : lab(e))}${e.src === "manual" ? " · elle" : ""}${e.type.startsWith("OK") ? "" : e.pos ? " · " + esc(e.pos) : ""}</div>`).join("") : '<div>Henüz okutma yok.</div>'}</div><div class="actions"><button class="btn ghost" id="sClose">Kapat</button></div>`);
    $("sClose").onclick = closeSheet;
  }
  if (m === "cancel") {
    if (Object.keys(ses.scans).length) {
      sheet(`<div class="result bad">${I.stop}<div><b>İptal edilemez</b>${esc(ses.flight)} için okutma başladı</div></div><p>Okutma başlamış bir yükleme eksiksiz tamamlanmalı.</p><button class="btn primary" id="sClose">Tamam</button>`);
      $("sClose").onclick = closeSheet; return;
    }
    confirmSheet({ title: `${ses.flight} iptal edilsin mi?`, text: "Henüz etiket okutulmadı. Yanlış checklist yüklendiyse iptal edebilirsin.", ok: "İptal et", danger: true, onOk: () => { S.session = null; S.checklists = {}; store.save(); go("home"); } });
  }
}

/* ---------- fotoğraf ---------- */
$("photoIn").addEventListener("change", async (e) => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  feedback("idle", "Okunuyor…", "");
  try {
    const codes = await decodeFile(f);
    if (!codes.length) { feedback("warn", "Kod bulunamadı", "Kare koda yaklaşıp tekrar dene", true); beep("warn", S.settings.sound); }
    else codes.forEach((c) => onCode(c, "photo"));
  } catch { feedback("bad", "Fotoğraf okunamadı", "", true); }
});

/* ---------- canlı tarama ---------- */
const live = {
  sc: null,
  async open() {
    if (!liveSupported()) { $("photoIn").click(); return; }
    this.sc = new LiveScanner($("video"), (c) => onCode(c, "live"));
    try { await this.sc.start(); }
    catch { this.sc = null; $("photoIn").click(); return; }
    $("live").classList.remove("hide");
    $("torchBtn").classList.toggle("hide", !this.sc.hasTorch());
    this.info(); this.msg("Kare kodu çerçeveye getir", "");
  },
  close() { if (this.sc) this.sc.stop(); this.sc = null; $("live").classList.add("hide"); $("alarm").classList.add("hide"); },
  info() {
    const L = list(); if (!L) return;
    const p = progress(L, S.session, S.settings);
    $("lvFlight").textContent = `${L.flight} · ${L.date}`; $("lvCount").textContent = `${p.done} / ${p.total}`;
  },
  msg(t, s) { $("lvMsg").innerHTML = esc(t) + (s ? `<small>${esc(s)}</small>` : ""); },
  t: 0,
  result(kind, title, sub) {
    if (!this.sc) return;
    this.info(); this.msg(title, sub);
    const f = $("frame"); f.className = "frame " + kind; clearTimeout(this.t); this.t = setTimeout(() => (f.className = "frame"), 700);
    if (kind === "bad") { this.sc.paused = true; $("alarmTitle").textContent = title; $("alarmSub").textContent = sub; $("alarm").classList.remove("hide"); }
  },
};
$("scanBtn").onclick = () => { unlockAudio(); live.open(); };
$("liveClose").onclick = () => live.close();
$("livePhoto").onclick = () => { live.close(); $("photoIn").click(); };
$("torchBtn").onclick = async () => $("torchBtn").classList.toggle("on", await live.sc.toggleTorch());
$("alarmOk").onclick = () => { $("alarm").classList.add("hide"); live.sc.resume(); live.msg("Kare kodu çerçeveye getir", ""); };

/* ---------- başlangıç ---------- */
document.addEventListener("touchstart", unlockAudio, { passive: true, once: true });
initDecoder().catch(() => {});
window.pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.js";
if (S.session && !list()) S.session = null;
go(S.session ? "load" : "home");
if (S.session) { const p = progress(list(), S.session, S.settings); feedback("idle", "Kaldığın yerden devam et", `${p.done}/${p.total} okundu`); }

if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

// test/teşhis için
window.__app = { S, list, onCode, store };
