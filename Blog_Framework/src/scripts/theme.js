(() => {
    'use strict';
    const toggle = document.getElementById('theme-toggle');
    if (!toggle) return;
    const applyTheme = (theme) => {
        document.body.dataset.theme = theme;
        const dark = theme === 'dark';
        const sun = toggle.querySelector('.icon-sun');
        const moon = toggle.querySelector('.icon-moon');
        if (sun) sun.style.display = dark ? 'none' : 'block';
        if (moon) moon.style.display = dark ? 'block' : 'none';
        document.dispatchEvent(new Event('themechange'));
        toggle.setAttribute('aria-pressed', String(dark));
        toggle.setAttribute('aria-label', dark ? '切换到日间模式' : '切换到夜间模式');
    };
    let savedTheme;
    try { savedTheme = localStorage.getItem('daydream-theme'); } catch {}
    applyTheme(savedTheme === 'dark' ? 'dark' : 'light');
    let switching = false;
    toggle.addEventListener('click', async () => {
        if (switching) return;
        const theme = document.body.dataset.theme === 'dark' ? 'light' : 'dark';
        const update = () => {
            applyTheme(theme);
            try { localStorage.setItem('daydream-theme', theme); } catch {}
        };
        const effects = window.daydreamEffects;
        if (!document.startViewTransition || !effects || effects.reduceMotion()) {
            update();
            return;
        }
        const rect = toggle.getBoundingClientRect();
        switching = true;
        try {
            const transition = document.startViewTransition(update);
            await effects.reveal(transition, {
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2
            });
        } finally {
            switching = false;
        }
    });
    toggle.setAttribute('role', 'button');
    if (toggle.tagName !== 'BUTTON') {
        toggle.tabIndex = 0;
        toggle.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                toggle.click();
            }
        });
    }
    window.addEventListener('storage', event => {
        if (event.key === 'daydream-theme') applyTheme(event.newValue === 'dark' ? 'dark' : 'light');
    });
})();
