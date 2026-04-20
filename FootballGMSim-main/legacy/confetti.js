export function launchConfetti(mode = 'rain') {
    // Create canvas
    const canvas = document.createElement('canvas');
    canvas.style.position = 'fixed';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '9999';
    document.body.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    let width = window.innerWidth;
    let height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;

    const particles = [];
    const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ffa500', '#ffffff'];

    const count = mode === 'cannon' ? 150 : (mode === 'victory' ? 200 : 300);

    for (let i = 0; i < count; i++) {
        let x, y, vx, vy;
        let size = Math.random() * 10 + 5;
        let color = colors[Math.floor(Math.random() * colors.length)];

        if (mode === 'cannon') {
            x = width / 2;
            y = height / 2;
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 15 + 5;
            vx = Math.cos(angle) * speed;
            vy = Math.sin(angle) * speed;
        } else if (mode === 'victory') {
            // Spawn from bottom corners
            x = (i % 2 === 0) ? 0 : width;
            y = height;
            const angle = (i % 2 === 0) ? -Math.PI/4 + (Math.random()-0.5) : -3*Math.PI/4 + (Math.random()-0.5);
            const speed = Math.random() * 20 + 10;
            vx = Math.cos(angle) * speed; // Shoot inwards/up
            vy = Math.sin(angle) * speed; // Shoot up
        } else {
            // Rain (Default)
            x = Math.random() * width;
            y = Math.random() * height - height; // Start above screen
            vx = Math.random() * 4 - 2;
            vy = Math.random() * 5 + 5;
        }

        particles.push({
            x: x,
            y: y,
            vx: vx,
            vy: vy,
            color: color,
            size: size,
            rotation: Math.random() * 360,
            rotationSpeed: Math.random() * 10 - 5,
            oscillation: Math.random() * 20,
            oscillationSpeed: Math.random() * 0.1,
            gravity: 0.15,
            drag: 0.96
        });
    }

    let animationId;
    let startTime = Date.now();
    const duration = 5000; // Run for 5 seconds

    function animate() {
        ctx.clearRect(0, 0, width, height);

        let activeParticles = 0;
        const currentTime = Date.now();

        // Stop adding new frames if duration exceeded and all particles are off screen
        if (currentTime - startTime > duration) {
             particles.forEach(p => p.gravity += 0.05); // Accelerate falling to clear
        }

        particles.forEach(p => {
            p.x += p.vx + Math.sin(p.oscillation) * 0.5; // Slight sway
            p.oscillation += p.oscillationSpeed;
            p.y += p.vy;
            p.rotation += p.rotationSpeed;
            p.vy += p.gravity;
            p.vx *= p.drag; // Air resistance
            p.vy *= p.drag;

            // Simple floor bounce for victory mode
            if (mode === 'victory' && p.y > height - p.size && p.vy > 0) {
                 p.vy *= -0.6;
                 p.y = height - p.size;
            }

            if (p.y < height + 50 && p.x > -50 && p.x < width + 50) { // Check if still visible (with buffer)
                activeParticles++;
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rotation * Math.PI / 180);
                ctx.fillStyle = p.color;
                ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
                ctx.restore();
            }
        });

        if (activeParticles > 0 && currentTime - startTime < duration + 3000) {
            animationId = requestAnimationFrame(animate);
        } else {
            if (canvas.parentNode) {
                document.body.removeChild(canvas);
            }
        }
    }

    animate();

    // Resize handler
    const resizeHandler = () => {
        width = window.innerWidth;
        height = window.innerHeight;
        canvas.width = width;
        canvas.height = height;
    };
    window.addEventListener('resize', resizeHandler, { once: true });
}
