class SoundManager {
    constructor() {
        this.ctx = null;
        this.muted = false;
        // Try to init immediately, but it might be suspended until interaction
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.warn('AudioContext not supported');
        }
    }

    resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume().catch(e => console.error(e));
        }
    }

    // Generic tone generator
    playTone(freq, type, duration, vol = 0.1, slideTo = null) {
        if (!this.enabled || this.muted || !this.ctx) return;
            this.ctx.resume();
        }
    }

    playWhistle() {
        if (this.muted || !this.ctx) return;
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

    // Generic noise generator (for tackles, crowd)
    playNoise(duration, vol = 0.1) {
        if (!this.enabled || this.muted || !this.ctx) return;
        this.resume();

        const bufferSize = this.ctx.sampleRate * duration;
        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.type = 'sine';
        osc.frequency.setValueAtTime(2500, this.ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(1500, this.ctx.currentTime + 0.1);

        gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.3);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.3);
    }

    playCheer() {
        if (this.muted || !this.ctx) return;
        this.resume();

        // Simple noise approximation
        const bufferSize = this.ctx.sampleRate * 2; // 2 seconds
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

        // Lowpass filter to make it sound more like a thud/rumble
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 1000;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 2);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);

        noise.start();
    }

    playWhistle() {
        // High pitched sine, short burst
        if (!this.enabled || this.muted) return;
        // Trill effect
        this.playTone(2000, 'sine', 0.1, 0.1);
        setTimeout(() => this.playTone(2200, 'sine', 0.1, 0.1), 50);
        setTimeout(() => this.playTone(2000, 'sine', 0.2, 0.05), 100);
    }

    playCheer() {
        // Simulated crowd cheer (pink noise fade out)
        if (!this.enabled || this.muted) return;
        this.playNoise(1.5, 0.15); // Long noise
        // Add some melodic major triad for "success"
        this.playTone(440, 'triangle', 0.4, 0.05); // A4
        setTimeout(() => this.playTone(554, 'triangle', 0.4, 0.05), 100); // C#5
        setTimeout(() => this.playTone(659, 'triangle', 0.6, 0.05), 200); // E5
    }

    playTackle() {
        // Short low frequency noise
        this.playNoise(0.3, 0.2);
    }

    playPing() {
        // High ping for kicks
        this.playTone(800, 'sine', 0.5, 0.05);
    }

    playHorns() {
        // Victory Horns
         if (!this.enabled || this.muted) return;
         const now = this.ctx.currentTime;

         // Helper for brassy sound
         const playBrass = (freq, start, dur) => {
             const osc = this.ctx.createOscillator();
             const gain = this.ctx.createGain();
             osc.type = 'sawtooth';
             osc.frequency.value = freq;
             gain.gain.setValueAtTime(0, start);
             gain.gain.linearRampToValueAtTime(0.1, start + 0.1);
             gain.gain.linearRampToValueAtTime(0, start + dur);

             // Lowpass filter envelope
             const filter = this.ctx.createBiquadFilter();
             filter.type = 'lowpass';
             filter.frequency.setValueAtTime(500, start);
             filter.frequency.linearRampToValueAtTime(3000, start + 0.1);
             filter.frequency.linearRampToValueAtTime(500, start + dur);

             osc.connect(filter);
             filter.connect(gain);
             gain.connect(this.ctx.destination);
             osc.start(start);
             osc.stop(start + dur);
         };

         playBrass(261.63, now, 0.4); // C4
         playBrass(329.63, now + 0.4, 0.4); // E4
         playBrass(392.00, now + 0.8, 0.8); // G4
    playHit() {
        if (this.muted || !this.ctx) return;
        this.resume();

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(40, this.ctx.currentTime + 0.2);

        gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.2);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.2);
    }

    playKick() {
        if (this.muted || !this.ctx) return;
        this.resume();

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.type = 'square';
        osc.frequency.setValueAtTime(200, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(50, this.ctx.currentTime + 0.1);

        gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.1);
    }

    playScore() {
        if (this.muted || !this.ctx) return;
        this.resume();

        const notes = [523.25, 659.25, 783.99, 1046.50]; // C Major
        const now = this.ctx.currentTime;

        notes.forEach((freq, i) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.type = 'triangle';
            osc.frequency.value = freq;

            gain.gain.setValueAtTime(0.1, now + i * 0.1);
            gain.gain.linearRampToValueAtTime(0, now + i * 0.1 + 0.3);

            osc.start(now + i * 0.1);
            osc.stop(now + i * 0.1 + 0.3);
        });
    }

    playFailure() {
        if (this.muted || !this.ctx) return;
        this.resume();

        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(this.ctx.destination);

        osc1.type = 'sawtooth';
        osc1.frequency.setValueAtTime(300, this.ctx.currentTime);
        osc1.frequency.linearRampToValueAtTime(100, this.ctx.currentTime + 0.5);

        osc2.type = 'sawtooth';
        osc2.frequency.setValueAtTime(290, this.ctx.currentTime); // Dissonance
        osc2.frequency.linearRampToValueAtTime(95, this.ctx.currentTime + 0.5);

        gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.5);

        osc1.start();
        osc2.start();
        osc1.stop(this.ctx.currentTime + 0.5);
        osc2.stop(this.ctx.currentTime + 0.5);
    }

    toggleMute() {
        this.muted = !this.muted;
        return this.muted;
    }
}

export const soundManager = new SoundManager();
const soundManager = new SoundManager();
export default soundManager;
