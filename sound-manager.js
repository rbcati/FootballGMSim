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
            this.enabled = false;
        }
    }

    resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume().catch(e => console.error(e));
        }
    }

    playTone(freq, type, duration, vol = 0.1, slideTo = null, delay = 0) {
        if (!this.enabled || this.muted || !this.ctx) return;
        setTimeout(() => {
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
        }, delay);
    }

    playNoise(duration, vol = 0.1, delay = 0) {
        if (!this.enabled || this.muted || !this.ctx) return;
        setTimeout(() => {
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
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 1000;
            noise.connect(filter);
            filter.connect(gain);
            gain.connect(this.ctx.destination);
            noise.start();
        }, delay);
    }

    playWhistle() {
        if (!this.enabled || this.muted) return;
        this.playTone(2000, 'sine', 0.1, 0.1);
        this.playTone(2000, 'sine', 0.2, 0.1, null, 150);
    }

    playCheer() {
        if (!this.enabled || this.muted) return;
        this.playNoise(2.5, 0.2);
        this.playTone(440, 'triangle', 0.4, 0.05);
        this.playTone(554, 'triangle', 0.5, 0.05, null, 150);
        this.playTone(659, 'triangle', 0.8, 0.05, null, 300);
    }

    playTouchdown() {
        if (!this.enabled || this.muted) return;
        // Crowd Roar
        this.playNoise(3.0, 0.3);

        // C Major Triad + Octave: C4, E4, G4, C5
        const notes = [261.63, 329.63, 392.00, 523.25];

        // Rapid arpeggio
        notes.forEach((freq, i) => {
            this.playTone(freq, 'triangle', 0.4, 0.15, null, i * 80);
        });

        // Power chord finish
        this.playTone(261.63, 'sawtooth', 0.8, 0.1, null, 400); // Low C
        this.playTone(523.25, 'square', 0.8, 0.1, null, 400);   // High C
        this.playNoise(1.0, 0.1, 400); // Crowd swell
    }

    playIntercept() {
        if (!this.enabled || this.muted) return;
        // Alert Siren
        this.playTone(880, 'sawtooth', 0.1, 0.1);
        setTimeout(() => this.playTone(1100, 'sawtooth', 0.1, 0.1), 100);
        setTimeout(() => this.playTone(880, 'sawtooth', 0.3, 0.1), 200);
    }

    playDefenseStop() {
        if (!this.enabled || this.muted) return;
        // Punchy "Stop" sound
        this.playTone(150, 'sawtooth', 0.2, 0.2, 50);
        this.playTone(100, 'square', 0.3, 0.1, 40);
        // Resonant hit
        this.playNoise(0.2, 0.3);
    }

    playInterception() {
        if (!this.enabled || this.muted) return;
        // Whoosh + Alarm
        this.playNoise(0.3, 0.2);
        this.playTone(800, 'sawtooth', 0.3, 0.2, 300);
        this.playTone(600, 'sawtooth', 0.3, 0.2, 300, 150);
    }

    playFumble() {
        if (!this.enabled || this.muted) return;
        // Chaotic low rumbles
        this.playTone(100, 'sawtooth', 0.1, 0.3);
        this.playTone(120, 'square', 0.1, 0.3, null, 50);
        this.playTone(80, 'sawtooth', 0.1, 0.3, null, 100);
        this.playNoise(0.3, 0.2);
    }

    playBigHit() {
        if (!this.enabled || this.muted) return;
        this.playNoise(0.3, 0.4);
        this.playTone(60, 'sawtooth', 0.3, 0.3, 20); // Deep crunch
    }

    playSack() {
        if (!this.enabled || this.muted) return;
        this.playNoise(0.4, 0.5); // Louder noise
        this.playTone(50, 'sawtooth', 0.4, 0.5, 20); // Deep crunch
        this.playTone(40, 'square', 0.2, 0.3, 10, 50); // Sub-bass
    }

    playTackle() { this.playBigHit(); }
    playHit() { this.playBigHit(); }

    playCatch() {
        if (!this.enabled || this.muted) return;
        // Thwack / Pop
        this.playTone(200, 'square', 0.05, 0.1);
        this.playNoise(0.05, 0.2);
    }

    playFirstDown() {
        if (!this.enabled || this.muted) return;
        // Rising notification
        this.playTone(600, 'sine', 0.1, 0.1);
        this.playTone(800, 'sine', 0.4, 0.1, null, 100);
    }

    playKick() {
        if (!this.enabled || this.muted) return;
        this.playTone(200, 'square', 0.15, 0.2, 50);
        this.playTone(60, 'sine', 0.2, 0.3); // Low Thud
        this.playNoise(0.1, 0.1); // Whoosh
        // Deep thud
        this.playTone(150, 'sine', 0.15, 0.3, 40);
        this.playNoise(0.1, 0.15); // Impact noise
    }

    playPing() {
        if (!this.enabled || this.muted) return;
        this.playTone(800, 'sine', 0.5, 0.05);
    }

    playFieldGoalMiss() {
        if (!this.enabled || this.muted) return;
        // Clank
        this.playTone(800, 'square', 0.2, 0.2);
        this.playTone(810, 'square', 0.1, 0.1, null, 10); // Metallic dissonance
        this.playTone(300, 'sawtooth', 0.5, 0.1, 150, 200); // Sad slide down
    }

    playFieldGoal() {
        if (!this.enabled || this.muted) return;
        // Success "Ding"
        this.playTone(1046.50, 'sine', 1.0, 0.1); // High C
        this.playTone(1318.51, 'sine', 1.5, 0.05, null, 100); // High E
        // Mini Cheer
        this.playNoise(1.5, 0.15, 200);
    }

    playScore() { this.playTouchdown(); }

    playFailure() {
        if (!this.enabled || this.muted) return;
        // Dissonant failure
        this.playTone(300, 'sawtooth', 0.5, 0.1, 100);
        this.playTone(290, 'sawtooth', 0.5, 0.1, 95, 100);
    }

    playHorns() {
        if (!this.enabled || this.muted) return;
        // Air horn simulation
        const notes = [329.63, 261.63]; // E4, C4
        notes.forEach((freq, i) => {
            this.playTone(freq, 'sawtooth', 0.8, 0.2, null, i * 400);
            this.playTone(freq * 0.99, 'sawtooth', 0.8, 0.1, null, i * 400); // Detune for horn effect
        });
    }

    playVictory() {
        if (!this.enabled || this.muted) return;
        // Victory Fanfare: C G C E G C
        const notes = [261.63, 392.00, 523.25, 659.25, 783.99, 1046.50];
        notes.forEach((freq, i) => {
            this.playTone(freq, 'square', 0.3, 0.15, null, i * 150);
        });
        // Big Chord End
        this.playTone(261.63, 'sawtooth', 2.0, 0.2, null, 1000);
        this.playTone(329.63, 'sawtooth', 2.0, 0.2, null, 1000);
        this.playTone(392.00, 'sawtooth', 2.0, 0.2, null, 1000);
        this.playNoise(3.0, 0.2, 1000);
    }

    playComboBreaker() {
        if (!this.enabled || this.muted) return;
        // Dissonant, descending sound
        this.playTone(400, 'sawtooth', 0.3, 0.15);
        this.playTone(380, 'sawtooth', 0.3, 0.15, null, 50);
        this.playTone(350, 'sawtooth', 0.5, 0.1, null, 150);
        this.playNoise(0.5, 0.2); // Crash
    }

    playMomentumShift() {
        if (!this.enabled || this.muted) return;
        // Whoosh / Rising sound
        this.playTone(200, 'sine', 0.5, 0.05, 800); // Slide from 200 to 800
        this.playNoise(0.5, 0.1, 0); // Whoosh
    }

    playBigPlay() {
        if (!this.enabled || this.muted) return;
        // Intense cheer + rising tone
        this.playNoise(1.5, 0.2);
        this.playTone(400, 'triangle', 0.5, 0.1, 800); // Rise
        this.playTone(500, 'triangle', 0.5, 0.1, 1000, 100); // Rise higher
    }

    playShockwave() {
        if (!this.enabled || this.muted) return;
        this.playTone(60, 'sawtooth', 0.5, 0.5, 20); // Deep bass drop
        this.playNoise(0.5, 0.4); // Explosion
    }

    playHeartbeat() {
        if (!this.enabled || this.muted) return;
        // Low thud-thud
        this.playTone(60, 'sine', 0.1, 0.5);
        this.playTone(50, 'sine', 0.1, 0.4, null, 150);
    }

    playCannon() {
        if (!this.enabled || this.muted) return;
        // heavy explosion
        this.playNoise(0.5, 0.8);
        this.playTone(40, 'sawtooth', 0.5, 0.5); // Bass rumble
    }

    playCrowdGasp() {
        if (!this.enabled || this.muted) return;
        this.playNoise(0.4, 0.3); // Short noise
        this.playTone(300, 'triangle', 0.3, 0.1, 200); // Downward slide
    }

    playTradeAccepted() {
        if (!this.enabled || this.muted) return;
        // Cash register / Success chime
        const notes = [523.25, 659.25, 783.99, 1046.50]; // C E G C
        notes.forEach((freq, i) => {
            this.playTone(freq, 'sine', 0.1, 0.2, null, i * 50);
        });
        this.playTone(1046.50, 'square', 0.4, 0.1, null, 200); // Ding
    }

    playDraftPick() {
        if (!this.enabled || this.muted) return;
        // Pop sound
        this.playTone(400, 'sine', 0.1, 0.2, 600); // Slide up quickly
    }

    playGemReveal() {
        if (!this.enabled || this.muted) return;
        // Sparkly Arpeggio
        const notes = [1046.50, 1318.51, 1567.98, 2093.00];
        notes.forEach((freq, i) => {
            this.playTone(freq, 'triangle', 0.3, 0.1, null, i * 80);
            this.playTone(freq * 1.5, 'sine', 0.3, 0.05, null, i * 80 + 40);
        });
        this.playNoise(1.0, 0.1); // Shimmer
    }

    playBustReveal() {
        if (!this.enabled || this.muted) return;
        // Sad trombone-ish
        this.playTone(150, 'sawtooth', 0.4, 0.2);
        this.playTone(140, 'sawtooth', 0.4, 0.2, 135, 300);
        this.playTone(130, 'sawtooth', 0.8, 0.2, 120, 600);
    }

    playGameStart() {
        if (!this.enabled || this.muted) return;
        this.playWhistle();
        this.playCheer();
    }

    playLevelUp() {
        if (!this.enabled || this.muted) return;
        // Rising arpeggio (C-E-G-C)
        const notes = [523.25, 659.25, 783.99, 1046.50];
        notes.forEach((freq, i) => {
            this.playTone(freq, 'triangle', 0.1, 0.1, null, i * 100);
        });
        this.playNoise(0.5, 0.05, 300); // Sparkle
    }

    playDenied() {
        if (!this.enabled || this.muted) return;
        // Heavy, low-frequency impact (Door slam)
        this.playTone(100, 'sawtooth', 0.1, 0.3);
        this.playTone(80, 'square', 0.2, 0.2, null, 20);
        this.playNoise(0.2, 0.4);
    }

    playMomentumMax() {
        if (!this.enabled || this.muted) return;
        // High frequency energy hum
        this.playTone(800, 'sine', 0.5, 0.05, 1200);
        this.playNoise(0.5, 0.1);
    }

    toggleMute() {
        this.muted = !this.muted;
        return this.muted;
    }

    playClick() {
        if (!this.enabled || this.muted) return;
        // Short, crisp "tick"
        this.playTone(1200, 'sine', 0.03, 0.02);
    }

    setupGlobalSounds() {
        if (typeof window === 'undefined') return;
        document.addEventListener('click', (e) => {
            // Check if user clicked something interactive
            if (e.target.closest('button, a, .nav-item, .card, .btn, .play-call-btn, .choice-btn')) {
                this.playClick();
            }
        });
    }
}

export const soundManager = new SoundManager();
if (typeof window !== 'undefined') {
    window.soundManager = soundManager;
}
export default soundManager;
