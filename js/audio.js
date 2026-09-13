"use strict";
const AudioSys = {
  ctx: null, on: true, musicGain: null, musicTimer: 0, step: 0,
  init() {
    if (this.ctx || !window.AudioContext && !window.webkitAudioContext) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.10;
      this.musicGain.connect(this.ctx.destination);
      this._ambientGain = this.ctx.createGain();
      this._ambientGain.gain.value = 0.18;
      this._ambientGain.connect(this.ctx.destination);
      this._startAmbient();
      this._startMusic();
    } catch (e) { this.ctx = null; }
  },
  tone(f0, f1, dur, type, vol, dest) {
    if (!this.ctx || !this.on) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type || "square"; o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol || 0.1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(dest || this.ctx.destination);
    o.start(t); o.stop(t + dur + 0.02);
  },
  noise(dur, vol, freq) {
    if (!this.ctx || !this.on) return;
    const t = this.ctx.currentTime, n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = freq || 1200;
    const g = this.ctx.createGain(); g.gain.value = vol || 0.15;
    src.connect(f); f.connect(g); g.connect(this.ctx.destination); src.start(t);
  },
  sfx(name) {
    if (!this.ctx) return;
    switch (name) {
      case "select": this.tone(900, 1300, 0.06, "square", 0.08); break;
      case "order": this.tone(500, 700, 0.08, "triangle", 0.09); break;
      case "hit": this.noise(0.08, 0.16, 900); break;
      case "hitmelee": this.tone(200, 60, 0.1, "sawtooth", 0.14); this.noise(0.05, 0.1, 600); break;
      case "death": this.tone(300, 80, 0.3, "sawtooth", 0.1); break;
      case "shoot": this.tone(1600, 400, 0.07, "triangle", 0.07); break;
      case "build": this.tone(300, 320, 0.08, "square", 0.1); setTimeout(() => this.tone(300, 340, 0.08, "square", 0.1), 100); break;
      case "done": this.tone(523, 523, 0.1, "triangle", 0.12); setTimeout(() => this.tone(784, 784, 0.15, "triangle", 0.12), 110); break;
      case "age": [392, 494, 587, 784].forEach((f, i) => setTimeout(() => this.tone(f, f, 0.35, "triangle", 0.14), i * 140)); break;
      case "train": this.tone(700, 900, 0.07, "square", 0.06); break;
      case "gather": this.tone(240, 280, 0.05, "square", 0.05); break;
      case "error": this.tone(180, 120, 0.15, "square", 0.1); break;
      case "convert": this.tone(440, 880, 0.25, "sine", 0.12); break;
      case "click": this.tone(1100, 1100, 0.03, "square", 0.04); break;
    }
  },
  _startAmbient() {
    const C = this.ctx, dest = this._ambientGain;
    const wind = () => {
      if (!this.on) { setTimeout(wind, 3000); return; }
      const t = C.currentTime, dur = 3 + Math.random() * 3;
      const n = Math.floor(C.sampleRate * dur);
      const buf = C.createBuffer(1, n, C.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1);
      const src = C.createBufferSource(); src.buffer = buf;
      const f = C.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 300 + Math.random() * 200;
      const g = C.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.12, t + dur / 2);
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
      src.connect(f); f.connect(g); g.connect(dest); src.start(t);
      setTimeout(wind, dur * 900);
    };
    const bird = () => {
      if (this.on && Math.random() < 0.6) {
        const f = 1800 + Math.random() * 1200;
        this.tone(f, f * 1.3, 0.07, "sine", 0.05, dest);
        setTimeout(() => this.tone(f * 0.9, f * 1.2, 0.06, "sine", 0.04, dest), 110);
      }
      setTimeout(bird, 2500 + Math.random() * 4000);
    };
    wind(); bird();
  },
  _startMusic() {
    const scale = [220, 246.9, 277.2, 329.6, 369.9, 440, 493.9, 554.4];
    const pat = [0, 2, 4, 2, 5, 4, 2, 1, 0, -1, 2, 4, 7, 5, 4, 2];
    this.musicTimer = setInterval(() => {
      if (!this.ctx || !this.on) return;
      const i = this.step % 16, s = pat[i];
      if (s >= 0) {
        const f = scale[s] * (Math.random() < 0.08 ? 2 : 1);
        this.tone(f, f, 0.5, "triangle", 0.16, this.musicGain);
        if (i % 4 === 0) this.tone(f / 2, f / 2, 0.9, "sine", 0.3, this.musicGain);
      }
      this.step++;
    }, 420);
  },
  setOn(v) { this.on = v; if (this.ctx && this.ctx.state === "suspended") this.ctx.resume(); }
};
