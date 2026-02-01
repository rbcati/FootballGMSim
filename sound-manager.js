class SoundManager {
    constructor() {
        this.ctx = null;
        this.muted = false;
        this.enabled = true;
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                this.ctx = new AudioContext();
            }
        } catch (e) {
            console.warn('AudioContext not supported');
        }
    }

    resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume().catch(e => console.error(e));
        }
    }

    playTone(freq, type, duration, vol = 0.1, slideTo = null) {
        if (!this.enabled || this.muted || !this.ctx) return;
        this.resume();

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        if (slideTo) {
            osc.frequency.exponentialRampToValueAtTime(slideTo, this.ctx.currentTime + duration);
        }

        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    playNoise(duration, vol = 0.1) {
        if (!this.enabled || this.muted || !this.ctx) return;
        this.resume();

        const bufferSize = this.ctx.sampleRate * duration;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

        noise.connect(gain);
        gain.connect(this.ctx.destination);

        noise.start();
    }

    playWhistle() {
        if (!this.enabled || this.muted) return;
        // Double beep pattern
        this.playTone(2000, 'sine', 0.1, 0.1);
        setTimeout(() => this.playTone(2000, 'sine', 0.2, 0.1), 150);
    }

    playCheer() {
        if (!this.enabled || this.muted) return;
        // Longer swell
        this.playNoise(2.5, 0.2);
        // Melodic swell
        this.playTone(440, 'triangle', 0.4, 0.05);
        setTimeout(() => this.playTone(554, 'triangle', 0.5, 0.05), 150);
        setTimeout(() => this.playTone(659, 'triangle', 0.8, 0.05), 300);
    }

    playTouchdown() {
        if (!this.enabled || this.muted) return;
        // C Major Triad + Octave
        const notes = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5

        notes.forEach((freq, i) => {
            setTimeout(() => this.playTone(freq, 'triangle', 0.4, 0.15), i * 100);
        });

        // Final fanfare
        setTimeout(() => this.playTone(523.25, 'square', 0.8, 0.1), 400);
    }

    playDefenseStop() {
        if (!this.enabled || this.muted) return;
        // Low Thud
        this.playTone(100, 'sawtooth', 0.3, 0.2, 50);
    }

    playBigHit() {
        if (!this.enabled || this.muted) return;
        // Sharp noise burst + low freq impact
        this.playNoise(0.2, 0.3);
        this.playTone(60, 'square', 0.3, 0.2, 20);
    }

    // Compatibility aliases
    playTackle() { this.playBigHit(); }
    playHit() { this.playBigHit(); }

    playKick() {
        if (!this.enabled || this.muted) return;
        this.playTone(200, 'square', 0.1, 0.2, 50);
    }

    playPing() {
        if (!this.enabled || this.muted) return;
        this.playTone(800, 'sine', 0.5, 0.05);
    }

    playScore() { this.playTouchdown(); }

    playFailure() {
        if (!this.enabled || this.muted) return;
        // Dissonant tones
        this.playTone(300, 'sawtooth', 0.5, 0.1, 100);
        this.playTone(290, 'sawtooth', 0.5, 0.1, 95);
    }

    playHorns() {
        if (!this.enabled || this.muted) return;
        // Victory Horns
        const notes = [261.63, 329.63, 392.00]; // C, E, G
        notes.forEach((freq, i) => {
            setTimeout(() => this.playTone(freq, 'sawtooth', 0.6, 0.15), i * 200);
        });
    }

    toggleMute() {
        this.muted = !this.muted;
        return this.muted;
    }
}

export const soundManager = new SoundManager();
// Ensure global availability for debugging/scripts
if (typeof window !== 'undefined') {
    window.soundManager = soundManager;
}
export default soundManager;
