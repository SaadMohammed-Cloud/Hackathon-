// Audio + haptic output for alerts: an attention chime, text-to-speech and vibration.
//
// Browsers block audio until the user interacts with the page, so the commuter
// app asks for one tap ("Turn on live alerts") and calls `unlock()` from it.

let audioCtx = null;

export const speechSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;
export const vibrationSupported = typeof navigator !== 'undefined' && 'vibrate' in navigator;

export function unlock() {
  try {
    audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch {
    audioCtx = null;
  }
  if (speechSupported) {
    // A silent utterance inside the tap handler unlocks speech on iOS/Safari.
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    window.speechSynthesis.speak(u);
  }
}

// Two-tone "attention" chime, like the tone before a PA announcement.
// Urgent alerts get three rounds.
export function chime(priority = 'warning') {
  if (!audioCtx) return Promise.resolve();
  const rounds = priority === 'critical' ? 3 : 1;
  const tones = priority === 'info' ? [660, 880] : [880, 660];
  const toneLen = 0.22;
  const start = audioCtx.currentTime + 0.05;

  let t = start;
  for (let r = 0; r < rounds; r++) {
    for (const freq of tones) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + toneLen);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + toneLen + 0.02);
      t += toneLen + 0.04;
    }
    t += 0.12;
  }
  const totalMs = (t - audioCtx.currentTime) * 1000;
  return new Promise((resolve) => setTimeout(resolve, totalMs));
}

export function vibrate(priority = 'warning') {
  if (!vibrationSupported) return;
  const pattern =
    priority === 'critical' ? [500, 150, 500, 150, 500] : priority === 'warning' ? [400, 150, 400] : [250];
  navigator.vibrate(pattern);
}

// macOS ships joke/effect voices that sound robotic. Never auto-pick these.
const NOVELTY = /^(albert|bad news|bahh|bells|boing|bubbles|cellos|deranged|good news|hysterical|jester|junior|organ|pipe organ|ralph|superstar|trinoids|whisper|wobble|zarvox|fred|kathy|grandma|grandpa|eddy|flo|reed|rocko|sandy|shelley)\b/i;

// Most natural-sounding voices first. Premium/Enhanced/Neural are the newer
// high-quality voices (macOS lets you download them for free; see README).
const PREFERRED = [
  /premium/i,
  /enhanced/i,
  /neural|natural/i,
  /^(ava|zoe|evan|nathan|allison|susan|noelle|joelle|tom)\b/i,
  /^samantha\b/i,
  /^google us english/i,
  /^(daniel|karen|moira|tessa|serena|kate|oliver)\b/i, // en-GB / en-AU / en-IE / en-ZA
];

function score(v) {
  const i = PREFERRED.findIndex((re) => re.test(v.name));
  let s = i === -1 ? PREFERRED.length : i;
  if (v.lang === 'en-US') s -= 0.5; // slight preference for US English
  return s;
}

// English voices worth offering, best first.
export function listVoices() {
  if (!speechSupported) return [];
  return window.speechSynthesis
    .getVoices()
    .filter((v) => v.lang?.toLowerCase().startsWith('en') && !NOVELTY.test(v.name))
    .sort((a, b) => score(a) - score(b) || a.name.localeCompare(b.name));
}

export function onVoicesChanged(fn) {
  if (!speechSupported) return () => {};
  window.speechSynthesis.addEventListener('voiceschanged', fn);
  return () => window.speechSynthesis.removeEventListener('voiceschanged', fn);
}

function pickVoice(voiceURI) {
  const voices = listVoices();
  return (voiceURI && voices.find((v) => v.voiceURI === voiceURI)) || voices[0] || null;
}

// Short pauses between sentences sound much more like a real announcer.
function toPhrases(text) {
  return text.match(/[^.!?]+[.!?]*/g)?.map((t) => t.trim()).filter(Boolean) ?? [text];
}

export function speak(text, { rate = 1, repeat = 1, voiceURI = '' } = {}) {
  if (!speechSupported) return;
  const synth = window.speechSynthesis;
  stopSpeaking(); // newest announcement always wins
  const voice = pickVoice(voiceURI);
  for (let i = 0; i < repeat; i++) {
    const phrases = toPhrases(i === 0 ? text : `I repeat. ${text}`);
    for (const phrase of phrases) {
      const u = new SpeechSynthesisUtterance(phrase);
      if (voice) u.voice = voice;
      u.lang = voice?.lang ?? 'en-US';
      u.rate = rate;
      u.pitch = 1;
      u.volume = 1;
      synth.speak(u);
    }
  }
}

// ---- AI voice (MP3 from the relay, played through Web Audio) ----------------
// Web Audio is used instead of <audio> because it's already unlocked by the
// "Turn on alerts" tap, so later alerts can play without another tap (incl. iOS).

const audioCache = new Map();
let playToken = 0;
let currentSource = null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Fetch + decode an MP3. Retries briefly on 404 because a commuter in the same
// browser can hear about an alert a few ms before the relay has stored it.
export function loadRemote(url) {
  if (!audioCtx) return Promise.reject(new Error('Audio is locked until the user taps'));
  if (!audioCache.has(url)) {
    const job = (async () => {
      for (let attempt = 0; ; attempt++) {
        const res = await fetch(url);
        if (res.ok) return audioCtx.decodeAudioData(await res.arrayBuffer());
        if (res.status === 404 && attempt < 4) {
          await sleep(300);
          continue;
        }
        throw new Error(`AI voice unavailable (${res.status})`);
      }
    })();
    audioCache.set(url, job);
    job.catch(() => audioCache.delete(url)); // allow a retry later
  }
  return audioCache.get(url);
}

function playBuffer(buffer, token) {
  return new Promise((resolve) => {
    if (token !== playToken) return resolve();
    const src = audioCtx.createBufferSource();
    src.buffer = buffer;
    src.connect(audioCtx.destination);
    src.onended = () => {
      if (currentSource === src) currentSource = null;
      resolve();
    };
    currentSource = src;
    src.start();
  });
}

// Plays the AI voice `repeat` times. Throws if it can't, so callers can fall
// back to the device voice.
export async function playRemote(url, { repeat = 1 } = {}) {
  const buffer = await loadRemote(url);
  stopSpeaking();
  const token = playToken;
  for (let i = 0; i < repeat && token === playToken; i++) {
    if (i > 0) await sleep(800);
    await playBuffer(buffer, token);
  }
}

export function stopSpeaking() {
  playToken++;
  try {
    currentSource?.stop();
  } catch {
    /* already stopped */
  }
  currentSource = null;
  if (speechSupported) window.speechSynthesis.cancel();
}

// Voices load asynchronously in Chrome; touching the list early warms it up.
if (speechSupported) window.speechSynthesis.getVoices();
