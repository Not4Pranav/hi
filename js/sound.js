/**
 * Race2Win Procedural Web Audio Sound Engine
 * Synthesizes realistic F1 engine roar, tire scrub screech, kerb rumbles, and lap chimes.
 */

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.masterGain = null;

    // Engine sound nodes
    this.osc1 = null;
    this.osc2 = null;
    this.engineGain = null;
    this.engineFilter = null;

    // Tire screech nodes
    this.screechNoise = null;
    this.screechFilter = null;
    this.screechGain = null;

    // Kerb rumble nodes
    this.kerbOsc = null;
    this.kerbGain = null;
  }

  init() {
    if (this.ctx) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();

      // Master Gain
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.3, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      // --- Engine Synthesizer ---
      this.osc1 = this.ctx.createOscillator();
      this.osc1.type = 'sawtooth';
      this.osc1.frequency.setValueAtTime(60, this.ctx.currentTime);

      this.osc2 = this.ctx.createOscillator();
      this.osc2.type = 'triangle';
      this.osc2.frequency.setValueAtTime(120, this.ctx.currentTime);

      this.engineFilter = this.ctx.createBiquadFilter();
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.setValueAtTime(350, this.ctx.currentTime);

      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.setValueAtTime(0.0, this.ctx.currentTime);

      this.osc1.connect(this.engineFilter);
      this.osc2.connect(this.engineFilter);
      this.engineFilter.connect(this.engineGain);
      this.engineGain.connect(this.masterGain);

      this.osc1.start();
      this.osc2.start();

      // --- Tire Screech Synthesizer (White noise buffer) ---
      const bufferSize = this.ctx.sampleRate * 2;
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      this.screechNoise = this.ctx.createBufferSource();
      this.screechNoise.buffer = noiseBuffer;
      this.screechNoise.loop = true;

      this.screechFilter = this.ctx.createBiquadFilter();
      this.screechFilter.type = 'bandpass';
      this.screechFilter.frequency.setValueAtTime(1800, this.ctx.currentTime);
      this.screechFilter.Q.setValueAtTime(3.0, this.ctx.currentTime);

      this.screechGain = this.ctx.createGain();
      this.screechGain.gain.setValueAtTime(0.0, this.ctx.currentTime);

      this.screechNoise.connect(this.screechFilter);
      this.screechFilter.connect(this.screechGain);
      this.screechGain.connect(this.masterGain);
      this.screechNoise.start();

      // --- Kerb Rumble Synthesizer ---
      this.kerbOsc = this.ctx.createOscillator();
      this.kerbOsc.type = 'square';
      this.kerbOsc.frequency.setValueAtTime(45, this.ctx.currentTime);

      this.kerbGain = this.ctx.createGain();
      this.kerbGain.gain.setValueAtTime(0.0, this.ctx.currentTime);

      this.kerbOsc.connect(this.kerbGain);
      this.kerbGain.connect(this.masterGain);
      this.kerbOsc.start();
    } catch (e) {
      console.warn('AudioContext initialization failed or blocked:', e);
    }
  }

  toggle() {
    this.enabled = !this.enabled;
    if (this.enabled) {
      if (!this.ctx) this.init();
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    } else if (this.ctx) {
      this.silenceAll();
    }
    return this.enabled;
  }

  silenceAll() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (this.engineGain) this.engineGain.gain.setValueAtTime(0, t);
    if (this.screechGain) this.screechGain.gain.setValueAtTime(0, t);
    if (this.kerbGain) this.kerbGain.gain.setValueAtTime(0, t);
  }

  update(car) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const speed = Math.max(0, car.speed);
    const topSpeed = car.spec.topSpeed * 1.3;
    const speedRatio = Math.min(1.0, speed / topSpeed);

    // Engine Pitch & Volume
    const baseFreq = 50 + speedRatio * 220 + (car.throttle > 0 ? 30 : 0);
    this.osc1.frequency.setValueAtTime(baseFreq, t);
    this.osc2.frequency.setValueAtTime(baseFreq * 1.5, t);
    this.engineFilter.frequency.setValueAtTime(300 + speedRatio * 900, t);

    const engineVol = speed > 0.1 ? 0.08 + speedRatio * 0.12 + car.throttle * 0.06 : 0.0;
    this.engineGain.gain.setValueAtTime(engineVol, t);

    // Tire Scrub Screech
    const scrub = car.scrubPenalty || 0;
    if (scrub > 0.45 && speed > 5.0) {
      const screechVol = Math.min(0.2, (scrub - 0.45) * 0.35);
      this.screechGain.gain.setValueAtTime(screechVol, t);
      this.screechFilter.frequency.setValueAtTime(1400 + scrub * 1000, t);
    } else {
      this.screechGain.gain.setValueAtTime(0.0, t);
    }

    // Kerb Rumble
    if (car.surface === 'kerb' && speed > 3.0) {
      this.kerbGain.gain.setValueAtTime(0.08, t);
      this.kerbOsc.frequency.setValueAtTime(40 + speed * 4, t);
    } else {
      this.kerbGain.gain.setValueAtTime(0.0, t);
    }
  }

  playLapChime() {
    if (!this.enabled || !this.ctx) return;
    try {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, t); // A5
      osc.frequency.exponentialRampToValueAtTime(1320, t + 0.12); // E6

      gain.gain.setValueAtTime(0.15, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(t);
      osc.stop(t + 0.45);
    } catch (e) {}
  }
}
