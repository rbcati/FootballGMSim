// src/ui/audio/SoundManager.js
export class SoundManager {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  init() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();
    }
  }

  playTone(freq, type, duration) {
    if (this.muted || !this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.frequency.value = freq;
    osc.type = type;
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.00001, this.ctx.currentTime + duration);
    osc.stop(this.ctx.currentTime + duration);
  }

  playWhistle() {
    this.init();
    if (this.muted) return;
    // High-pitched sine wave
    this.playTone(1500, 'sine', 0.1);
    setTimeout(() => this.playTone(1500, 'sine', 0.1), 150);
  }

  playCheer() {
    this.init();
    if (this.muted) return;
    // White noise burst simulates a crowd roar (simplified)
    const bufferSize = this.ctx.sampleRate * 2; // 2 seconds
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 1.5);
    noise.connect(gain);
    gain.connect(this.ctx.destination);
    noise.start();
  }

  playThud() {
    this.init();
    if (this.muted) return;
    this.playTone(100, 'triangle', 0.15);
  }

  playScore() {
    this.init();
    if (this.muted) return;
    // Ascending arpeggio
    this.playTone(440, 'sine', 0.1);
    setTimeout(() => this.playTone(554, 'sine', 0.1), 100);
    setTimeout(() => this.playTone(659, 'sine', 0.4), 200);
  }
}

export const soundManager = new SoundManager();
