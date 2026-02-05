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

        this.resize();
        this._resizeHandler = () => this.resize();
        window.addEventListener('resize', this._resizeHandler);
    }

    destroy() {
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

        const count = type === 'touchdown' ? 80 : // Increased from 50
                      type === 'sack' ? 30 :
                      type === 'kick' ? 15 :
                      type === 'catch' ? 10 :
                      type === 'first_down' ? 20 :
                      type === 'field_goal' ? 40 :
                      type === 'defense_stop' ? 45 : 25;

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
            vx: (Math.random() - 0.5) * 4,
            vy: (Math.random() - 0.5) * 4,
            life: 1.0,
            decay: Math.random() * 0.02 + 0.01,
            size: Math.random() * 3 + 1,
            color: '#fff',
            type: type
        };

        if (type === 'touchdown') {
            p.vx = (Math.random() - 0.5) * 12; // Increased spread
            p.vy = (Math.random() * -8) - 4; // Higher burst upwards
            p.color = Math.random() > 0.3 ? '#FFD700' : (Math.random() > 0.5 ? '#FFFFFF' : '#FFA500'); // Gold, White, Orange
            p.gravity = 0.2;
            p.life = 1.5;
            p.size = Math.random() * 5 + 2;
        } else if (type === 'field_goal') {
            // Rising sparkles
            p.vx = (Math.random() - 0.5) * 5;
            p.vy = (Math.random() * -6) - 2; // Up
            p.color = Math.random() > 0.5 ? '#FFD700' : '#FFFFE0'; // Gold / Light Yellow
            p.life = 1.5;
            p.decay = 0.015;
            p.size = Math.random() * 3 + 1;
            p.gravity = -0.05; // Slight float up
        } else if (type === 'sack') {
            p.vx = (Math.random() - 0.5) * 6;
            p.vy = (Math.random() - 0.5) * 6;
            p.color = '#888'; // Dust
            p.decay = 0.05; // Fast fade
        } else if (type === 'tackle') {
            p.color = '#fff';
            p.decay = 0.03;
        } else if (type === 'kick') {
            p.vx = (Math.random() - 0.5) * 8; // Fast burst
            p.vy = (Math.random() - 0.5) * 8;
            p.color = '#fff';
            p.decay = 0.08; // Very fast fade
            p.size = Math.random() * 4 + 2;
        } else if (type === 'catch') {
            p.vx = (Math.random() - 0.5) * 3;
            p.vy = (Math.random() - 0.5) * 3;
            p.color = '#87CEEB'; // Sky Blue
            p.decay = 0.1;
            p.size = Math.random() * 2 + 1;
        } else if (type === 'first_down') {
            p.x = x + (Math.random() - 0.5) * 5; // Vertical stripish
            p.y = Math.random() * this.canvas.height;
            p.vx = 0;
            p.vy = (Math.random() - 0.5) * 2;
            p.color = '#FFD700'; // Yellow
            p.life = 0.8;
            p.decay = 0.02;
            p.size = Math.random() * 2 + 1;
        } else if (type === 'defense_stop') {
            p.vx = (Math.random() - 0.5) * 15; // Fast explosion
            p.vy = (Math.random() - 0.5) * 15;
            p.color = Math.random() > 0.6 ? '#FF453A' : '#FFFFFF'; // Red/White
            p.decay = 0.05; // Fast fade
            p.size = Math.random() * 4 + 2;
            p.gravity = 0.05;
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

            p.x += p.vx;
            p.y += p.vy;

            if (p.gravity) p.vy += p.gravity;

            this.ctx.globalAlpha = p.life;
            this.ctx.fillStyle = p.color;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            this.ctx.fill();
        }

        this.ctx.globalAlpha = 1;
        requestAnimationFrame(() => this.animate());
    }
}
