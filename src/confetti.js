export function launchConfetti() {
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
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const confettiCount = 200;
    const confetti = [];

    const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#00ffff', '#ff00ff', '#ffffff'];

    for (let i = 0; i < confettiCount; i++) {
        confetti.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height - canvas.height,
            w: Math.random() * 10 + 5,
            h: Math.random() * 5 + 5,
            color: colors[Math.floor(Math.random() * colors.length)],
            vx: Math.random() * 4 - 2,
            vy: Math.random() * 4 + 2,
            rotation: Math.random() * 360,
            rotationSpeed: Math.random() * 10 - 5
        });
    }

    let animationId;
    let startTime = Date.now();
    const duration = 3000; // Run for 3 seconds

    function animate() {
        const elapsed = Date.now() - startTime;
        if (elapsed > duration) {
            cancelAnimationFrame(animationId);
            document.body.removeChild(canvas);
            return;
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        confetti.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.rotation += p.rotationSpeed;

            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rotation * Math.PI / 180);
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
            ctx.restore();

            if (p.y > canvas.height) {
                p.y = -p.h;
            }
        });

        animationId = requestAnimationFrame(animate);
    }

    animate();
}
