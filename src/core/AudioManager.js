import { clamp } from './math.js';

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineGain = null;
    this.engineOsc = null;
    this.engineFilter = null;
    this.sirenGain = null;
    this.sirenOsc = null;
    this.noiseBuffer = null;
    this.muted = this.readMuted();
    this.sirenOn = false;
    this.engineRatio = 0;
    this.available = true;
  }

  readMuted() {
    try {
      return localStorage.getItem('night-shift-muted') === '1';
    } catch {
      return false;
    }
  }

  saveMuted() {
    try {
      localStorage.setItem('night-shift-muted', this.muted ? '1' : '0');
    } catch {
      // ignore private mode
    }
  }

  ensure() {
    if (!this.available) return;
    if (!this.ctx) {
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) {
          this.available = false;
          return;
        }
        this.ctx = new AudioCtx();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.62;
        this.master.connect(this.ctx.destination);

        this.buildEngine();
        this.buildSiren();
        this.buildNoise();
      } catch {
        this.available = false;
        return;
      }
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  buildEngine() {
    const ctx = this.ctx;

    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 320;
    this.engineFilter.Q.value = 1.2;

    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 46;
    this.engineOsc.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();

    const rumble = ctx.createOscillator();
    rumble.type = 'triangle';
    rumble.frequency.value = 23;
    const rumbleGain = ctx.createGain();
    rumbleGain.gain.value = 0.5;
    rumble.connect(rumbleGain);
    rumbleGain.connect(this.engineGain);
    rumble.start();
  }

  buildSiren() {
    const ctx = this.ctx;
    this.sirenGain = ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenGain.connect(this.master);

    this.sirenOsc = ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 720;

    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 1.55;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 170;
    lfo.connect(lfoGain);
    lfoGain.connect(this.sirenOsc.frequency);
    lfo.start();

    this.sirenOsc.connect(this.sirenGain);
    this.sirenOsc.start();
  }

  buildNoise() {
    const ctx = this.ctx;
    const length = Math.floor(ctx.sampleRate * 1.2);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buffer;
  }

  setMuted(muted) {
    this.muted = muted;
    this.saveMuted();
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.62, this.ctx.currentTime, 0.04);
    }
  }

  toggleMuted() {
    this.ensure();
    this.setMuted(!this.muted);
    return this.muted;
  }

  updateEngine(speedRatio, boosting = false) {
    if (!this.ctx || !this.engineGain) return;
    const ratio = clamp(speedRatio, 0, 1.35);
    this.engineRatio = ratio;

    const now = this.ctx.currentTime;
    const boostGain = boosting ? 0.018 : 0;
    const boostFreq = boosting ? 36 : 0;
    this.engineGain.gain.setTargetAtTime(0.016 + ratio * 0.032 + boostGain, now, 0.07);
    this.engineOsc.frequency.setTargetAtTime(42 + ratio * 94 + boostFreq, now, 0.1);
    this.engineFilter.frequency.setTargetAtTime(280 + ratio * 720 + (boosting ? 380 : 0), now, 0.1);
  }

  setSiren(on) {
    if (!this.ctx || !this.sirenGain) {
      this.sirenOn = on;
      return;
    }
    this.sirenOn = on;
    this.sirenGain.gain.setTargetAtTime(on ? 0.036 : 0, this.ctx.currentTime, 0.09);
  }

  suspendLoops() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.sirenGain?.gain.setTargetAtTime(0, now, 0.05);
    this.engineGain?.gain.setTargetAtTime(0, now, 0.05);
  }

  tone({
    freq = 440,
    endFreq = freq,
    duration = 0.12,
    type = 'sine',
    volume = 0.05,
    delay = 0,
    attack = 0.005
  } = {}) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freq), start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), start + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(start);
    osc.stop(start + duration + 0.03);
  }

  noise({ duration = 0.2, volume = 0.08, frequency = 900, q = 0.8, delay = 0 } = {}) {
    if (!this.ctx || !this.noiseBuffer || this.muted) return;
    const ctx = this.ctx;
    const start = ctx.currentTime + delay;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(frequency, start);
    filter.frequency.exponentialRampToValueAtTime(Math.max(80, frequency * 0.3), start + duration);
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start(start);
    source.stop(start + duration + 0.03);
  }

  hit() {
    this.noise({ duration: 0.24, volume: 0.13, frequency: 620 });
    this.tone({ freq: 140, endFreq: 46, duration: 0.24, type: 'sawtooth', volume: 0.06 });
  }

  crash() {
    this.noise({ duration: 0.26, volume: 0.09, frequency: 420 });
    this.tone({ freq: 80, endFreq: 42, duration: 0.22, type: 'square', volume: 0.032 });
  }

  launch() {
    this.noise({ duration: 0.34, volume: 0.15, frequency: 750 });
    this.tone({ freq: 110, endFreq: 48, duration: 0.28, type: 'sawtooth', volume: 0.07 });
    this.tone({ freq: 240, endFreq: 680, duration: 0.32, type: 'triangle', volume: 0.045, delay: 0.04 });
  }

  boost() {
    this.noise({ duration: 0.28, volume: 0.07, frequency: 1200, q: 1.4 });
    this.tone({ freq: 180, endFreq: 520, duration: 0.26, type: 'sawtooth', volume: 0.04 });
    this.tone({ freq: 360, endFreq: 840, duration: 0.22, type: 'triangle', volume: 0.03, delay: 0.04 });
  }

  explosion() {
    this.noise({ duration: 0.9, volume: 0.24, frequency: 260 });
    this.noise({ duration: 0.38, volume: 0.12, frequency: 1300, delay: 0.02 });
    this.tone({ freq: 110, endFreq: 28, duration: 0.78, type: 'sawtooth', volume: 0.11 });
    this.tone({ freq: 62, endFreq: 22, duration: 0.95, type: 'square', volume: 0.055, delay: 0.05 });
  }

  load() {
    this.tone({ freq: 420, endFreq: 660, duration: 0.15, type: 'sine', volume: 0.045 });
    this.tone({ freq: 660, endFreq: 880, duration: 0.18, type: 'sine', volume: 0.035, delay: 0.08 });
  }

  deliver() {
    this.tone({ freq: 520, endFreq: 660, duration: 0.16, type: 'triangle', volume: 0.05 });
    this.tone({ freq: 780, endFreq: 1040, duration: 0.24, type: 'triangle', volume: 0.05, delay: 0.1 });
    this.tone({ freq: 1040, endFreq: 1320, duration: 0.3, type: 'sine', volume: 0.032, delay: 0.2 });
  }

  fine() {
    this.tone({ freq: 220, endFreq: 120, duration: 0.28, type: 'sawtooth', volume: 0.055 });
    this.tone({ freq: 160, endFreq: 70, duration: 0.4, type: 'square', volume: 0.03, delay: 0.12 });
  }

  upgrade() {
    this.tone({ freq: 440, endFreq: 880, duration: 0.14, type: 'square', volume: 0.028 });
    this.tone({ freq: 660, endFreq: 1320, duration: 0.3, type: 'sine', volume: 0.04, delay: 0.09 });
  }

  deny() {
    this.tone({ freq: 180, endFreq: 150, duration: 0.12, type: 'square', volume: 0.03 });
  }

  sirenToggle(on) {
    this.tone({
      freq: on ? 600 : 420,
      endFreq: on ? 920 : 300,
      duration: 0.16,
      type: 'triangle',
      volume: 0.032
    });
  }

  ui() {
    this.tone({ freq: 900, endFreq: 700, duration: 0.045, type: 'square', volume: 0.016 });
  }
}
