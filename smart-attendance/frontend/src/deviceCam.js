// The camera of the device that opened the page (phone, tablet, laptop).
// It opens the camera in the browser and posts JPEG frames to the server, which
// runs the same face recognition and liveness check as the PC camera.
// Works on https:// addresses and on localhost (browsers block cameras elsewhere).
import { BASE, getToken } from "./api";

const KEY = "attendai_cam_source";
const WIDTH = 640;          // enough for one face at arm's length; small to upload
const MAX_FPS = 12;         // blink detection needs several frames a second

let stream = null;
let video = null;
let frameKey = "";
let running = false;
let listeners = new Set();

// Apps like WhatsApp, Instagram and Telegram open links in their own browser, which usually can't use the camera.
export const inAppBrowser = () => /FBAN|FBAV|Instagram|WhatsApp|Telegram|Line\/|Snapchat|; wv\)/i.test(navigator.userAgent || "");

// A clear reason the camera didn't open, and what to do about it.
export function cameraErrorMessage(e) {
  if (inAppBrowser()) return "This app's built-in browser can't use the camera. Tap ⋮ (or Share) and choose \"Open in Chrome\" / \"Open in Safari\", then try again.";
  if (!window.isSecureContext) return "The camera only works on an https:// link. Open the app through its https address.";
  if (!navigator.mediaDevices?.getUserMedia) return "This browser can't open the camera. Use Chrome or Safari, or upload photos.";
  switch (e?.name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Camera permission is blocked. Tap the lock icon next to the address, set Camera to Allow, reload the page and try again. Also check the phone's Settings > Apps > Chrome > Permissions > Camera.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "No camera was found on this device.";
    case "NotReadableError":
    case "AbortError":
      return "The camera is being used by another app (video call, camera app). Close it and try again.";
    default:
      return "Couldn't open the camera on this device. Try Chrome or Safari, or upload photos.";
  }
}

export const deviceCamSupported = () => Boolean(navigator.mediaDevices?.getUserMedia) && window.isSecureContext;

// "device" (this device's camera) or "server" (a camera on the AttendAI computer). Remembered per browser.
export function getSource() {
  try { return localStorage.getItem(KEY) || "device"; } catch { return "device"; }
}
export function setSource(v) {
  try { localStorage.setItem(KEY, v); } catch { /* private mode */ }
}

export const getStream = () => stream;
export const isRunning = () => running;
export function onStreamChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
const changed = () => listeners.forEach((fn) => fn(stream));

// Ask for the camera. Call this straight from the click, before anything else, so the browser shows its prompt.
export async function openCamera() {
  if (!deviceCamSupported()) {
    throw new Error(window.isSecureContext
      ? "This browser can't open the camera."
      : "The camera only works on an https:// link. Open the app through its https address.");
  }
  if (stream) return stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false,
    });
  } catch (e) {
    stream = null;
    throw new Error(cameraErrorMessage(e));
  }
  video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  // Kept in the page (invisible) so phones keep decoding frames.
  Object.assign(video.style, { position: "fixed", width: "2px", height: "2px", opacity: "0", pointerEvents: "none", left: "0", top: "0" });
  document.body.appendChild(video);
  await video.play().catch(() => {});
  changed();
  return stream;
}

// Send frames until stop(). onStatus gets {status, message} from each reply; onEnd(reason) when the server stops it.
export function startSending(key, { onStatus, onEnd } = {}) {
  frameKey = key;
  running = true;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const loop = async () => {
    while (running && stream) {
      const t0 = performance.now();
      if (video.videoWidth) {
        const scale = Math.min(1, WIDTH / video.videoWidth);
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);   // not mirrored: the server mirrors it
        const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.8));
        if (blob && running) {
          try {
            const res = await fetch(`${BASE}/camera-frame`, {
              method: "POST", body: blob,
              headers: { "Content-Type": "image/jpeg", "X-Frame-Key": frameKey, Authorization: `Bearer ${getToken()}` },
            });
            const data = await res.json().catch(() => ({}));
            if (res.status === 409 || res.status === 403 || res.status === 401) {   // stopped, or started elsewhere
              if (running) { stop(); onEnd?.(data.message); }
              return;
            }
            if (res.ok) onStatus?.(data);
          } catch { /* a dropped frame: keep going */ }
        }
      }
      const wait = 1000 / MAX_FPS - (performance.now() - t0);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    }
  };
  loop();
}

export function stop() {
  running = false;
  frameKey = "";
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = null;
  if (video) { video.srcObject = null; video.remove(); }
  video = null;
  changed();
}
