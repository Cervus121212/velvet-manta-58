// audio — everything synthesized with WebAudio: three radio stations,
// a two-tone police siren, engine hum, gunshots and UI blips. No assets.
import { RADIO } from './config.js';

export function createAudio() {
  const A = {
    ready: false, ctx: null, master: null, musicGain: null, sirenGain: null,
    engineOsc: null, engineGain: null, sirenOsc: null, sirenLfo: null,
    station: 0, stationTimer: null, sirenOn: false, muted: false,
  };

  A.ensure = function ensure() {
    if (A.ready) { if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      A.ctx = new Ctx();
      A.master = A.ctx.createGain(); A.master.gain.value = 0.5; A.master.connect(A.ctx.destination);
      A.musicGain = A.ctx.createGain(); A.musicGain.gain.value = 0.16; A.musicGain.connect(A.master);
      A.sirenGain = A.ctx.createGain(); A.sirenGain.gain.value = 0.0; A.sirenGain.connect(A.master);
      A.engineGain = A.ctx.createGain(); A.engineGain.gain.value = 0.0; A.engineGain.connect(A.master);
      A.engineOsc = A.ctx.createOscillator(); A.engineOsc.type = 'sawtooth'; A.engineOsc.frequency.value = 55;
      const lp = A.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320;
      A.engineOsc.connect(lp); lp.connect(A.engineGain); A.engineOsc.start();
      A.sirenOsc = A.ctx.createOscillator(); A.sirenOsc.type = 'sine'; A.sirenOsc.frequency.value = 750;
      A.sirenLfo = A.ctx.createOscillator(); A.sirenLfo.type = 'square'; A.sirenLfo.frequency.value = 0.55;
      const lfoGain = A.ctx.createGain(); lfoGain.gain.value = 180;
      A.sirenLfo.connect(lfoGain); lfoGain.connect(A.sirenOsc.frequency);
      A.sirenOsc.connect(A.sirenGain); A.sirenOsc.start(); A.sirenLfo.start();
      A.ready = true;
      A.startStation();
    } catch (e) { /* audio is decoration; a silent game still plays */ }
  };

  // A tiny step sequencer: each station walks a pentatonic-ish line over its root.
  A.startStation = function startStation() {
    if (!A.ready) return;
    A.stopStation();
    const st = RADIO[A.station];
    const scale = [1, 1.189, 1.335, 1.498, 1.782, 2];
    let step = 0;
    const beatMs = 60000 / st.tempo / 2;
    A.stationTimer = setInterval(() => {
      if (A.muted || !A.ready) return;
      const deg = [0, 2, 1, 3, 2, 4, 3, 5, 4, 2, 1, 0][step % 12];
      const freq = st.root * scale[deg % scale.length] * (step % 24 >= 12 ? 1 : 0.5);
      const o = A.ctx.createOscillator(); o.type = st.wave; o.frequency.value = freq;
      const g = A.ctx.createGain();
      g.gain.setValueAtTime(0.0001, A.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.5, A.ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, A.ctx.currentTime + beatMs / 1000 * 0.9);
      o.connect(g); g.connect(A.musicGain);
      o.start(); o.stop(A.ctx.currentTime + beatMs / 1000);
      if (step % 4 === 0) { // soft kick on the beat
        const k = A.ctx.createOscillator(); k.type = 'sine'; k.frequency.value = 90;
        const kg = A.ctx.createGain();
        kg.gain.setValueAtTime(0.4, A.ctx.currentTime);
        kg.gain.exponentialRampToValueAtTime(0.001, A.ctx.currentTime + 0.12);
        k.connect(kg); kg.connect(A.musicGain); k.start(); k.stop(A.ctx.currentTime + 0.14);
      }
      step++;
    }, beatMs);
  };

  A.stopStation = function stopStation() {
    if (A.stationTimer) { clearInterval(A.stationTimer); A.stationTimer = null; }
  };

  A.setStation = function setStation(i) {
    A.station = ((i % RADIO.length) + RADIO.length) % RADIO.length;
    if (A.ready) A.startStation();
    return RADIO[A.station].name;
  };

  A.setSiren = function setSiren(on) {
    A.sirenOn = on;
    if (A.ready) A.sirenGain.gain.setTargetAtTime(on ? 0.05 : 0.0, A.ctx.currentTime, 0.2);
  };

  A.setEngine = function setEngine(speed01) {
    if (!A.ready) return;
    A.engineOsc.frequency.setTargetAtTime(50 + speed01 * 130, A.ctx.currentTime, 0.08);
    A.engineGain.gain.setTargetAtTime(speed01 > 0.02 ? 0.05 : 0.0, A.ctx.currentTime, 0.1);
  };

  A.shot = function shot(big) {
    if (!A.ready) return;
    const n = A.ctx.createBufferSource();
    const len = A.ctx.sampleRate * 0.09;
    const buf = A.ctx.createBuffer(1, len, A.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    n.buffer = buf;
    const g = A.ctx.createGain(); g.gain.value = big ? 0.5 : 0.3;
    const f = A.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = big ? 900 : 2400;
    n.connect(f); f.connect(g); g.connect(A.master); n.start();
  };

  A.blip = function blip(freq = 880) {
    if (!A.ready) return;
    const o = A.ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
    const g = A.ctx.createGain();
    g.gain.setValueAtTime(0.25, A.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, A.ctx.currentTime + 0.12);
    o.connect(g); g.connect(A.master); o.start(); o.stop(A.ctx.currentTime + 0.14);
  };

  A.cash = function cash() { A.blip(660); setTimeout(() => A.blip(990), 90); setTimeout(() => A.blip(1320), 180); };

  return A;
}
