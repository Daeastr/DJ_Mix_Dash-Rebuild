export class Deck {
  context: AudioContext;
  source: AudioBufferSourceNode | null = null;
  gainNode: GainNode;
  lowFilter: BiquadFilterNode;
  midFilter: BiquadFilterNode;
  highFilter: BiquadFilterNode;
  masterFilter: BiquadFilterNode;
  analyser: AnalyserNode;

  // FX Nodes
  fxGain: GainNode;
  delayNode: DelayNode;
  delayFeedback: GainNode;
  delayFilter: BiquadFilterNode;
  gateNode: GainNode;
  noiseNode: AudioBufferSourceNode | null = null;
  noiseGain: GainNode;

  buffer: AudioBuffer | null = null;
  startTime: number = 0;
  offset: number = 0;
  isPlaying: boolean = false;
  playbackRate: number = 1.0;
  bpm: number = 120;

  // FX State
  activeFX: string | null = null;
  fxIntensity: number = 0.5;
  fxTimer: ReturnType<typeof setInterval> | null = null;

  constructor(context: AudioContext, destination: AudioNode) {
    this.context = context;

    this.gainNode = context.createGain();

    // 3-Band EQ
    this.lowFilter = context.createBiquadFilter();
    this.lowFilter.type = 'lowshelf';
    this.lowFilter.frequency.value = 320;

    this.midFilter = context.createBiquadFilter();
    this.midFilter.type = 'peaking';
    this.midFilter.frequency.value = 1000;
    this.midFilter.Q.value = 1.0;

    this.highFilter = context.createBiquadFilter();
    this.highFilter.type = 'highshelf';
    this.highFilter.frequency.value = 3200;

    // Master Filter (LP/HP)
    this.masterFilter = context.createBiquadFilter();
    this.masterFilter.type = 'lowpass';
    this.masterFilter.frequency.value = 20000;

    // FX Chain
    this.fxGain = context.createGain();
    this.gateNode = context.createGain();

    this.delayNode = context.createDelay(2.0);
    this.delayFeedback = context.createGain();
    this.delayFilter = context.createBiquadFilter();
    this.delayFilter.type = 'highpass';
    this.delayFilter.frequency.value = 400;

    this.noiseGain = context.createGain();
    this.noiseGain.gain.value = 0;

    this.analyser = context.createAnalyser();
    this.analyser.fftSize = 256;

    // Chain: Source -> EQ -> Filter -> Gate -> FXGain -> Gain -> Analyser -> Destination
    this.lowFilter.connect(this.midFilter);
    this.midFilter.connect(this.highFilter);
    this.highFilter.connect(this.masterFilter);
    this.masterFilter.connect(this.gateNode);
    this.gateNode.connect(this.fxGain);
    this.fxGain.connect(this.gainNode);

    // Delay routing
    this.fxGain.connect(this.delayNode);
    this.delayNode.connect(this.delayFilter);
    this.delayFilter.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delayNode);
    this.delayNode.connect(this.gainNode);

    // Noise routing
    this.noiseGain.connect(this.gainNode);

    this.gainNode.connect(this.analyser);
    this.analyser.connect(destination);
  }

  load(buffer: AudioBuffer) {
    this.stop();
    this.buffer = buffer;
    this.offset = 0;
  }

  play(rate?: number) {
    if (!this.buffer || this.isPlaying) return;

    if (rate) this.playbackRate = rate;

    this.source = this.context.createBufferSource();
    this.source.buffer = this.buffer;
    this.source.playbackRate.value = this.playbackRate;
    this.source.connect(this.lowFilter);

    this.startTime = this.context.currentTime;
    this.source.start(0, this.offset);
    this.isPlaying = true;

    const currentSource = this.source;
    this.source.onended = () => {
      if (this.source === currentSource) {
        this.isPlaying = false;
      }
    };
  }

  pause() {
    if (!this.isPlaying) return;
    this.offset += (this.context.currentTime - this.startTime) * this.playbackRate;
    this.stop();
  }

  stop() {
    if (this.source) {
      this.source.onended = null;
      try { this.source.stop(); } catch (_) { /* already stopped */ }
      this.source.disconnect();
      this.source = null;
    }
    this.isPlaying = false;
    this.clearFX();
  }

  setVolume(val: number) {
    this.gainNode.gain.setTargetAtTime(val, this.context.currentTime, 0.01);
  }

  setPlaybackRate(val: number) {
    this.playbackRate = val;
    if (this.source) {
      this.source.playbackRate.setTargetAtTime(val, this.context.currentTime, 0.01);
    }
  }

  setEQ(low: number, mid: number, high: number) {
    this.lowFilter.gain.setTargetAtTime(low, this.context.currentTime, 0.01);
    this.midFilter.gain.setTargetAtTime(mid, this.context.currentTime, 0.01);
    this.highFilter.gain.setTargetAtTime(high, this.context.currentTime, 0.01);
  }

  setFilter(freq: number, type: BiquadFilterType = 'lowpass') {
    this.masterFilter.type = type;
    this.masterFilter.frequency.setTargetAtTime(freq, this.context.currentTime, 0.01);
  }

  triggerFX(fxName: string, active: boolean) {
    if (!active) {
      this.clearFX(fxName);
      return;
    }

    this.activeFX = fxName;
    const beatDuration = 60 / (this.bpm || 120);

    switch (fxName) {
      case 'baby_scratch':
        this.applyBabyScratch();
        break;
      case 'flare_scratch':
        this.applyFlareScratch(beatDuration);
        break;
      case 'echo_scratch':
        this.applyEchoScratch();
        break;
      case 'beatmasher':
        this.applyBeatmasher(beatDuration);
        break;
      case 'echo_out':
        this.applyEchoOut(beatDuration);
        break;
      case 'delay_build':
        this.applyDelayBuild(beatDuration);
        break;
      case 'vinyl_stop':
        this.applyVinylStop();
        break;
      case 'filter_riser':
        this.applyFilterRiser();
        break;
    }
  }

  clearFX(_fxName?: string) {
    // Stop any interval-based FX immediately
    if (this.fxTimer) {
      clearInterval(this.fxTimer);
      this.fxTimer = null;
    }

    const now = this.context.currentTime;

    // Cancel ALL scheduled automation and snap to clean values instantly
    this.gateNode.gain.cancelScheduledValues(now);
    this.gateNode.gain.setValueAtTime(1, now);

    this.fxGain.gain.cancelScheduledValues(now);
    this.fxGain.gain.setValueAtTime(1, now);

    this.delayFeedback.gain.cancelScheduledValues(now);
    this.delayFeedback.gain.setValueAtTime(0, now);

    this.delayNode.delayTime.cancelScheduledValues(now);
    this.delayNode.delayTime.setValueAtTime(0, now);

    // Reset master filter to full pass-through
    this.masterFilter.frequency.cancelScheduledValues(now);
    this.masterFilter.type = 'lowpass';
    this.masterFilter.frequency.setValueAtTime(20000, now);

    // Cancel any playback-rate ramp (e.g. vinyl stop) and restore normal speed
    if (this.source) {
      this.source.playbackRate.cancelScheduledValues(now);
      this.source.playbackRate.setValueAtTime(this.playbackRate, now);
    }

    // Kill noise node immediately
    if (this.noiseNode) {
      this.noiseGain.gain.cancelScheduledValues(now);
      this.noiseGain.gain.setValueAtTime(0, now);
      try { this.noiseNode.stop(); } catch (_) { /* already stopped */ }
      this.noiseNode = null;
    }

    this.activeFX = null;
  }

  private applyBabyScratch() {
    if (!this.source) return;
    let high = true;
    this.fxTimer = setInterval(() => {
      high = !high;
      // Alternate between fast-forward and near-stop to simulate scratch
      this.source?.playbackRate.setTargetAtTime(high ? 1.8 : 0.15, this.context.currentTime, 0.02);
    }, 80);
  }

  private applyFlareScratch(beatDuration: number) {
    const interval = beatDuration / 4;
    let state = true;
    this.fxTimer = setInterval(() => {
      state = !state;
      this.gateNode.gain.setTargetAtTime(state ? 1 : 0, this.context.currentTime, 0.005);
    }, interval * 1000);
  }

  private applyEchoScratch() {
    this.applyBabyScratch();
  }

  private applyBeatmasher(beatDuration: number) {
    const interval = beatDuration / 8;
    let state = true;
    this.fxTimer = setInterval(() => {
      state = !state;
      this.gateNode.gain.setTargetAtTime(state ? 1 : 0, this.context.currentTime, 0.005);
    }, interval * 1000);
  }

  private applyEchoOut(beatDuration: number) {
    const now = this.context.currentTime;
    this.delayNode.delayTime.setValueAtTime(beatDuration * 0.75, now);
    this.delayFeedback.gain.setTargetAtTime(0.5 + this.fxIntensity * 0.4, now, 0.01);
    this.fxGain.gain.setTargetAtTime(0, now + 0.1, 2.0 - this.fxIntensity);
  }

  private applyDelayBuild(beatDuration: number) {
    const now = this.context.currentTime;
    this.delayNode.delayTime.setValueAtTime(beatDuration * 0.25, now);
    this.delayFeedback.gain.linearRampToValueAtTime(0.4 + this.fxIntensity * 0.5, now + 4);
    this.masterFilter.type = 'highpass';
    this.masterFilter.frequency.linearRampToValueAtTime(500 + this.fxIntensity * 3000, now + 4);
  }

  private applyVinylStop() {
    if (!this.source) return;
    const now = this.context.currentTime;
    this.source.playbackRate.cancelScheduledValues(now);
    this.source.playbackRate.linearRampToValueAtTime(0, now + 1.8);
  }

  private applyFilterRiser() {
    const now = this.context.currentTime;
    const bufferSize = this.context.sampleRate * 2;
    const noiseBuffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    this.noiseNode = this.context.createBufferSource();
    this.noiseNode.buffer = noiseBuffer;
    this.noiseNode.loop = true;
    this.noiseNode.connect(this.noiseGain);
    this.noiseNode.start();

    this.noiseGain.gain.setTargetAtTime(0.05 + this.fxIntensity * 0.1, now, 0.1);
    this.noiseGain.gain.linearRampToValueAtTime(0.2 + this.fxIntensity * 0.3, now + 4);

    this.masterFilter.type = 'lowpass';
    this.masterFilter.frequency.setValueAtTime(200, now);
    this.masterFilter.frequency.exponentialRampToValueAtTime(1000 + this.fxIntensity * 18000, now + 4);
  }

  getCurrentTime() {
    if (!this.isPlaying) return this.offset;
    return this.offset + (this.context.currentTime - this.startTime) * this.playbackRate;
  }

  seek(time: number) {
    const wasPlaying = this.isPlaying;
    this.stop();
    this.offset = Math.max(0, Math.min(time, this.buffer?.duration || 0));
    if (wasPlaying) this.play();
  }
}

export class DJEngine {
  context: AudioContext;
  deckA: Deck;
  deckB: Deck;
  masterGain: GainNode;

  constructor() {
    this.context = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.masterGain = this.context.createGain();
    this.masterGain.connect(this.context.destination);

    this.deckA = new Deck(this.context, this.masterGain);
    this.deckB = new Deck(this.context, this.masterGain);

    this.setCrossfade(0);
  }

  setCrossfade(value: number) {
    const gainA = Math.cos(((value + 1) * 0.5 * Math.PI) / 2);
    const gainB = Math.cos(((1 - value) * 0.5 * Math.PI) / 2);
    this.deckA.setVolume(gainA);
    this.deckB.setVolume(gainB);
  }

  setMasterVolume(val: number) {
    this.masterGain.gain.setTargetAtTime(val, this.context.currentTime, 0.01);
  }
}
