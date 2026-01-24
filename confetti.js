export function launchConfetti() {
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

    // Create particles
    for (let i = 0; i < 300; i++) {
        particles.push({
            x: Math.random() * width,
            y: Math.random() * height - height, // Start above the screen
            vx: Math.random() * 4 - 2,
            vy: Math.random() * 4 + 2,
            color: colors[Math.floor(Math.random() * colors.length)],
            size: Math.random() * 10 + 5,
            rotation: Math.random() * 360,
            rotationSpeed: Math.random() * 10 - 5,
            oscillation: Math.random() * 20,
            oscillationSpeed: Math.random() * 0.1
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
             particles.forEach(p => p.y += 20); // Accelerate falling to clear
        }

        particles.forEach(p => {
            p.x += Math.sin(p.oscillation) * 0.5; // Slight sway
            p.oscillation += p.oscillationSpeed;
            p.y += p.vy;
            p.rotation += p.rotationSpeed;
            p.vy += 0.05; // gravity

            if (p.y < height + 50) { // Check if still visible (with buffer)
                activeParticles++;
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rotation * Math.PI / 180);
                ctx.fillStyle = p.color;
                ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
                ctx.restore();
            }
        });

        if (activeParticles > 0 && currentTime - startTime < duration + 2000) {
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
