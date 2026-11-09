(() => {
    'use strict';
    if (window.siteConfig?.effects?.parallax === false) return;
    const background = document.querySelector('.landing-background');
    if (!background) return;
    const motion = window.matchMedia('(prefers-reduced-motion: no-preference) and (pointer: fine)');
    let x = 0, y = 0, targetX = 0, targetY = 0, frame = null;
    const draw = () => {
        x += (targetX - x) * .08;
        y += (targetY - y) * .08;
        background.style.setProperty('--background-x', x + 'px');
        background.style.setProperty('--background-y', y + 'px');
        frame = Math.abs(targetX - x) + Math.abs(targetY - y) > .05
            ? requestAnimationFrame(draw) : null;
    };
    const move = (nextX, nextY) => {
        targetX = nextX;
        targetY = nextY;
        if (frame === null) frame = requestAnimationFrame(draw);
    };
    window.addEventListener('pointermove', (event) => {
        if (!motion.matches) return;
        move((event.clientX / window.innerWidth - .5) * -40,
            (event.clientY / window.innerHeight - .5) * -40);
    }, { passive: true });
    document.documentElement.addEventListener('pointerleave', () => move(0, 0));
    motion.addEventListener('change', () => move(0, 0));
})();
