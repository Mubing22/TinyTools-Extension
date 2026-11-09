// Shared visual behavior. Page-specific particle settings live on the script tag.
(() => {
    'use strict';

    const options = document.currentScript.dataset;
    const speed = Number(options.particleSpeed || 0.5);
    const distanceSquared = Number(options.particleDistance || 180) ** 2;
    const colorProperty = options.particleColor || '--particle-color';
    const canvas = document.getElementById('bg-canvas');
    const context = canvas?.getContext('2d');
    const background = document.getElementById('bg-image');
    const navbar = document.getElementById('navbar');
    const toggle = document.getElementById('theme-toggle');
    const sun = toggle?.querySelector('.icon-sun');
    const moon = toggle?.querySelector('.icon-moon');
    let width = window.innerWidth;
    let height = window.innerHeight;
    let points = [];
    let strokeColor;
    let frameId = null;
    let resizePending = true;
    let scrollPending = true;
    let pointerPending = false;
    let pointerX = 0;
    let pointerY = 0;

    function updateTheme() {
        const isDark = document.body.dataset.theme === 'dark';
        if (sun) sun.style.display = isDark ? 'none' : 'block';
        if (moon) moon.style.display = isDark ? 'block' : 'none';
        // Preserve the original root-defined color; read it only on theme changes.
        strokeColor = getComputedStyle(document.documentElement)
            .getPropertyValue(colorProperty).trim();
    }

    document.addEventListener('themechange', updateTheme);

    function resize() {
        width = window.innerWidth;
        height = window.innerHeight;
        if (!context) return;
        // Ignore resize events which do not actually change the canvas dimensions.
        if (points.length && canvas.width === width && canvas.height === height) return;
        canvas.width = width;
        canvas.height = height;
        points = Array.from({ length: 40 }, () => ({
            x: Math.random() * width,
            y: Math.random() * height,
            vx: (Math.random() - 0.5) * speed,
            vy: (Math.random() - 0.5) * speed
        }));
    }

    function drawParticles() {
        context.clearRect(0, 0, width, height);
        context.strokeStyle = strokeColor;
        for (let i = 0; i < points.length; i++) {
            const point = points[i];
            point.x += point.vx;
            point.y += point.vy;
            if (point.x < 0 || point.x > width) point.vx *= -1;
            if (point.y < 0 || point.y > height) point.vy *= -1;
            for (let j = i + 1; j < points.length; j++) {
                const other = points[j];
                const dx = point.x - other.x;
                const dy = point.y - other.y;
                if (dx * dx + dy * dy < distanceSquared) {
                    // Separate strokes preserve the original opacity at intersections.
                    context.beginPath();
                    context.moveTo(point.x, point.y);
                    context.lineTo(other.x, other.y);
                    context.stroke();
                }
            }
        }
    }

    function scheduleFrame() {
        if (frameId === null && !document.hidden) frameId = requestAnimationFrame(renderFrame);
    }

    function renderFrame() {
        frameId = null;
        if (document.hidden) return;
        if (resizePending) {
            resizePending = false;
            resize();
        }
        if (scrollPending) {
            scrollPending = false;
            navbar?.classList.toggle('scrolled', window.scrollY > 100);
        }
        if (pointerPending && background) {
            pointerPending = false;
            const x = (pointerX / width - 0.5) * 60;
            const y = (pointerY / height - 0.5) * 60;
            background.style.transform = `scale(1.3) translate(${x}px, ${y}px)`;
        }
        if (context) {
            drawParticles();
            scheduleFrame();
        }
    }

    window.addEventListener('mousemove', (event) => {
        pointerX = event.clientX;
        pointerY = event.clientY;
        pointerPending = true;
        scheduleFrame();
    }, { passive: true });
    window.addEventListener('scroll', () => {
        scrollPending = true;
        scheduleFrame();
    }, { passive: true });
    window.addEventListener('resize', () => {
        resizePending = true;
        scheduleFrame();
    }, { passive: true });
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            cancelAnimationFrame(frameId);
            frameId = null;
        } else {
            resizePending = true;
            scrollPending = true;
            scheduleFrame();
        }
    });

    updateTheme();
    scheduleFrame();
})();
