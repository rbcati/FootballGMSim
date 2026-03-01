// field-effects.js - Particle system for field events

export class FieldEffects {
    constructor(container) {
        if (!container) return;
        this.container = container;
        this.canvas = document.createElement('canvas');
        this.canvas.style.position = 'absolute';
        this.canvas.style.top = '0';
        this.canvas.style.left = '0';
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.canvas.style.pointerEvents = 'none';
        this.canvas.style.zIndex = '20'; // Above ball/markers
        this.container.appendChild(this.canvas);

        this.ctx = this.canvas.getContext('2d');
        this.particles = [];
        this.weatherParticles = [];
        this.animating = false;
        this.animationId = null;
        this.weatherType = null; // 'rain', 'snow', 'clear'

        this.resize();
        this._resizeHandler = () => this.resize();
        window.addEventListener('resize', this._resizeHandler);
    }

    getThemeColor(varName, fallback) {
        if (typeof window === 'undefined') return fallback;
        try {
            const val = getComputedStyle(document.body).getPropertyValue(varName).trim();
            return val || fallback;
        } catch (e) {
            return fallback;
        }
    }

    destroy() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        if (this._resizeHandler) {
            window.removeEventListener('resize', this._resizeHandler);
            this._resizeHandler = null;
        }
        if (this.canvas && this.canvas.parentNode) {
            this.canvas.parentNode.removeChild(this.canvas);
        }
        this.animating = false;
        this.particles = [];
        this.weatherParticles = [];
        this.weatherType = null;
    }

    resize() {
        if (!this.container) return;
        this.canvas.width = this.container.offsetWidth;
        this.canvas.height = this.container.offsetHeight;
    }

    startWeather(type) {
        if (type === 'clear' || !type) {
            this.clearWeather();
            return;
        }
        this.weatherType = type;
        if (!this.animating) {
            this.animating = true;
            this.animate();
        }
    }

    clearWeather() {
        this.weatherType = null;
        this.weatherParticles = [];
        // Don't stop animation if regular particles exist
        if (this.particles.length === 0) {
            this.animating = false;
            if (this.animationId) {
                cancelAnimationFrame(this.animationId);
                this.animationId = null;
                this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            }
        }
    }

    createRainParticle() {
        const rand = window.Utils?.random || Math.random;
        return {
            x: rand() * this.canvas.width,
            y: -20, // Start above
            vx: -2 + rand(), // Slight wind to left
            vy: 15 + rand() * 10, // Fast
            life: 1,
            type: 'rain',
            length: 15 + rand() * 10,
            color: 'rgba(174, 194, 224, 0.6)'
        };
    }

    createSnowParticle() {
        const rand = window.Utils?.random || Math.random;
        return {
            x: rand() * this.canvas.width,
            y: -10,
            vx: Math.sin(rand() * Math.PI * 2) * 1, // Drift
            vy: 2 + rand() * 3, // Slow
            life: 1,
            type: 'snow',
            size: 2 + rand() * 2,
            color: 'rgba(255, 255, 255, 0.8)',
            oscillation: rand() * Math.PI * 2
        };
    }

    spawnParticles(xPct, type) {
        const x = (xPct / 100) * this.canvas.width;
        const y = this.canvas.height / 2; // Middle of field mostly

        const count = type === 'touchdown' ? 100 : // Increased from 80
                      type === 'sack' ? 30 :
                      type === 'kick' ? 15 :
                      type === 'kick_flash' ? 40 :
                      type === 'catch' ? 25 :
                      type === 'first_down' ? 20 :
                      type === 'field_goal' ? 40 :
                      type === 'defense_stop' ? 45 :
                      type === 'interception' ? 50 :
                      type === 'fumble' ? 35 :
                      type === 'shockwave' ? 3 :
                      type === 'spiral' ? 40 :
                      type === 'fire' ? 30 :
                      type === 'trail' ? 3 :
                      type === 'shield' ? 40 :
                      type === 'big_play' ? 60 : 25;

        for (let i = 0; i < count; i++) {
            this.particles.push(this.createParticle(x, y, type));
        }

        if (!this.animating) {
            this.animating = true;
            this.animate();
        }
    }

    createParticle(x, y, type) {
        const rand = window.Utils?.random || Math.random;
        const p = {
            x: x,
            y: y,
            vx: (rand() - 0.5) * 4,
            vy: (rand() - 0.5) * 4,
            life: 1.0,
            decay: rand() * 0.02 + 0.01,
            size: rand() * 3 + 1,
            color: '#fff',
            gravity: 0,
            type: type
        };

        if (type === 'touchdown') {
            p.x += (rand() - 0.5) * 40; // Spread X
            p.y += (rand() - 0.5) * 20; // Spread Y
            p.vx = (rand() - 0.5) * 12; // Increased spread
            p.vy = (rand() * -8) - 4; // Higher burst upwards
            p.color = rand() > 0.3 ? '#FFD700' : (rand() > 0.5 ? '#FFFFFF' : '#FFA500'); // Gold, White, Orange
            p.gravity = 0.2;
            p.life = 1.5;
            p.size = rand() * 5 + 2;
        } else if (type === 'big_play') {
            p.x += (rand() - 0.5) * 30;
            p.y += (rand() - 0.5) * 30;
            p.vx = (rand() - 0.5) * 10;
            p.vy = (rand() - 0.5) * 10;
            p.color = rand() > 0.5 ? '#0A84FF' : '#FFD700'; // Blue/Gold
            p.life = 1.2;
            p.decay = 0.03;
            p.size = rand() * 4 + 2;
        } else if (type === 'field_goal') {
            // Rising sparkles
            p.vx = (rand() - 0.5) * 5;
            p.vy = (rand() * -6) - 2; // Up
            p.color = rand() > 0.5 ? '#FFD700' : '#FFFFE0'; // Gold / Light Yellow
            p.life = 1.5;
            p.decay = 0.015;
            p.size = rand() * 3 + 1;
            p.gravity = -0.05; // Slight float up
        } else if (type === 'sack') {
            p.x += (rand() - 0.5) * 15;
            p.y += (rand() - 0.5) * 15;
            p.vx = (rand() - 0.5) * 6;
            p.vy = (rand() - 0.5) * 6;
            p.color = '#888'; // Dust
            p.decay = 0.05; // Fast fade
        } else if (type === 'tackle') {
            // Dirt/Grass clods
            p.vx = (rand() - 0.5) * 6;
            p.vy = (rand() * -6) - 2; // Upward spray
            const colors = ['#fff', '#8B4513', '#A0522D', '#D2B48C']; // White, SaddleBrown, Sienna, Tan
            p.color = colors[Math.floor(rand() * colors.length)];
            p.decay = 0.04;
            p.size = rand() * 3 + 1;
            p.gravity = 0.2;
        } else if (type === 'kick') {
            p.vx = (rand() - 0.5) * 8; // Fast burst
            p.vy = (rand() - 0.5) * 8;
            p.color = '#fff';
            p.decay = 0.08; // Very fast fade
            p.size = rand() * 4 + 2;
        } else if (type === 'kick_flash') {
            // Explosive burst
            const angle = rand() * Math.PI * 2;
            const speed = rand() * 15 + 5;
            p.vx = Math.cos(angle) * speed;
            p.vy = Math.sin(angle) * speed;
            p.color = rand() > 0.5 ? '#fff' : '#ffffaa';
            p.decay = 0.15; // Extremely fast fade
            p.size = rand() * 5 + 3;
        } else if (type === 'catch') {
            // Ring / Sparkle
            const angle = rand() * Math.PI * 2;
            const speed = rand() * 6 + 2;
            p.vx = Math.cos(angle) * speed;
            p.vy = Math.sin(angle) * speed;
            p.color = this.getThemeColor('--accent', '#87CEEB'); // Sky Blue
            p.decay = 0.06;
            p.size = rand() * 2.5 + 1;
        } else if (type === 'first_down') {
            p.x = x + (rand() - 0.5) * 5; // Vertical stripish
            p.y = rand() * this.canvas.height;
            p.vx = 0;
            p.vy = (rand() - 0.5) * 2;
            p.color = '#FFD700'; // Yellow
            p.life = 0.8;
            p.decay = 0.02;
            p.size = Math.random() * 2 + 1;
        } else if (type === 'interception') {
            p.vx = (rand() - 0.5) * 12; // Fast Burst
            p.vy = (rand() - 0.5) * 12;
            p.color = '#FF453A'; // Red
            p.decay = 0.06;
            p.size = rand() * 4 + 2;
        } else if (type === 'fumble') {
            p.vx = (rand() - 0.5) * 8;
            p.vy = (rand() - 0.5) * 8;
            p.color = '#8B4513'; // Brown (Ball color)
            p.decay = 0.05;
            p.gravity = 0.3; // Drops to ground
            p.size = rand() * 3 + 1;
        } else if (type === 'defense_stop') {
            p.vx = (rand() - 0.5) * 15; // Fast explosion
            p.vy = (rand() - 0.5) * 15;
            p.color = rand() > 0.6 ? this.getThemeColor('--danger', '#FF453A') : '#FFFFFF'; // Red/White
            p.decay = 0.05; // Fast fade
            p.size = rand() * 4 + 2;
            p.gravity = 0.05;
        } else if (type === 'shockwave') {
             // Expanding ring effect
             p.vx = 0;
             p.vy = 0;
             p.color = 'rgba(255, 255, 255, 0.8)';
             p.decay = 0.02;
             p.size = 1; // Start small
             p.maxSize = 100 + Math.random() * 50; // Grow large
             p.growthRate = 5;
             p.lineWidth = 3;
        } else if (type === 'spiral') {
             const angle = (Math.random() * Math.PI * 2);
             const speed = Math.random() * 5 + 2;
             p.vx = Math.cos(angle) * speed;
             p.vy = Math.sin(angle) * speed;
             p.color = this.getThemeColor('--accent', '#007bff');
             p.decay = 0.02;
             p.size = Math.random() * 3 + 1;
             p.spiralAngle = 0; // Custom prop
        } else if (type === 'fire') {
             // Spawn mostly center-ish but spread
             p.x = x + (Math.random() - 0.5) * 100;
             p.y = this.canvas.height; // Bottom
             p.vx = (Math.random() - 0.5) * 2;
             p.vy = -(Math.random() * 5 + 2); // Up
             // Use gradient colors
             const colors = ['#FF0000', '#FF4500', '#FF8C00', '#FFD700', '#FFFF00'];
             p.color = colors[Math.floor(Math.random() * colors.length)];
             p.decay = 0.015;
             p.size = Math.random() * 6 + 3;
        } else if (type === 'trail') {
             p.color = 'rgba(255, 255, 255, 0.5)';
             p.size = (Math.random() * 3) + 1;
             p.life = 0.4;
             p.decay = 0.1;
             p.vx = (Math.random() - 0.5) * 0.5;
             p.vy = (Math.random() - 0.5) * 0.5;
        } else if (type === 'shield') {
             const angle = Math.random() * Math.PI * 2;
             const speed = Math.random() * 4 + 1;
             p.vx = Math.cos(angle) * speed;
             p.vy = Math.sin(angle) * speed;
             p.color = this.getThemeColor('--accent', '#007bff');
             p.decay = 0.05;
             p.size = Math.random() * 4 + 2;
             p.life = 0.8;
        }

        return p;
    }

    animate() {
        if (this.particles.length === 0 && this.weatherParticles.length === 0 && !this.weatherType) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.animating = false;
            return;
        }

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Spawn Weather Particles
        if (this.weatherType) {
            const density = this.weatherType === 'rain' ? 3 : 1; // Rain falls faster/more
            for(let i=0; i<density; i++) {
                if (this.weatherType === 'rain') this.weatherParticles.push(this.createRainParticle());
                if (this.weatherType === 'snow') this.weatherParticles.push(this.createSnowParticle());
            }
        }

        // Process Weather Particles
        for (let i = this.weatherParticles.length - 1; i >= 0; i--) {
            const p = this.weatherParticles[i];
            p.x += p.vx;
            p.y += p.vy;

            if (p.type === 'snow') {
                p.oscillation += 0.05;
                p.x += Math.sin(p.oscillation) * 0.5;
            }

            if (p.y > this.canvas.height) {
                this.weatherParticles.splice(i, 1);
                continue;
            }

            this.ctx.fillStyle = p.color;
            if (p.type === 'rain') {
                this.ctx.fillRect(p.x, p.y, 1, p.length);
            } else {
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                this.ctx.fill();
            }
        }

        // Process Regular Particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.life -= p.decay;

            if (p.life <= 0) {
                this.particles.splice(i, 1);
                continue;
            }

            if (p.type === 'spiral') {
                p.spiralAngle = (p.spiralAngle || 0) + 0.2;
                p.x += p.vx + Math.cos(p.spiralAngle) * 2;
                p.y += p.vy + Math.sin(p.spiralAngle) * 2;
            } else {
                p.x += p.vx;
                p.y += p.vy;
            }

            if (p.gravity) p.vy += p.gravity;
            if (p.type === 'fire') {
                p.vx += (Math.random() - 0.5) * 0.5; // Wobble
            }
            if (p.type === 'shockwave') {
                p.size += p.growthRate;
                p.lineWidth = Math.max(0.1, p.lineWidth - 0.05);
            }

            this.ctx.globalAlpha = p.life;

            if (p.type === 'shockwave') {
                this.ctx.strokeStyle = p.color;
                this.ctx.lineWidth = p.lineWidth;
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                this.ctx.stroke();
            } else {
                this.ctx.fillStyle = p.color;
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                this.ctx.fill();
            }
        }

        this.ctx.globalAlpha = 1;
        this.animationId = requestAnimationFrame(() => this.animate());
    }
}
