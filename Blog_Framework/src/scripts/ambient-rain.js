(() => {
    'use strict';
    if (window.siteConfig?.effects?.rain === false) return;
    const canvas = document.getElementById('ambient-rain');
    const context = canvas?.getContext('2d');
    if (!context) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let width = 0, height = 0, frame = null, previous = 0, color = '';
    let drops = [];
    const theme = () => { color = document.body.dataset.theme === 'dark' ? '230,237,243' : '31,35,40'; };
    const drop = (randomY) => ({
        x: Math.random() * width, y: randomY ? Math.random() * height : height + 30,
        length: 10 + Math.random() * 16, speed: 110 + Math.random() * 160,
        alpha: .14 + Math.random() * .1, drift: (Math.random() - .5) * 10
    });
    const resize = () => {
        width = innerWidth; height = innerHeight;
        const ratio = Math.min(devicePixelRatio || 1, 1.5);
        canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        drops = Array.from({ length: Math.min(65, Math.max(18, Math.round(width * height / 23000))) }, () => drop(true));
    };
    const draw = now => {
        frame = null;
        if (document.hidden || reduced.matches) return;
        const dt = previous ? Math.min((now - previous) / 1000, .05) : 0;
        previous = now;
        context.clearRect(0, 0, width, height);
        context.lineWidth = 1.2; context.lineCap = 'round';
        drops.forEach((d, i) => {
            d.y -= d.speed * dt; d.x += d.drift * dt;
            if (d.y + d.length < 0) { drops[i] = drop(false); return; }
            context.strokeStyle = 'rgba(' + color + ',' + d.alpha + ')';
            context.beginPath(); context.moveTo(d.x, d.y); context.lineTo(d.x, d.y + d.length); context.stroke();
        });
        frame = requestAnimationFrame(draw);
    };
    const start = () => {
        if (frame === null && !document.hidden && !reduced.matches) {
            previous = 0; frame = requestAnimationFrame(draw);
        }
    };
    const stop = () => { cancelAnimationFrame(frame); frame = null; };
    document.addEventListener('themechange', theme);
    window.addEventListener('resize', resize, { passive: true });
    document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else start(); });
    reduced.addEventListener('change', () => {
        stop(); context.clearRect(0, 0, width, height);
        start();
    });
    theme(); resize(); start();
})();
