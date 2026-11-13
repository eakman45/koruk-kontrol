// Kod okuma: fotoğraf, canlı kamera ve klavye gibi çalışan Bluetooth/USB okuyucular.
import { LIVE_REPEAT_MS } from "./config.js";

const FORMATS = ["DataMatrix", "QRCode", "Code128"];
let ready = null;

export function initDecoder() {
  if (!ready) {
    ready = window.ZXingWASM.prepareZXingModule({
      overrides: { locateFile: (p) => (p.endsWith(".wasm") ? "vendor/zxing_reader.wasm" : p) },
      fireImmediately: true,
    });
  }
  return ready;
}

async function decodeImageData(img, tryHarder = true) {
  await initDecoder();
  const r = await window.ZXingWASM.readBarcodes(img, { formats: FORMATS, tryHarder, maxNumberOfSymbols: 4 });
  return r.filter((x) => x.isValid && x.text).map((x) => x.text);
}

async function toImageData(file, maxSide) {
  let src;
  try { src = await createImageBitmap(file); }
  catch { src = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = URL.createObjectURL(file); }); }
  const k = Math.min(1, maxSide / Math.max(src.width, src.height));
  const c = document.createElement("canvas");
  c.width = Math.round(src.width * k); c.height = Math.round(src.height * k);
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(src, 0, 0, c.width, c.height);
  return g.getImageData(0, 0, c.width, c.height);
}

/** Fotoğraftan kod(lar) okur; farklı çözünürlüklerde dener */
export async function decodeFile(file) {
  for (const side of [2200, 1400, 3200]) {
    const codes = await decodeImageData(await toImageData(file, side));
    if (codes.length) return codes;
  }
  return [];
}

export const liveSupported = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && window.isSecureContext;

/** Canlı kamera taraması */
export class LiveScanner {
  constructor(video, onCode) {
    this.video = video; this.onCode = onCode;
    this.stream = null; this.on = false; this.paused = false;
    this.last = ""; this.lastAt = 0; this.torch = false; this.wake = null;
    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d", { willReadFrequently: true });
  }
  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false,
    });
    this.video.srcObject = this.stream;
    try { await this.video.play(); } catch {}
    try { this.wake = await navigator.wakeLock?.request("screen"); } catch {}
    this.on = true; this.paused = false;
    this.loop();
  }
  hasTorch() {
    try { const t = this.stream.getVideoTracks()[0]; return !!(t.getCapabilities && t.getCapabilities().torch); } catch { return false; }
  }
  async toggleTorch() {
    try { this.torch = !this.torch; await this.stream.getVideoTracks()[0].applyConstraints({ advanced: [{ torch: this.torch }] }); } catch { this.torch = false; }
    return this.torch;
  }
  stop() {
    this.on = false;
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    this.stream = null;
    try { this.wake?.release(); } catch {}
    this.wake = null;
  }
  resume() { this.paused = false; this.lastAt = Date.now(); }
  async loop() {
    const v = this.video;
    while (this.on) {
      if (!this.paused && v.videoWidth) {
        // Ekrandaki çerçeveye denk gelen orta bölgeyi tara
        const vw = v.videoWidth, vh = v.videoHeight, side = Math.min(vw, vh) * 0.8;
        const sx = (vw - side) / 2, sy = Math.max(0, vh * 0.46 - side / 2);
        const out = Math.min(900, side) | 0;
        this.canvas.width = this.canvas.height = out;
        this.ctx.drawImage(v, sx, sy, side, side, 0, 0, out, out);
        try {
          const codes = await decodeImageData(this.ctx.getImageData(0, 0, out, out));
          for (const c of codes) {
            const now = Date.now();
            if (c === this.last && now - this.lastAt < LIVE_REPEAT_MS) { this.lastAt = now; continue; }
            this.last = c; this.lastAt = now;
            this.onCode(c);
          }
        } catch {}
      }
      await new Promise((r) => setTimeout(r, 90));
    }
  }
}

/** Klavye gibi yazan okuyucular: hızlı tuş dizisi + Enter */
export function attachKeyboardWedge(onCode) {
  let buf = "", last = 0;
  document.addEventListener("keydown", (e) => {
    const tag = e.target && e.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    const now = Date.now();
    if (now - last > 120) buf = "";
    last = now;
    if (e.key === "Enter") { if (buf.length >= 3) onCode(buf); buf = ""; return; }
    if (e.key.length === 1) { if (e.key === " " && buf) e.preventDefault(); buf += e.key; }
  });
}
