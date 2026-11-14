// Aetherhold — procedural ambience, interface chimes and a looping background music
// playlist. The music is a few synthetic "war-band" style tracks generated on the fly
// so no external audio files are required.

export class AudioEngine {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.master = null;
    this.ambienceGain = null;
    this.musicGain = null;
    this.started = false;
    this.muted = Boolean(settings.muted);

    // Five synthetic tracks, each with a war/tavern/charge feel. Only the track
    // that is playing is synthesised, so starting the music never blocks the
    // main thread with five minutes of sample generation at once.
    this.tracks = [
      () => this._trackCharge(),
      () => this._trackMarch(),
      () => this._trackHearth(),
      () => this._trackStorm(),
      () => this._trackLastStand(),
    ];
    this.trackNames = ["Charge", "March", "Hearth", "Storm", "Last Stand"];
    this.trackIndex = 0;
    this.musicSources = [];
    this.playingMusic = false;
    this.musicTimer = null;
  }

  ensure() {
    if (this.ctx) return this.ctx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.settings.master / 100;
    this.master.connect(this.ctx.destination);

    this.ambienceGain = this.ctx.createGain();
    this.ambienceGain.gain.value = this.settings.ambience / 100 * 0.35;
    this.ambienceGain.connect(this.master);
    return this.ctx;
  }

  startAmbience() {
    const ctx = this.ensure();
    if (!ctx || this.started) return;
    this.started = true;

    // Low drone: two detuned saws through a low-pass filter.
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 380;
    filter.Q.value = 0.7;
    filter.connect(this.ambienceGain);

    [55, 82.5, 110.3].forEach((freq, index) => {
      const osc = ctx.createOscillator();
      osc.type = index === 2 ? "sine" : "sawtooth";
      osc.frequency.value = freq;
      osc.detune.value = (index - 1) * 6;
      const gain = ctx.createGain();
      gain.gain.value = index === 2 ? 0.1 : 0.05;
      osc.connect(gain).connect(filter);
      osc.start();
      // Slow breathing motion.
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.04 + index * 0.017;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.025;
      lfo.connect(lfoGain).connect(gain.gain);
      lfo.start();
    });

    // Filtered noise bed, like wind outside the hall.
    const length = ctx.sampleRate * 3;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.2;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.value = 520;
    noiseFilter.Q.value = 0.6;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.16;
    noise.connect(noiseFilter).connect(noiseGain).connect(this.ambienceGain);
    noise.start();
  }

  applySettings(settings) {
    this.settings = settings;
    this.muted = Boolean(settings.muted);
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.linearRampToValueAtTime(this.muted ? 0 : settings.master / 100, now + 0.15);
    this.ambienceGain.gain.linearRampToValueAtTime(settings.ambience / 100 * 0.35, now + 0.2);
    if (this.musicGain) {
      this.musicGain.gain.cancelScheduledValues(now);
      this.musicGain.gain.linearRampToValueAtTime(this.muted ? 0 : settings.music / 100 * 0.5, now + 0.2);
    }
    if (settings.music > 0 && !this.playingMusic) {
      this.startMusic();
    } else if (settings.music === 0 && this.playingMusic) {
      this.stopMusic();
    }
  }

  // ── playlist control ──────────────────────────────────────────────────
  startMusic() {
    if (!this.settings || this.settings.music <= 0) return;
    if (this.playingMusic) {
      // Restart the playlist from the beginning so the user hears track 1 first.
      this.trackIndex = 0;
      this._playCurrentTrack();
      return;
    }
    this.playingMusic = true;
    this.trackIndex = 0;
    this._playCurrentTrack();
  }

  stopMusic() {
    this.playingMusic = false;
    if (this.musicTimer) {
      clearTimeout(this.musicTimer);
      this.musicTimer = null;
    }
    for (const s of this.musicSources) {
      try { s.stop(); } catch { /* already stopped */ }
    }
    this.musicSources = [];
    if (this.musicGain) this.musicGain.gain.value = 0;
  }

  setMusicVolume(v) {
    if (!this.musicGain || !this.ctx) return;
    const now = this.ctx.currentTime;
    this.musicGain.gain.cancelScheduledValues(now);
    this.musicGain.gain.linearRampToValueAtTime(v, now + 0.2);
  }

  // Rebuild everything when settings change so volume/mute changes feel instant.
  refreshFromSettings() {
    this.applySettings(this.settings);
  }

  _playCurrentTrack() {
    const ctx = this.ensure();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();

    // Stop previous sources.
    for (const s of this.musicSources) {
      try { s.stop(); } catch { /* already stopped */ }
    }
    this.musicSources = [];

    if (!this.musicGain) {
      this.musicGain = ctx.createGain();
      this.musicGain.gain.value = this.muted ? 0 : (this.settings.music / 100) * 0.5;
      this.musicGain.connect(this.master);
    }

    const build = this.tracks[this.trackIndex];
    this.currentTrackName = this.trackNames[this.trackIndex] || "Aetherhold";
    this.musicGen = (this.musicGen || 0) + 1;
    const generation = this.musicGen;

    // Layers are synthesised one at a time, yielding to the browser between
    // each. Building the whole track in one go blocks the main thread for
    // seconds, which freezes the game the moment the playlist advances.
    const track = typeof build === "function" ? build() : build;
    if (!track) return;
    let index = 0;
    const nextLayer = () => {
      if (!this.playingMusic || this.musicGen !== generation) return;
      const layer = track[index];
      index += 1;
      if (layer) {
        const source = ctx.createBufferSource();
        source.buffer = layer.buffer;
        source.loop = true;
        let node = source;
        if (layer.filter) {
          const f = ctx.createBiquadFilter();
          f.type = layer.filter.type;
          f.frequency.value = layer.filter.frequency;
          if (layer.filter.Q) f.Q.value = layer.filter.Q;
          source.connect(f);
          node = f;
        }
        if (layer.gain !== undefined) {
          const g = ctx.createGain();
          g.gain.value = layer.gain;
          node.connect(g);
          node = g;
        }
        node.connect(this.musicGain);
        source.start();
        this.musicSources.push(source);
      }
      if (index < track.length) {
        setTimeout(nextLayer, 0);
        return;
      }
      // Whole track is live: schedule the next one.
      if (this.musicTimer) clearTimeout(this.musicTimer);
      const duration = track[0]?.buffer?.duration || 6;
      this.musicTimer = setTimeout(() => {
        if (!this.playingMusic) return;
        this.trackIndex = (this.trackIndex + 1) % this.tracks.length;
        this._playCurrentTrack();
      }, Math.max(4000, duration * 2 * 1000));
    };
    nextLayer();
  }

  tone({ freq = 440, type = "sine", duration = 0.18, gain = 0.08, slide = 0, delay = 0 }) {
    if (!this.settings.sfx || this.muted) return;
    const ctx = this.ensure();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), start + duration);
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(gain, start + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(env).connect(this.master);
    osc.start(start);
    osc.stop(start + duration + 0.05);
  }

  hover() { this.tone({ freq: 720, type: "sine", duration: 0.05, gain: 0.018 }); }

  click() {
    this.tone({ freq: 520, type: "triangle", duration: 0.09, gain: 0.05 });
    this.tone({ freq: 780, type: "sine", duration: 0.12, gain: 0.025, delay: 0.03 });
  }

  chime() {
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      this.tone({ freq, type: "sine", duration: 0.9, gain: 0.05, delay: i * 0.07 });
    });
  }

  enter() {
    [392, 523.25, 659.25, 987.77].forEach((freq, i) => {
      this.tone({ freq, type: "triangle", duration: 1.4, gain: 0.055, delay: i * 0.1 });
    });
  }

  dice() {
    for (let i = 0; i < 5; i += 1) {
      this.tone({ freq: 220 + Math.random() * 900, type: "square", duration: 0.05, gain: 0.03, delay: i * 0.055 });
    }
    this.tone({ freq: 880, type: "triangle", duration: 0.4, gain: 0.05, delay: 0.32 });
  }

  message() { this.tone({ freq: 660, type: "sine", duration: 0.12, gain: 0.03 }); }

  // ── synthetic music tracks ──────────────────────────────────────────────
  // Each track is an array of layers: a looping AudioBuffer plus optional
  // filter/gain. They are built from scratch so the demo needs no external
  // audio files.
  _buildBuffer(duration, fill) {
    const ctx = this.ensure();
    if (!ctx) throw new Error("no audio context");
    // 22 kHz is plenty for these lo-fi war drums, and it halves the number of
    // samples we have to synthesise. WebAudio resamples on playback.
    const rate = Math.min(16000, ctx.sampleRate);
    const buf = ctx.createBuffer(1, Math.floor(rate * duration), rate);
    const data = buf.getChannelData(0);
    fill(data, rate);
    return buf;
  }

  _noiseBuffer(duration, lowpass = 900, resonance = 0.7) {
    return this._buildBuffer(duration, (data, sr) => {
      let last = 0;
      for (let i = 0; i < data.length; i += 1) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 2.2;
      }
      // crude one-pole low-pass in place
      let prev = 0;
      const a = 2 * Math.PI * lowpass / sr;
      for (let i = 0; i < data.length; i += 1) {
        prev = prev + a * (data[i] - prev);
        data[i] = prev * resonance;
      }
    });
  }

  // One drum hit is synthesised, then copied across the beat grid. Filling
  // every sample with sin()/exp() took hundreds of milliseconds per layer, which
  // stuttered the page whenever the playlist advanced.
  _kickBuffer(duration, tempo = 92) {
    return this._buildBuffer(duration, (data, sr) => {
      const beat = Math.max(64, Math.floor(sr / (tempo / 60)));
      const hit = new Float32Array(beat);
      for (let i = 0; i < beat; i += 1) {
        const t = i / sr;
        const env = Math.exp(-t * 26);
        hit[i] = (Math.sin(2 * Math.PI * 55 * t) * 0.9 + Math.sin(2 * Math.PI * 110 * t) * 0.4) * env * 0.9;
      }
      for (let start = 0; start < data.length; start += beat) {
        data.set(hit.subarray(0, Math.min(beat, data.length - start)), start);
      }
    });
  }

  _hatBuffer(duration, tempo = 92, dense = 1) {
    return this._buildBuffer(duration, (data, sr) => {
      const step = Math.max(32, Math.floor(sr / (tempo / 60) / dense));
      const hit = new Float32Array(step);
      for (let i = 0; i < step; i += 1) {
        const t = i / sr;
        hit[i] = (Math.random() * 2 - 1) * Math.exp(-t * 40) * 0.12 * dense;
      }
      for (let start = 0; start < data.length; start += step) {
        const len = Math.min(step, data.length - start);
        for (let i = 0; i < len; i += 1) data[start + i] += hit[i];
      }
    });
  }

  _padBuffer(duration, freqs, tempo = 70) {
    return this._buildBuffer(duration, (data, sr) => {
      // Slow swell, recomputed once per 64 samples instead of per sample.
      const swellRate = (tempo / 60) / (sr * 1.0);
      for (const f of freqs) {
        let swell = 0.5;
        for (let i = 0; i < data.length; i += 1) {
          if (i % 64 === 0) {
            swell = 0.5 + 0.5 * Math.sin(2 * Math.PI * swellRate * i);
          }
          data[i] += Math.sin(2 * Math.PI * f * i / sr) * 0.12 * swell;
        }
      }
    });
  }

  _droneBuffer(duration, freq, type = "sawtooth", detune = 0, gain = 0.08) {
    return this._buildBuffer(duration, (data, sr) => {
      for (let i = 0; i < data.length; i += 1) {
        const t = i / sr;
        if (type === "sawtooth") {
          let s = 0;
          for (let h = 1; h <= 4; h += 1) {
            s += Math.sin(2 * Math.PI * (freq * h + detune * (h - 1)) * t) / h;
          }
          data[i] += s * 0.5 * gain;
        } else {
          data[i] += Math.sin(2 * Math.PI * freq * t) * gain;
        }
      }
    });
  }

  _melodyBuffer(duration, notes, tempo = 78, accent = 0.12) {
    // notes: array of [freq, startBeat, lengthBeats]
    return this._buildBuffer(duration, (data, sr) => {
      const beat = sr / (tempo / 60);
      const env = new Float32Array(data.length);
      for (let i = 0; i < data.length; i += 1) env[i] = 1;
      for (const [freq, startBeat, lenBeats] of notes) {
        const start = Math.floor(startBeat * beat);
        const len = Math.floor(lenBeats * beat);
        for (let i = 0; i < len && start + i < data.length; i += 1) {
          const t = i / sr;
          const e = Math.exp(-t * 3.2);
          data[start + i] += Math.sin(2 * Math.PI * freq * t) * accent * e;
        }
      }
    });
  }

  _trackCharge() {
    const d = 6;
    return [
      { buffer: this._kickBuffer(d, 104) },
      { buffer: this._hatBuffer(d, 104, 2), gain: 0.5 },
      { buffer: this._padBuffer(d, [55, 82.5, 110], 70), gain: 0.35, filter: { type: "lowpass", frequency: 520, Q: 0.6 } },
      { buffer: this._melodyBuffer(d, [
        [220, 0, 1], [261.6, 1, 1], [293.7, 2, 1], [261.6, 3, 0.5],
        [329.6, 4, 1], [293.7, 5, 1], [261.6, 6, 1], [196, 7, 1],
        [220, 8, 1], [261.6, 9, 1], [293.7, 10, 1], [349.2, 11, 1],
        [392, 12, 1], [349.2, 13, 0.5], [329.6, 14, 1], [261.6, 15, 1],
        [220, 16, 1], [196, 17, 1], [174.6, 18, 1], [196, 19, 1],
        [220, 20, 1], [261.6, 21, 1], [293.7, 22, 1], [261.6, 23, 1],
      ], 96, 0.14), filter: { type: "bandpass", frequency: 760, Q: 0.8 }, gain: 0.8 },
    ];
  }

  _trackMarch() {
    const d = 7;
    return [
      { buffer: this._kickBuffer(d, 118) },
      { buffer: this._hatBuffer(d, 118, 2), gain: 0.55 },
      { buffer: this._droneBuffer(d, 98, "sawtooth", -5, 0.06) },
      { buffer: this._droneBuffer(d, 147, "sawtooth", 4, 0.05) },
      { buffer: this._melodyBuffer(d, [
        [130.8, 0, 1], [155.6, 1, 1], [185, 2, 1], [164.8, 3, 1],
        [196, 4, 1], [185, 5, 1], [164.8, 6, 1], [146.8, 7, 1],
        [130.8, 8, 1], [155.6, 9, 1], [185, 10, 1], [196, 11, 1],
        [220, 12, 1], [196, 13, 1], [164.8, 14, 1], [146.8, 15, 1],
        [130.8, 16, 1], [164.8, 17, 1], [196, 18, 1], [185, 19, 1],
        [155.6, 20, 1], [146.8, 21, 1], [130.8, 22, 1], [110, 23, 1],
      ], 108, 0.13), filter: { type: "bandpass", frequency: 980, Q: 0.7 }, gain: 0.7 },
    ];
  }

  _trackHearth() {
    const d = 7;
    return [
      { buffer: this._noiseBuffer(d, 720, 0.5), gain: 0.3 },
      { buffer: this._droneBuffer(d, 65.4, "sawtooth", -8, 0.05) },
      { buffer: this._droneBuffer(d, 98, "sine", 0, 0.08) },
      { buffer: this._melodyBuffer(d, [
        [196, 0, 1.5], [220, 1.5, 1.5], [196, 3, 1.5], [174.6, 4.5, 1.5],
        [164.8, 6, 1.5], [174.6, 7.5, 1.5], [196, 9, 1.5], [220, 10.5, 1.5],
        [261.6, 12, 1.5], [220, 13.5, 1.5], [196, 15, 1.5], [174.6, 16.5, 1.5],
        [164.8, 18, 1.5], [174.6, 19.5, 1.5], [196, 21, 1.5], [220, 22.5, 1.5],
      ], 70, 0.1), filter: { type: "lowpass", frequency: 640, Q: 0.5 }, gain: 0.9 },
    ];
  }

  _trackStorm() {
    const d = 6;
    return [
      { buffer: this._noiseBuffer(d, 260, 0.9), gain: 0.5 },
      { buffer: this._noiseBuffer(d, 1600, 0.4), gain: 0.25 },
      { buffer: this._kickBuffer(d, 80) },
      { buffer: this._droneBuffer(d, 49, "sawtooth", -10, 0.07) },
      { buffer: this._droneBuffer(d, 73.5, "sawtooth", 6, 0.05) },
      { buffer: this._melodyBuffer(d, [
        [146.8, 0, 2], [110, 2, 2], [98, 4, 2], [87.3, 6, 2],
        [98, 8, 2], [110, 10, 2], [130.8, 12, 2], [146.8, 14, 2],
        [164.8, 16, 2], [146.8, 18, 2], [130.8, 20, 2], [110, 22, 2],
        [98, 24, 2],
      ], 76, 0.16), filter: { type: "bandpass", frequency: 520, Q: 0.9 }, gain: 0.9 },
    ];
  }

  _trackLastStand() {
    const d = 8;
    return [
      { buffer: this._kickBuffer(d, 88) },
      { buffer: this._hatBuffer(d, 88, 3), gain: 0.6 },
      { buffer: this._droneBuffer(d, 55, "sawtooth", -12, 0.09) },
      { buffer: this._droneBuffer(d, 110, "sawtooth", 8, 0.07) },
      { buffer: this._melodyBuffer(d, [
        [196, 0, 1.5], [220, 1.5, 1.5], [261.6, 3, 1.5], [220, 4.5, 1.5],
        [196, 6, 1.5], [220, 7.5, 1.5], [261.6, 9, 1.5], [329.6, 10.5, 1.5],
        [392, 12, 1.5], [329.6, 13.5, 1.5], [261.6, 15, 1.5], [220, 16.5, 1.5],
        [196, 18, 1.5], [220, 19.5, 1.5], [261.6, 21, 1.5], [293.7, 22.5, 1.5],
        [329.6, 24, 1.5], [293.7, 25.5, 1.5], [261.6, 27, 1.5], [220, 28.5, 1.5],
        [196, 30, 1.5], [174.6, 31.5, 1.5],
      ], 92, 0.17), filter: { type: "bandpass", frequency: 680, Q: 0.7 }, gain: 0.9 },
    ];
  }

  error() {
    this.tone({ freq: 190, type: "sawtooth", duration: 0.22, gain: 0.05 });
    this.tone({ freq: 140, type: "sawtooth", duration: 0.3, gain: 0.04, delay: 0.1 });
  }
}
