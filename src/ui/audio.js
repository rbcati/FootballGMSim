export class AudioManager {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  playTone(freq, type, duration, startTime = 0, volume = 0.1) {
    if (!this.enabled) return;
    try {
      this.init();
      if (!this.ctx) return;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime + startTime);

      gain.gain.setValueAtTime(volume, this.ctx.currentTime + startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + startTime + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(this.ctx.currentTime + startTime);
      osc.stop(this.ctx.currentTime + startTime + duration);
    } catch (e) {
      console.warn('Audio playback failed', e);
    }
  }

  playTouchdown() {
    // Rising major arpeggio
    this.playTone(523.25, 'triangle', 0.2, 0); // C5
    this.playTone(659.25, 'triangle', 0.2, 0.1); // E5
    this.playTone(783.99, 'triangle', 0.4, 0.2); // G5
    this.playTone(1046.50, 'square', 0.6, 0.3); // C6
  }

  playFieldGoal() {
    // Short ascending
    this.playTone(440, 'sine', 0.15, 0);
    this.playTone(880, 'sine', 0.3, 0.1);
  }

  playInterception() {
    // Dissonant descending
    this.playTone(800, 'sawtooth', 0.3, 0);
    this.playTone(700, 'sawtooth', 0.4, 0.1);
  }

  playSack() {
    // Low punch
    this.playTone(150, 'square', 0.1, 0);
    this.playTone(100, 'sawtooth', 0.3, 0.05);
  }

  playWin() {
    // Fanfare
    this.playTone(523.25, 'triangle', 0.2, 0);
    this.playTone(659.25, 'triangle', 0.2, 0.15);
    this.playTone(783.99, 'triangle', 0.2, 0.3);
    this.playTone(1046.50, 'square', 1.0, 0.45);
  }

  playLoss() {
    // Sad trombone
    this.playTone(783.99, 'triangle', 0.4, 0);
    this.playTone(739.99, 'triangle', 0.4, 0.4);
    this.playTone(698.46, 'triangle', 0.4, 0.8);
    this.playTone(659.25, 'triangle', 1.0, 1.2);
  }

  playWhistle() {
    // High frequency noise burst simulated with high sine
    this.playTone(2500, 'sine', 0.1, 0, 0.05);
    this.playTone(2800, 'sine', 0.1, 0.05, 0.05);
  }
}

export const audioManager = new AudioManager();
