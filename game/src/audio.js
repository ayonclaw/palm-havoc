// Sound and music, synthesised: an oscillator engine that follows the revs, a noise generator for
// tyres, gunshots and footsteps, a two-tone siren, and a slow minor-key loop for the bay. No audio
// file anywhere in the entry.
export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.master = null;
    this.musicGain = null;
    this.fxGain = null;
    this.step = 0;
    this.nextNote = 0;
    this.musicOn = true;
    this.sirenOn = false;
    this.engine = null;
    this.noise = null;
    this.lastFootstep = 0;
  }

  /** Called from the first click or key press: browsers only allow audio after a gesture. */
  unlock() {
    if (this.ctx || !this.enabled) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) {
      this.enabled = false;
      return;
    }
    try {
      this.ctx = new Ctx();
    } catch {
      this.enabled = false;
      return;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(ctx.destination);
    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = 0.3;
    this.musicGain.connect(this.master);
    this.fxGain = ctx.createGain();
    this.fxGain.gain.value = 0.85;
    this.fxGain.connect(this.master);

    // One noise buffer reused by every percussive sound.
    const length = Math.floor(ctx.sampleRate * 1.2);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) data[index] = Math.random() * 2 - 1;
    this.noise = buffer;

    this.startEngine();
    this.nextNote = ctx.currentTime + 0.2;
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  get started() {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  /** The engine: a saw through a low-pass, plus tyre noise, always running but usually silent. */
  startEngine() {
    const ctx = this.ctx;
    const oscillator = ctx.createOscillator();
    oscillator.type = 'sawtooth';
    oscillator.frequency.value = 48;
    const sub = ctx.createOscillator();
    sub.type = 'square';
    sub.frequency.value = 24;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    filter.Q.value = 2.5;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    oscillator.connect(filter);
    sub.connect(filter);
    filter.connect(gain);
    gain.connect(this.fxGain);
    oscillator.start();
    sub.start();

    const tyreSource = ctx.createBufferSource();
    tyreSource.buffer = this.noise;
    tyreSource.loop = true;
    const tyreFilter = ctx.createBiquadFilter();
    tyreFilter.type = 'bandpass';
    tyreFilter.frequency.value = 900;
    tyreFilter.Q.value = 0.7;
    const tyreGain = ctx.createGain();
    tyreGain.gain.value = 0;
    tyreSource.connect(tyreFilter);
    tyreFilter.connect(tyreGain);
    tyreGain.connect(this.fxGain);
    tyreSource.start();

    this.engine = { oscillator, sub, filter, gain, tyreGain, tyreFilter };
  }

  /** A short noise burst: gunshots, impacts, footsteps, tyre screech. */
  burst(duration, frequency, gain, type = 'lowpass', q = 1) {
    if (!this.started) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(gain, now + 0.006);
    envelope.gain.exponentialRampToValueAtTime(0.0005, now + duration);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(this.fxGain);
    source.start(now);
    source.stop(now + duration + 0.05);
  }

  /** A pitched blip: objectives, pickups, the wanted level going up. */
  tone(frequency, duration, gain = 0.2, type = 'triangle', slideTo = null) {
    if (!this.started) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const oscillator = ctx.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    if (slideTo) oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), now + duration);
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(gain, now + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0004, now + duration);
    oscillator.connect(envelope);
    envelope.connect(this.fxGain);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.03);
  }

  shot() {
    this.burst(0.22, 2600, 0.85, 'highpass', 1);
    this.tone(120, 0.18, 0.28, 'square', 50);
  }

  hit() {
    this.burst(0.1, 800, 0.4, 'bandpass', 1.4);
  }

  footstep() {
    this.burst(0.07, 320, 0.16, 'lowpass', 1);
  }

  thud() {
    this.burst(0.16, 220, 0.5, 'lowpass', 0.8);
    this.tone(70, 0.12, 0.2, 'sine', 45);
  }

  pickup() {
    this.tone(660, 0.1, 0.22, 'triangle');
    setTimeout(() => this.tone(990, 0.14, 0.2, 'triangle'), 90);
  }

  ping(kind) {
    if (kind === 'objective') {
      this.tone(560, 0.12, 0.18, 'sine');
      setTimeout(() => this.tone(840, 0.18, 0.16, 'sine'), 110);
    } else {
      this.tone(420, 0.1, 0.14, 'sine');
    }
  }

  wanted(level) {
    const base = 220 + level * 40;
    this.tone(base, 0.12, 0.2, 'square');
    setTimeout(() => this.tone(base * 1.5, 0.16, 0.18, 'square'), 110);
  }

  sirenStart() {
    if (this.sirenOn || !this.started) return;
    this.sirenOn = true;
    const ctx = this.ctx;
    const oscillator = ctx.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.value = 720;
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.62;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 210;
    lfo.connect(lfoGain);
    lfoGain.connect(oscillator.frequency);
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    gain.gain.linearRampToValueAtTime(0.055, ctx.currentTime + 1.2);
    oscillator.connect(gain);
    gain.connect(this.fxGain);
    oscillator.start();
    lfo.start();
    this.siren = { oscillator, lfo, gain };
  }

  sirenStop() {
    if (!this.sirenOn || !this.siren) return;
    this.sirenOn = false;
    const { oscillator, lfo, gain } = this.siren;
    gain.gain.linearRampToValueAtTime(0.0001, this.ctx.currentTime + 0.8);
    setTimeout(() => {
      try {
        oscillator.stop();
        lfo.stop();
      } catch {
        /* already stopped */
      }
    }, 900);
    this.siren = null;
  }

  /** The payout sting: a rising arpeggio over a warm pad. */
  jingle() {
    if (!this.started) return;
    const notes = [392, 493.9, 587.3, 784];
    notes.forEach((note, index) => {
      setTimeout(() => this.tone(note, 0.4, 0.2, 'triangle'), index * 110);
    });
  }

  /** A slow four-bar loop: a bass note, a pad chord and a brushed pulse. */
  scheduleMusic() {
    if (!this.started || !this.musicOn) return;
    const ctx = this.ctx;
    const tempo = 0.46;
    while (this.nextNote < ctx.currentTime + 1.2) {
      const step = this.step % 16;
      const root = [73.4, 73.4, 87.3, 65.4][Math.floor(this.step / 16) % 4];
      const when = Math.max(ctx.currentTime + 0.02, this.nextNote);

      if (step % 4 === 0) {
        const oscillator = ctx.createOscillator();
        oscillator.type = 'sine';
        oscillator.frequency.value = root;
        const envelope = ctx.createGain();
        envelope.gain.setValueAtTime(0, when);
        envelope.gain.linearRampToValueAtTime(0.34, when + 0.04);
        envelope.gain.exponentialRampToValueAtTime(0.0004, when + tempo * 3.6);
        oscillator.connect(envelope);
        envelope.connect(this.musicGain);
        oscillator.start(when);
        oscillator.stop(when + tempo * 4);
      }

      if (step === 0 || step === 8) {
        const chord = step === 0 ? [root * 4, root * 4.76, root * 5.99] : [root * 3.56, root * 4.24, root * 5.34];
        for (const frequency of chord) {
          const oscillator = ctx.createOscillator();
          oscillator.type = 'triangle';
          oscillator.frequency.value = frequency;
          const envelope = ctx.createGain();
          envelope.gain.setValueAtTime(0, when);
          envelope.gain.linearRampToValueAtTime(0.05, when + 0.25);
          envelope.gain.exponentialRampToValueAtTime(0.0003, when + tempo * 7.4);
          oscillator.connect(envelope);
          envelope.connect(this.musicGain);
          oscillator.start(when);
          oscillator.stop(when + tempo * 8);
        }
      }

      if (step % 2 === 0) {
        const source = ctx.createBufferSource();
        source.buffer = this.noise;
        const filter = ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 5200;
        const envelope = ctx.createGain();
        envelope.gain.setValueAtTime(0, when);
        envelope.gain.linearRampToValueAtTime(step % 4 === 0 ? 0.05 : 0.025, when + 0.005);
        envelope.gain.exponentialRampToValueAtTime(0.0002, when + 0.09);
        source.connect(filter);
        filter.connect(envelope);
        envelope.connect(this.musicGain);
        source.start(when);
        source.stop(when + 0.12);
      }

      this.nextNote += tempo;
      this.step += 1;
    }
  }

  /** Told every frame what the world is doing; the engine and the siren follow it. */
  update(dt, state) {
    if (!this.started) return;
    const engine = this.engine;
    if (engine) {
      const speed = state.speed ?? 0;
      const driving = state.driving ? 1 : 0;
      const target = driving ? 0.055 + Math.min(0.1, Math.abs(speed) * 0.0035) : 0.0001;
      const frequency = 42 + Math.abs(speed) * 5.2;
      engine.gain.gain.value += (target - engine.gain.gain.value) * Math.min(1, dt * 8);
      engine.oscillator.frequency.value += (frequency - engine.oscillator.frequency.value) * Math.min(1, dt * 6);
      engine.sub.frequency.value = engine.oscillator.frequency.value * 0.5;
      engine.filter.frequency.value = 340 + Math.abs(speed) * 26;
      const tyre = driving ? Math.min(0.09, Math.abs(speed) * 0.0022) : 0.0001;
      engine.tyreGain.gain.value += (tyre - engine.tyreGain.gain.value) * Math.min(1, dt * 6);
    }

    if (state.wanted > 0) this.sirenStart();
    else this.sirenStop();

    this.scheduleMusic();
  }
}
