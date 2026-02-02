class SoundManager {
    constructor() {
        this.ctx = null;
        this.muted = false;
        this.enabled = true;
        // Try to init immediately, but it might be suspended until interaction
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
        // Lowpass filter to make it sound more like a thud/rumble
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 1000;

        noise.connect(filter);
        filter.connect(gain);
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

    playHorns() {
        // Victory Horns
         if (!this.enabled || this.muted || !this.ctx) return;
         this.resume();
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
    }

    playHit() {
        this.playBigHit();
    }

    playDefenseStop() {
        if (!this.enabled || this.muted) return;
        // Low Thud
        this.playTone(100, 'sawtooth', 0.3, 0.2, 50);
    }

    playKick() {
        if (!this.enabled || this.muted) return;
        this.playTone(200, 'square', 0.1, 0.2, 50);
    }

    playBigHit() {
        if (!this.enabled || this.muted) return;
        // Sharp noise burst + low freq impact
        this.playNoise(0.2, 0.3);
        this.playTone(60, 'square', 0.3, 0.2, 20);
    }

    // Compatibility aliases
    playTackle() { this.playBigHit(); }

    playPing() {
        if (!this.enabled || this.muted) return;
        this.playTone(800, 'sine', 0.5, 0.05);
    }

    playScore() { this.playTouchdown(); }

    playFailure() {
        if (!this.enabled || this.muted || !this.ctx) return;
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
// Ensure global availability for debugging/scripts
if (typeof window !== 'undefined') {
    window.soundManager = soundManager;
}
export default soundManager;
