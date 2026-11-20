import { useEffect, useRef, useState } from "react";
import { mediaUrl } from "../api";
import * as deviceCam from "../deviceCam";
import { canSpeak, firstName, greeting, sayMarked, setVoiceOn, streakText, unlockSpeech, voiceOn } from "../celebrate";
import "../celebrate.css";
import { Face, Icon, PageHead, Tick } from "../ui";

const FLOW = [
  { id: "liveness", icon: "user", t: "Face the camera", d: "Look straight so you can be identified" },
  { id: "challenge", icon: "eye", t: "Prove you're live", d: "Do the random actions it asks for" },
  { id: "marked", icon: "check", t: "Marked", d: "Saved to today's register" },
];
const STEP_OF = { liveness: 0, recognizing: 0, unknown: 0, challenge: 1, spoof: 1, marked: 2 };

const CONFETTI_COLORS = ["#12875A", "#F5B301", "#E5484D", "#3E63DD", "#8E4EC6", "#00A2C7"];
const PIECES = Array.from({ length: 32 }, (_, i) => ({
  left: (i * 37) % 100, delay: (i % 8) * 0.06, dur: 1.4 + ((i * 13) % 9) / 10,
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length], tilt: (i * 47) % 360, round: i % 3 === 0,
}));

// The moment a student is marked: their photo, a greeting, the streak, and confetti.
function Celebration({ who, ids }) {
  if (!who) return null;
  const streak = streakText(who.streak);
  return (
    <div className="celebrate" key={who.key} role="status" aria-live="polite">
      <div className="confetti" aria-hidden="true">
        {PIECES.map((c, i) => (
          <i key={i} style={{ left: `${c.left}%`, background: c.color, animationDelay: `${c.delay}s`, animationDuration: `${c.dur}s`,
            borderRadius: c.round ? "50%" : "2px", transform: `rotate(${c.tilt}deg)` }} />
        ))}
      </div>
      <div className="celebrate-card">
        <span className="celebrate-face"><Face name={who.name} id={ids[who.name]} size={96} /><Tick size={30} /></span>
        <p className="celebrate-hi">{greeting()}, {firstName(who.name)}!</p>
        <p className="celebrate-sub">Marked present · {who.time}</p>
        {streak && <span className="streak">🔥 {streak}</span>}
      </div>
    </div>
  );
}

// Watches the camera status and fires the celebration + voice once per newly marked student.
function useCelebration(cam) {
  const [who, setWho] = useState(null);
  const lastCount = useRef(null);
  useEffect(() => {
    const count = cam.active ? (cam.marked_count ?? 0) : null;
    const prev = lastCount.current;
    lastCount.current = count;
    if (count == null || prev == null || count <= prev) return undefined;
    const r = cam.recent?.[0];
    if (!r) return undefined;
    setWho({ ...r, key: `${r.name}-${count}` });
    sayMarked(r.name, r.streak);
    const t = setTimeout(() => setWho(null), 3400);
    return () => clearTimeout(t);
  }, [cam.active, cam.marked_count]); // eslint-disable-line react-hooks/exhaustive-deps
  return who;
}

// The device's own camera, shown smoothly from the browser (the server only gets frames).
function DevicePreview() {
  const ref = useRef(null);
  const [stream, setStream] = useState(deviceCam.getStream);
  useEffect(() => deviceCam.onStreamChange(setStream), []);
  useEffect(() => { if (ref.current) ref.current.srcObject = stream; }, [stream]);
  return stream
    ? <video ref={ref} autoPlay muted playsInline style={{ transform: "scaleX(-1)" }} aria-label="Your camera" />
    : <div className="stage-empty"><Icon name="camera" size={44} /><p>The camera is running on another device</p></div>;
}

function CameraPicker({ cam, cameras, selected, loading, onChange, onRefresh, isAdmin, onManageIp, source, onSource }) {
  const device = source === "device";
  const value = device ? "device" : String(selected ?? "default");
  const missing = !device && selected !== "default" && !cameras.some((c) => String(c.index) === value);
  const local = cameras.filter((c) => !c.ip && !c.builtin);
  const ip = cameras.filter((c) => c.ip);
  const kind = (c) => (c.builtin ? "laptop" : c.infrared ? "infrared, not for faces" : "USB");
  let hint;
  if (device) hint = deviceCam.deviceCamSupported()
    ? "Uses the camera of the phone or laptop this page is open on. Your browser will ask for permission."
    : "This page isn't on an https:// link, so the browser won't open its camera. Use the https address.";
  else if (loading) hint = "Looking for cameras…";
  else if (cam.active && cam.camera) hint = `Using ${cam.camera.name}.`;
  else if (!cameras.length) hint = "No camera found. Plug one in, then press refresh.";
  else hint = "The laptop camera is used unless you pick another one.";
  return (
    <section className="panel pad cam-pick">
      <div className="cam-pick-top">
        <label htmlFor="cam-src">Camera</label>
        <button className="icon-btn" onClick={onRefresh} disabled={cam.active || loading || device} aria-label="Look for cameras again"><Icon name="retake" size={18} /></button>
      </div>
      <select id="cam-src" value={value} disabled={cam.active}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "device") { onSource("device"); return; }
          onSource("server");
          onChange(v === "default" || v.startsWith("ip:") ? v : Number(v));
        }}>
        <option value="device">This device's camera (phone / laptop)</option>
        <optgroup label="Cameras on the AttendAI computer">
        <option value="default">Laptop camera of the AttendAI computer</option>
        </optgroup>
        {local.length > 0 && <optgroup label="USB cameras">
          {local.map((c) => <option key={c.index} value={c.index} disabled={c.infrared}>{c.name} ({kind(c)})</option>)}
        </optgroup>}
        {ip.length > 0 && <optgroup label="IP cameras">
          {ip.map((c) => <option key={c.index} value={c.index}>{c.name} ({c.kind === "wired" ? "wired" : "Wi-Fi"})</option>)}
        </optgroup>}
        {missing && <option value={value}>Saved camera (not found)</option>}
      </select>
      {isAdmin && <button className="link small" onClick={onManageIp} disabled={cam.active}>+ Add or test an IP camera (wired / Wi-Fi)</button>}
      <p className="muted small">{hint}</p>
      {cam.camera?.note && <p className="note">{cam.camera.note}</p>}
    </section>
  );
}

function CameraTips() {
  return (
    <details className="panel pad tips">
      <summary><strong>Getting good recognition</strong></summary>
      <ul>
        <li>Light the faces from the front. A window behind the student causes most misses.</li>
        <li>Put the camera at eye level, about 50–80 cm from the student.</li>
        <li>One student at a time. Glasses are fine; masks are not.</li>
        <li>A 1080p USB webcam with autofocus works better than most laptop cameras. See the camera guide in the README.</li>
      </ul>
    </details>
  );
}

export default function LivePage({ cam, busy, feedKey, onStart, onStop, cameras, camSetting, camsLoading, onPickCamera, onLoadCameras, ids, holiday, isAdmin, onManageIp, header = true, liveness = "secure", camSource = "device", onCamSource = () => {} }) {
  const flow = liveness === "quick"
    ? FLOW.map((s) => (s.id === "challenge" ? { ...s, t: "Blink twice", d: "Two normal blinks, looking at the camera" } : s))
    : FLOW;
  useEffect(() => { if (!cam.active && camSource !== "device") onLoadCameras(false); }, [camSource]); // eslint-disable-line react-hooks/exhaustive-deps
  const browserCam = cam.camera?.browser || (cam.active && camSource === "device" && deviceCam.isRunning());
  const step = cam.active ? STEP_OF[cam.status] : undefined;
  const celebrating = useCelebration(cam);
  const [voice, setVoice] = useState(voiceOn);
  const toggleVoice = () => { const v = !voice; setVoice(v); setVoiceOn(v); if (v) unlockSpeech(); };
  const start = () => { unlockSpeech(); onStart(); };
  const warn = ["spoof", "unknown", "error"].includes(cam.status);
  const message = cam.message || (liveness === "quick"
    ? "Start the camera when students are ready. Each student looks at the camera and blinks twice."
    : "Start the camera when students are ready. Each student follows two random instructions, so photos and videos can't pass.");
  return (
    <>
      {header && <PageHead title="Live camera" sub="Each student faces the camera and follows two random instructions, like turning their head. Attendance is saved when they pass." />}
      <div className="live-actions">
        {cam.active
          ? <button className="btn stop" onClick={onStop} disabled={busy}><Icon name="stop" size={18} />{busy ? "Saving…" : "Stop and save"}</button>
          : <button className="btn primary" onClick={start} disabled={busy}><Icon name="play" size={18} />{busy ? "Starting…" : "Start attendance"}</button>}
        {canSpeak() && (
          <button className="btn ghost voice-toggle" onClick={toggleVoice} aria-pressed={voice}
            title={voice ? "Students hear a greeting when they are marked" : "Voice greeting is off"}>
            {voice ? "🔊 Voice on" : "🔇 Voice off"}
          </button>
        )}
      </div>
      {holiday && !cam.active && <p className="note gap-bottom">Today is marked as a holiday ({holiday}). You can still take attendance; the day won't count for absence alerts.</p>}

      <div className="live">
        <div className="stage">
          {cam.active ? (
            <>
              {browserCam ? <DevicePreview /> : <img src={mediaUrl("/video-feed", `&k=${feedKey}`)} alt="Live camera feed" />}
              <span className="live-badge"><i />Live</span>
              <Celebration who={celebrating} ids={ids} />
              {cam.status === "starting" && <div className="stage-overlay">Starting the camera…</div>}
              {browserCam && cam.status !== "starting" && cam.message && (
                <span className="stage-hint" role="status" style={{ whiteSpace: "normal", maxWidth: "90%", textAlign: "center" }}>{cam.message}</span>
              )}
            </>
          ) : (
            <div className="stage-empty"><Icon name="camera" size={44} /><p>The camera is off</p></div>
          )}
        </div>

        <div className="side-col">
          <CameraPicker cam={cam} cameras={cameras} selected={camSetting} loading={camsLoading} onChange={onPickCamera} onRefresh={() => onLoadCameras(true)}
            isAdmin={isAdmin} onManageIp={onManageIp} source={camSource} onSource={onCamSource} />
          {cam.active && cam.camera?.ip && <p className="note small">IP camera: the students can't see this screen, so put a monitor or TV facing them, or read the instructions out.</p>}
          <div className={`say${warn ? " warn" : ""}${cam.status === "challenge" ? " big" : ""}`} role="status">{message}</div>
          <section className="panel pad">
            <ul className="flow">
              {flow.map((s, i) => (
                <li key={s.id} className={step === i ? "now" : ""}>
                  <span className="ic"><Icon name={s.icon} size={18} /></span>
                  <div><strong>{s.t}</strong><small>{s.d}</small></div>
                </li>
              ))}
            </ul>
          </section>
          <section className="panel">
            <div className="panel-head"><h2>Marked this session</h2><span className="muted">{cam.recent?.length ?? 0}</span></div>
            {cam.recent?.length ? (
              <ul className="recent">
                {cam.recent.map((r) => (
                  <li key={r.name}><Face name={r.name} id={ids[r.name]} size={34} /><span className="row-name">{r.name}</span>
                    {r.streak >= 2 && <span className="streak small" title={streakText(r.streak)}>🔥 {r.streak}</span>}
                    <span className="t">{r.time}</span><Tick size={18} /></li>
                ))}
              </ul>
            ) : <p className="empty">No one has been marked yet.</p>}
          </section>
          <CameraTips />
        </div>
      </div>
    </>
  );
}
