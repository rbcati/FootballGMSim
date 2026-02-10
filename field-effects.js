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

        const count = type === 'touchdown' ? 100 : // Increased for confetti
                      type === 'sack' ? 40 :
                      type === 'kick' ? 15 :
                      type === 'catch' ? 10 :
                      type === 'first_down' ? 20 :
                      type === 'field_goal' ? 50 :
                      type === 'defense_stop' ? 50 :
                      type === 'interception' ? 60 :
                      type === 'fumble' ? 40 :
                      type === 'big_play' ? 60 :
                      type === 'shockwave' ? 1 : 25;

        for (let i = 0; i < count; i++) {
            this.particles.push(this.createParticle(x, y, type));
        }

        if (type === 'sack' || type === 'big_play' || type === 'defense_stop') {
             // Add a shockwave for impact events
             this.particles.push(this.createParticle(x, y, 'shockwave'));
        }

        if (!this.animating) {
            this.animating = true;
            this.animate();
        }
    }

    createParticle(x, y, type) {
        const random = window.Utils?.random || Math.random;
        const p = {
            x: x,
            y: y,
            vx: (random() - 0.5) * 4,
            vy: (random() - 0.5) * 4,
            life: 1.0,
            decay: random() * 0.02 + 0.01,
            size: random() * 3 + 1,
            color: '#fff',
            gravity: 0,
            type: type,
            shape: 'circle', // circle, rect, ring
            rotation: 0,
            vRot: 0
        };

        if (type === 'touchdown') {
            p.x += (random() - 0.5) * 40;
            p.y += (random() - 0.5) * 20;
            p.vx = (random() - 0.5) * 12;
            p.vy = (random() * -8) - 4; // Higher burst upwards
            p.color = random() > 0.3 ? '#FFD700' : (random() > 0.5 ? '#FFFFFF' : '#FFA500');
            p.gravity = 0.2;
            p.life = 2.0;
            p.size = random() * 6 + 3;
            p.shape = 'rect'; // Confetti
            p.rotation = random() * 360;
            p.vRot = (random() - 0.5) * 10;
        } else if (type === 'big_play') {
            p.x += (random() - 0.5) * 30;
            p.y += (random() - 0.5) * 30;
            p.vx = (random() - 0.5) * 10;
            p.vy = (random() - 0.5) * 10;
            p.color = random() > 0.5 ? '#0A84FF' : '#FFD700';
            p.life = 1.2;
            p.decay = 0.03;
            p.size = random() * 4 + 2;
        } else if (type === 'field_goal') {
            p.vx = (random() - 0.5) * 5;
            p.vy = (random() * -6) - 2;
            p.color = random() > 0.5 ? '#FFD700' : '#FFFFE0';
            p.life = 1.5;
            p.decay = 0.015;
            p.size = random() * 3 + 1;
            p.gravity = -0.05;
        } else if (type === 'sack') {
            p.x += (random() - 0.5) * 15;
            p.y += (random() - 0.5) * 15;
            p.vx = (random() - 0.5) * 6;
            p.vy = (random() - 0.5) * 6;
            p.color = '#888'; // Dust
            p.decay = 0.05;
            p.size = random() * 5 + 2;
        } else if (type === 'kick_trail') { // Added specific handling for trail
            p.life = 0.5;
            p.decay = 0.1;
            p.vx = 0;
            p.vy = 0;
            p.size = 2;
            p.color = 'rgba(255, 255, 255, 0.5)';
        } else if (type === 'kick') {
            p.vx = (random() - 0.5) * 8;
            p.vy = (random() - 0.5) * 8;
            p.color = '#fff';
            p.decay = 0.08;
            p.size = random() * 4 + 2;
        } else if (type === 'catch') {
            p.vx = (random() - 0.5) * 3;
            p.vy = (random() - 0.5) * 3;
            p.color = this.getThemeColor('--accent', '#87CEEB');
            p.decay = 0.1;
            p.size = random() * 2 + 1;
        } else if (type === 'first_down') {
            p.x = x + (random() - 0.5) * 5;
            p.y = random() * this.canvas.height;
            p.vx = 0;
            p.vy = (random() - 0.5) * 2;
            p.color = '#FFD700';
            p.life = 0.8;
            p.decay = 0.02;
            p.size = Math.random() * 2 + 1;
        } else if (type === 'defense_stop') {
            p.vx = (random() - 0.5) * 15;
            p.vy = (random() - 0.5) * 15;
            p.color = random() > 0.6 ? this.getThemeColor('--danger', '#FF453A') : '#FFFFFF';
            p.decay = 0.05;
            p.size = random() * 4 + 2;
            p.gravity = 0.05;
        } else if (type === 'interception') {
            p.vx = (random() - 0.5) * 10;
            p.vy = (random() - 0.5) * 10;
            p.color = random() > 0.5 ? this.getThemeColor('--danger', '#FF453A') : '#FFFFFF';
            p.decay = 0.04;
            p.size = random() * 3 + 2;
        } else if (type === 'fumble') {
            p.vx = (random() - 0.5) * 6;
            p.vy = (random() * -4) - 2;
            p.color = '#D2691E';
            p.decay = 0.03;
            p.gravity = 0.3;
            p.size = random() * 4 + 1;
            p.shape = 'rect'; // Debris
            p.rotation = random() * 360;
            p.vRot = (random() - 0.5) * 20;
        } else if (type === 'shockwave') {
            p.life = 1.0;
            p.decay = 0.05;
            p.size = 10; // Start size
            p.maxSize = 100; // End size
            p.color = 'rgba(255, 255, 255, 0.5)';
            p.shape = 'ring';
            p.vx = 0;
            p.vy = 0;
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
            if (p.vRot) p.rotation += p.vRot;

            this.ctx.globalAlpha = p.life;
            this.ctx.fillStyle = p.color;
            this.ctx.strokeStyle = p.color;

            if (p.shape === 'rect') {
                this.ctx.save();
                this.ctx.translate(p.x, p.y);
                this.ctx.rotate(p.rotation * Math.PI / 180);
                this.ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
                this.ctx.restore();
            } else if (p.shape === 'ring') {
                this.ctx.beginPath();
                // Expand size based on life inverse
                const currentSize = p.size + (p.maxSize - p.size) * (1 - p.life);
                this.ctx.arc(p.x, p.y, currentSize, 0, Math.PI * 2);
                this.ctx.lineWidth = 2;
                this.ctx.stroke();
            } else {
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                this.ctx.fill();
            }
        }

        this.ctx.globalAlpha = 1;
        this.animationId = requestAnimationFrame(() => this.animate());
    }
}
