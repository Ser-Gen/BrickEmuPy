const DEFAULT_SAMPLE_RATE = 44100;

class Voice {
  constructor(ctx, masterGain) {
    this.ctx = ctx;
    this.masterGain = masterGain;
    this.output = ctx.createGain();
    this.output.gain.value = 0;
    this.output.connect(masterGain);
    this.osc = null;
    this.noiseSource = null;
    this.noiseFilter = null;
    this.mode = 'silent';
    this.lastFreq = 0;
    this.lastAmplitude = 0;
    this.lastNoise = false;
  }

  _createNoiseBuffer() {
    const seconds = 1;
    const frameCount = this.ctx.sampleRate * seconds;
    const buffer = this.ctx.createBuffer(1, frameCount, this.ctx.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < frameCount; i += 1) {
      channel[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  start(freq, noise, amplitude, when) {
    const clampedAmp = Math.max(-1, Math.min(1, amplitude));
    const targetFreq = Math.max(1, freq || 1);
    const sameMode = (noise && this.mode === 'noise') || (!noise && this.mode === 'tone');

    if (sameMode) {
      if (this.mode === 'tone' && this.osc) {
        this.osc.frequency.cancelScheduledValues(when);
        this.osc.frequency.setValueAtTime(targetFreq, when);
      }
      if (this.mode === 'noise' && this.noiseFilter) {
        this.noiseFilter.frequency.cancelScheduledValues(when);
        this.noiseFilter.frequency.setValueAtTime(Math.max(20, freq || 500), when);
      }
      this.output.gain.cancelScheduledValues(when);
      this.output.gain.linearRampToValueAtTime(clampedAmp, when + 0.002);
      this.lastFreq = targetFreq;
      this.lastAmplitude = clampedAmp;
      this.lastNoise = noise;
      return;
    }

    this.stop(when);
    if (noise) {
      const src = this.ctx.createBufferSource();
      src.buffer = this._createNoiseBuffer();
      src.loop = true;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(Math.max(20, freq || 500), when);
      filter.Q.value = 0.6;

      src.connect(filter);
      filter.connect(this.output);
      src.start(when);
      this.noiseSource = src;
      this.noiseFilter = filter;
      this.mode = 'noise';
    } else if (freq === 0) {
      // DC-like behavior: just keep fixed gain at current output.
      this.mode = 'silent';
    } else {
      const osc = this.ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(targetFreq, when);
      osc.connect(this.output);
      osc.start(when);
      this.osc = osc;
      this.mode = 'tone';
    }

    this.output.gain.cancelScheduledValues(when);
    this.output.gain.linearRampToValueAtTime(clampedAmp, when + 0.002);
    this.lastFreq = targetFreq;
    this.lastAmplitude = clampedAmp;
    this.lastNoise = noise;
  }

  stop(when) {
    this.output.gain.cancelScheduledValues(when);
    this.output.gain.linearRampToValueAtTime(0, when + 0.003);
    if (this.osc) {
      const osc = this.osc;
      osc.onended = () => {
        try { osc.disconnect(); } catch (_) {}
      };
      osc.stop(when + 0.004);
      this.osc = null;
    }
    if (this.noiseSource) {
      const src = this.noiseSource;
      const filter = this.noiseFilter;
      src.onended = () => {
        try { src.disconnect(); } catch (_) {}
        if (filter) {
          try { filter.disconnect(); } catch (_) {}
        }
      };
      src.stop(when + 0.004);
      this.noiseSource = null;
    }
    this.noiseFilter = null;
    this.mode = 'silent';
  }
}

export class WebAudioToneGenerator {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.voice = null;
    this.unlocked = false;
    this.muted = false;
    this.timelineBase = { emuSec: 0, audioSec: 0 };
    this._lastScheduledAudioTime = 0;
  }

  async ensureUnlocked() {
    if (!this.ctx) {
      this.ctx = new AudioContext({ sampleRate: DEFAULT_SAMPLE_RATE });
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.2;
      this.masterGain.connect(this.ctx.destination);
      this.voice = new Voice(this.ctx, this.masterGain);
    }
    if (this.ctx.state !== 'running') {
      await this.ctx.resume();
    }
    this.unlocked = true;
    this.rebaseTimeline(0);
  }

  rebaseTimeline(emuNowSec) {
    if (!this.ctx) {
      return;
    }
    this.timelineBase = {
      emuSec: emuNowSec,
      audioSec: this.ctx.currentTime + 0.05,
    };
    this._lastScheduledAudioTime = this.timelineBase.audioSec;
  }

  setMuted(muted) {
    this.muted = muted;
    if (!this.masterGain || !this.ctx) {
      return;
    }
    const now = this.ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(muted ? 0 : 0.2, now);
  }

  _mapTime(emuSec) {
    if (!this.ctx) {
      return 0;
    }
    const delta = emuSec - this.timelineBase.emuSec;
    const rawWhen = this.timelineBase.audioSec + Math.max(0, delta);
    const safeNow = this.ctx.currentTime + 0.01;
    const monotonic = this._lastScheduledAudioTime + 0.00025;
    const when = Math.max(rawWhen, safeNow, monotonic);
    this._lastScheduledAudioTime = when;
    return when;
  }

  play(freq, noise, amplitude, emuSec) {
    if (!this.unlocked || !this.voice) {
      return;
    }
    this.voice.start(freq, noise, amplitude, this._mapTime(emuSec));
  }

  stop(emuSec) {
    if (!this.unlocked || !this.voice) {
      return;
    }
    this.voice.stop(this._mapTime(emuSec));
  }
}
