(() => {
'use strict';
const KEY = 'mondosupreme.radio.v1';
const STATIONS = [
  { id: 'groovesalad', name: 'SomaFM Groove Salad', genre: 'Chill', url: 'https://ice1.somafm.com/groovesalad-128-mp3' },
  { id: 'dronezone', name: 'SomaFM Drone Zone', genre: 'Ambient', url: 'https://ice1.somafm.com/dronezone-128-mp3' },
  { id: 'secretagent', name: 'SomaFM Secret Agent', genre: 'Spy', url: 'https://ice1.somafm.com/secretagent-128-mp3' },
  { id: 'poptron', name: 'SomaFM PopTron', genre: 'Indie pop', url: 'https://ice1.somafm.com/poptron-128-mp3' },
  { id: 'nightride', name: 'Nightride FM', genre: 'Synthwave', url: 'https://stream.nightride.fm/nightride.m4a' },
  { id: 'chillsynth', name: 'Nightride ChillSynth', genre: 'Chillwave', url: 'https://stream.nightride.fm/chillsynth.m4a' }
];
const PADS = [
  ['modem', '56k Modem'], ['mail', "You've Got Mail"], ['icq', 'ICQ Uh-Oh'], ['fanfare', 'Win95 Fanfare'],
  ['tada', 'Win98 Tada'], ['chord', 'Win98 Chord'], ['error', 'Win98 Error'], ['degauss', 'CRT Degauss'],
  ['coin', 'Arcade Coin'], ['oneup', '1-UP'], ['laser', 'Laser Pew'], ['horn', 'Airhorn'],
  ['laugh', 'Laugh Track'], ['ship', 'Cruise Horn'], ['dial', 'Dial Tone'], ['click', 'Mouse Click'],
  ['bios', 'BIOS Beep'], ['whoosh', 'Whoosh'], ['power', 'Power Down'], ['scratch', 'Record Scratch'],
  ['blip', 'Menu Blip'], ['alarm', 'Alarm Clock'], ['splash', 'Splash'], ['boing', 'Spring Boing']
];
const $ = s => document.querySelector(s);
let audio, ac, master, analyser, synthTimer = 0, raf = 0, usingSynth = false, current = '';

function ctx() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!ac) {
    ac = new AC();
    master = ac.createGain();
    master.gain.value = 0.2;
    analyser = ac.createAnalyser();
    analyser.fftSize = 64;
    master.connect(analyser);
    analyser.connect(ac.destination);
  }
  if (ac.state === 'suspended') ac.resume();
  return ac;
}
function envGain(seconds, peak) {
  const audioCtx = ctx();
  const g = audioCtx.createGain();
  const t = audioCtx.currentTime;
  g.connect(master);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak || 0.3, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
  return g;
}
function beep(freq, seconds, type, peak) {
  const audioCtx = ctx();
  if (!audioCtx) return;
  const o = audioCtx.createOscillator();
  o.type = type || 'square';
  o.frequency.setValueAtTime(freq, audioCtx.currentTime);
  o.connect(envGain(seconds, peak));
  o.start();
  o.stop(audioCtx.currentTime + seconds + 0.02);
}
function noise(seconds, peak) {
  const audioCtx = ctx();
  if (!audioCtx) return;
  const len = Math.floor(audioCtx.sampleRate * seconds);
  const buffer = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = audioCtx.createBufferSource();
  src.buffer = buffer;
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 1400;
  src.connect(filter);
  filter.connect(envGain(seconds, peak || 0.2));
  src.start();
}
function sweep(from, to, seconds, type) {
  const audioCtx = ctx();
  if (!audioCtx) return;
  const o = audioCtx.createOscillator();
  o.type = type || 'sawtooth';
  o.frequency.setValueAtTime(from, audioCtx.currentTime);
  o.frequency.exponentialRampToValueAtTime(Math.max(40, to), audioCtx.currentTime + seconds);
  o.connect(envGain(seconds, 0.22));
  o.start();
  o.stop(audioCtx.currentTime + seconds + 0.02);
}
const FX = {
  modem() { noise(0.35, 0.18); beep(2100, 0.08, 'square', 0.15); setTimeout(() => beep(1800, 0.08, 'square', 0.15), 120); setTimeout(() => sweep(2400, 400, 0.4, 'square'), 220); },
  mail() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.12, 'square', 0.2), i * 90)); },
  icq() { beep(196, 0.16, 'sawtooth', 0.25); setTimeout(() => beep(146, 0.22, 'sawtooth', 0.25), 160); },
  fanfare() { [392, 494, 587, 784].forEach((f, i) => setTimeout(() => beep(f, 0.18, 'triangle', 0.22), i * 110)); },
  tada() { beep(523, 0.2, 'square', 0.2); setTimeout(() => beep(659, 0.28, 'square', 0.22), 140); },
  chord() { [262, 330, 392, 523].forEach(f => beep(f, 0.45, 'triangle', 0.12)); },
  error() { beep(180, 0.18, 'square', 0.25); setTimeout(() => beep(140, 0.28, 'square', 0.25), 160); },
  degauss() { sweep(90, 40, 0.45, 'sine'); noise(0.2, 0.12); },
  coin() { beep(988, 0.06, 'square', 0.2); setTimeout(() => beep(1318, 0.1, 'square', 0.2), 70); },
  oneup() { [523, 659, 784, 1046, 1318].forEach((f, i) => setTimeout(() => beep(f, 0.08, 'square', 0.18), i * 60)); },
  laser() { sweep(900, 120, 0.22, 'square'); },
  horn() { beep(220, 0.45, 'sawtooth', 0.28); beep(233, 0.45, 'square', 0.12); },
  laugh() { for (let i = 0; i < 6; i++) setTimeout(() => noise(0.08, 0.16), i * 90); },
  ship() { beep(82, 0.7, 'sawtooth', 0.3); setTimeout(() => beep(98, 0.5, 'square', 0.15), 200); },
  dial() { beep(350, 0.6, 'sine', 0.12); beep(440, 0.6, 'sine', 0.12); },
  click() { noise(0.03, 0.2); },
  bios() { beep(440, 0.12, 'square', 0.2); },
  whoosh() { noise(0.3, 0.16); sweep(600, 80, 0.3, 'sine'); },
  power() { sweep(400, 50, 0.5, 'sawtooth'); },
  scratch() { noise(0.18, 0.22); },
  blip() { beep(880, 0.05, 'square', 0.18); },
  alarm() { for (let i = 0; i < 4; i++) setTimeout(() => beep(i % 2 ? 880 : 660, 0.1, 'square', 0.2), i * 120); },
  splash() { noise(0.22, 0.18); sweep(200, 80, 0.25, 'sine'); },
  boing() { sweep(180, 420, 0.12, 'sine'); setTimeout(() => sweep(420, 160, 0.18, 'sine'), 100); }
};
function stopSynth() {
  if (synthTimer) { clearInterval(synthTimer); synthTimer = 0; }
  usingSynth = false;
}
function startSynth() {
  stopSynth();
  usingSynth = true;
  const notes = [220, 262, 294, 330, 392, 330, 294, 262];
  let i = 0;
  const step = () => { beep(notes[i % notes.length], 0.18, 'triangle', 0.08); if (i % 2 === 0) noise(0.04, 0.05); i++; };
  step();
  synthTimer = setInterval(step, 220);
  $('#now').textContent = 'Synth-wave generator is on. The live stream did not start, so the boombox made its own station.';
}
function drawBars() {
  const canvas = $('#spec');
  if (!canvas) return;
  const c = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  c.fillStyle = '#001400';
  c.fillRect(0, 0, w, h);
  let vals = [];
  if (analyser) {
    const bins = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(bins);
    vals = Array.from(bins);
  }
  const n = 24;
  for (let i = 0; i < n; i++) {
    const v = vals.length ? vals[i % vals.length] / 255 : (usingSynth ? 0.2 + Math.abs(Math.sin(Date.now() / 180 + i)) * 0.6 : 0.05);
    c.fillStyle = i % 3 ? '#39ff14' : '#ffd100';
    c.fillRect(8 + i * 18, h - 8 - v * (h - 16), 12, v * (h - 16));
  }
  raf = requestAnimationFrame(drawBars);
}
async function tune(station) {
  ctx();
  stopSynth();
  current = station.id;
  try { localStorage.setItem(KEY, JSON.stringify({ id: station.id })); } catch { /* private */ }
  $('#now').textContent = 'Tuning ' + station.name + '…';
  document.querySelectorAll('[data-station]').forEach(btn => btn.setAttribute('aria-pressed', String(btn.dataset.station === station.id)));
  audio.src = station.url;
  try {
    await audio.play();
    $('#now').textContent = 'On air: ' + station.name + ' · ' + station.genre;
  } catch {
    startSynth();
  }
}
function init() {
  const year = $('#yr');
  if (year) year.textContent = String(new Date().getFullYear());
  audio = $('#stream');
  audio.addEventListener('error', () => { if (current) startSynth(); });
  const stations = $('#stations');
  STATIONS.forEach(station => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn';
    btn.dataset.station = station.id;
    btn.textContent = station.name;
    btn.addEventListener('click', () => tune(station));
    stations.appendChild(btn);
  });
  const pads = $('#pads');
  PADS.forEach(pad => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn';
    btn.textContent = pad[1];
    btn.addEventListener('click', () => { if (FX[pad[0]]) FX[pad[0]](); });
    pads.appendChild(btn);
  });
  $('#stopRadio').addEventListener('click', () => {
    audio.pause();
    stopSynth();
    $('#now').textContent = 'Radio is stopped.';
    document.querySelectorAll('[data-station]').forEach(btn => btn.setAttribute('aria-pressed', 'false'));
  });
  drawBars();
}
document.addEventListener('DOMContentLoaded', init);
})();
