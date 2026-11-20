// Voice greeting when a student is marked. Uses the browser's own speech: free, works offline.
const KEY = "attendai_voice";

export function voiceOn() {
  try { return localStorage.getItem(KEY) !== "off"; } catch { return true; }
}
export function setVoiceOn(on) {
  try { localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* private mode */ }
}

export const canSpeak = () => typeof window !== "undefined" && "speechSynthesis" in window;

// Phones only allow speech after a tap: call this from the Start button.
export function unlockSpeech() {
  if (!canSpeak()) return;
  try {
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    window.speechSynthesis.speak(u);
  } catch { /* ignore */ }
}

export function greeting(date = new Date()) {
  const h = date.getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export const firstName = (name) => String(name || "").trim().split(/\s+/)[0] || "";

export function streakText(streak) {
  return streak >= 2 ? `${streak} days in a row` : "";
}

let voice = null;
function pickVoice() {
  if (voice || !canSpeak()) return voice;
  const all = window.speechSynthesis.getVoices();
  voice = all.find((v) => v.lang === "en-IN") || all.find((v) => v.lang?.startsWith("en")) || null;
  return voice;
}
if (canSpeak()) window.speechSynthesis.addEventListener?.("voiceschanged", () => { voice = null; pickVoice(); });

export function sayMarked(name, streak) {
  if (!canSpeak() || !voiceOn()) return;
  let text = `${greeting()} ${firstName(name)}, you're marked present.`;
  if (streak >= 3) text += ` ${streak} days in a row!`;
  try {
    window.speechSynthesis.cancel();   // the newest student first, never a queue of old names
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice();
    if (v) { u.voice = v; u.lang = v.lang; } else u.lang = "en-IN";
    u.rate = 1;
    window.speechSynthesis.speak(u);
  } catch { /* speech is a nice extra */ }
}
