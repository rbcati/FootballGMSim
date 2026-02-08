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
        this.animating = false;
        this.animationId = null;

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
    }

    resize() {
        if (!this.container) return;
        this.canvas.width = this.container.offsetWidth;
        this.canvas.height = this.container.offsetHeight;
    }

    spawnParticles(xPct, type) {
        const x = (xPct / 100) * this.canvas.width;
        const y = this.canvas.height / 2; // Middle of field mostly

        const count = type === 'touchdown' ? 120 : // Increased for impact
                      type === 'sack' ? 40 :
                      type === 'kick' ? 15 :
                      type === 'catch' ? 15 :
                      type === 'first_down' ? 30 :
                      type === 'field_goal' ? 60 :
                      type === 'defense_stop' ? 50 :
                      type === 'interception' ? 60 :
                      type === 'fumble' ? 40 :
                      type === 'big_play' ? 80 : 25;

        for (let i = 0; i < count; i++) {
            this.particles.push(this.createParticle(x, y, type));
        }

        if (!this.animating) {
            this.animating = true;
            this.animate();
        }
    }

    createParticle(x, y, type) {
        const p = {
            x: x,
            y: y,
            vx: ((window.Utils?.random || Math.random)() - 0.5) * 4,
            vy: ((window.Utils?.random || Math.random)() - 0.5) * 4,
            life: 1.0,
            decay: (window.Utils?.random || Math.random)() * 0.02 + 0.01,
            size: (window.Utils?.random || Math.random)() * 3 + 1,
            color: '#fff',
            gravity: 0,
            friction: 0.96, // Add friction for drag
            type: type
        };

        if (type === 'touchdown') {
            p.x += ((window.Utils?.random || Math.random)() - 0.5) * 40;
            p.y += ((window.Utils?.random || Math.random)() - 0.5) * 20;
            p.vx = ((window.Utils?.random || Math.random)() - 0.5) * 15; // Higher velocity
            p.vy = ((window.Utils?.random || Math.random)() * -10) - 5;
            p.color = (window.Utils?.random || Math.random)() > 0.3 ? '#FFD700' : ((window.Utils?.random || Math.random)() > 0.5 ? '#FFFFFF' : '#FFA500');
            p.gravity = 0.25;
            p.life = 1.8;
            p.size = (window.Utils?.random || Math.random)() * 6 + 2;
        } else if (type === 'big_play') {
            p.x += ((window.Utils?.random || Math.random)() - 0.5) * 30;
            p.y += ((window.Utils?.random || Math.random)() - 0.5) * 30;
            p.vx = ((window.Utils?.random || Math.random)() - 0.5) * 12;
            p.vy = ((window.Utils?.random || Math.random)() - 0.5) * 12;
            p.color = (window.Utils?.random || Math.random)() > 0.5 ? '#0A84FF' : '#FFD700'; // Blue/Gold
            p.life = 1.5;
            p.decay = 0.02;
            p.size = (window.Utils?.random || Math.random)() * 5 + 2;
            p.friction = 0.94; // Slows down
        } else if (type === 'field_goal') {
            p.vx = ((window.Utils?.random || Math.random)() - 0.5) * 6;
            p.vy = ((window.Utils?.random || Math.random)() * -8) - 3;
            p.color = (window.Utils?.random || Math.random)() > 0.5 ? '#FFD700' : '#FFFFE0';
            p.life = 1.5;
            p.decay = 0.015;
            p.size = (window.Utils?.random || Math.random)() * 3 + 1;
            p.gravity = 0.05; // Fall slowly
        } else if (type === 'sack') {
            p.x += ((window.Utils?.random || Math.random)() - 0.5) * 20;
            p.y += ((window.Utils?.random || Math.random)() - 0.5) * 10;
            p.vx = ((window.Utils?.random || Math.random)() - 0.5) * 8;
            p.vy = ((window.Utils?.random || Math.random)() * -5); // Up slightly
            p.color = '#888';
            p.decay = 0.04;
            p.gravity = 0.1;
        } else if (type === 'tackle') {
            p.color = '#fff';
            p.decay = 0.05;
            p.vx *= 0.5; p.vy *= 0.5; // Small puff
        } else if (type === 'kick') {
            p.vx = ((window.Utils?.random || Math.random)() - 0.5) * 10;
            p.vy = ((window.Utils?.random || Math.random)() - 0.5) * 10;
            p.color = '#fff';
            p.decay = 0.08;
            p.size = (window.Utils?.random || Math.random)() * 4 + 2;
        } else if (type === 'catch') {
            p.vx = ((window.Utils?.random || Math.random)() - 0.5) * 5;
            p.vy = ((window.Utils?.random || Math.random)() - 0.5) * 5;
            p.color = this.getThemeColor('--accent', '#87CEEB');
            p.decay = 0.08;
            p.size = (window.Utils?.random || Math.random)() * 3 + 1;
        } else if (type === 'first_down') {
            p.x = x + ((window.Utils?.random || Math.random)() - 0.5) * 10;
            p.y = (window.Utils?.random || Math.random)() * this.canvas.height;
            p.vx = 0;
            p.vy = ((window.Utils?.random || Math.random)() - 0.5) * 1; // Float
            p.color = '#FFD700';
            p.life = 1.0;
            p.decay = 0.01;
            p.size = Math.random() * 3 + 1;
        } else if (type === 'interception') {
            p.vx = ((window.Utils?.random || Math.random)() - 0.5) * 15;
            p.vy = ((window.Utils?.random || Math.random)() - 0.5) * 15;
            p.color = this.getThemeColor('--danger', '#FF453A');
            p.decay = 0.04;
            p.size = (window.Utils?.random || Math.random)() * 4 + 2;
            p.friction = 0.92;
        } else if (type === 'fumble') {
            p.vx = ((window.Utils?.random || Math.random)() - 0.5) * 8;
            p.vy = ((window.Utils?.random || Math.random)() * -5) - 2;
            p.color = '#D2691E'; // Brown
            p.decay = 0.03;
            p.gravity = 0.35; // Heavy
            p.size = (window.Utils?.random || Math.random)() * 5 + 1;
            p.friction = 0.98; // Bouncy?
        } else if (type === 'defense_stop') {
            p.vx = ((window.Utils?.random || Math.random)() - 0.5) * 20;
            p.vy = ((window.Utils?.random || Math.random)() - 0.5) * 20;
            p.color = (window.Utils?.random || Math.random)() > 0.6 ? this.getThemeColor('--danger', '#FF453A') : '#FFFFFF';
            p.decay = 0.06;
            p.size = (window.Utils?.random || Math.random)() * 5 + 2;
            p.friction = 0.9; // Fast stop
        }

        return p;
    }

    animate() {
        if (this.particles.length === 0) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.animating = false;
            return;
        }

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.life -= p.decay;

            if (p.life <= 0) {
                this.particles.splice(i, 1);
                continue;
            }

            // Apply Physics
            if (p.friction) {
                p.vx *= p.friction;
                p.vy *= p.friction;
            }

            p.x += p.vx;
            p.y += p.vy;

            if (p.gravity) p.vy += p.gravity;

            // Bounce off bottom (ground)
            if (p.y > this.canvas.height && p.gravity > 0) {
                p.y = this.canvas.height;
                p.vy *= -0.6; // Bounce with dampening
            }

            this.ctx.globalAlpha = p.life;
            this.ctx.fillStyle = p.color;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            this.ctx.fill();
        }

        this.ctx.globalAlpha = 1;
        this.animationId = requestAnimationFrame(() => this.animate());
    }
}
