(() => {
    'use strict';
    const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
    // One animation implementation for both theme changes and native page navigation.
    const reveal = async (transition, point) => {
        if (!transition) return;
        if (reduceMotion()) { transition.skipTransition(); return; }
        const x = Math.max(0, Math.min(innerWidth, point.x));
        const y = Math.max(0, Math.min(innerHeight, point.y));
        const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)) + 2;
        let animation;
        try {
            await transition.ready;
            animation = document.documentElement.animate({
                clipPath: ['circle(0px at ' + x + 'px ' + y + 'px)',
                    'circle(' + radius + 'px at ' + x + 'px ' + y + 'px)']
            }, {
                duration: 650,
                easing: 'cubic-bezier(.4, 0, .2, 1)',
                fill: 'both',
                pseudoElement: '::view-transition-new(root)'
            });
            await transition.finished;
        } catch {
            transition.skipTransition();
        } finally {
            animation?.cancel();
        }
    };
    window.daydreamEffects = { reveal, reduceMotion };
    const key = 'daydream-navigation-origin';
    document.addEventListener('click', event => {
        if (event.defaultPrevented || event.button !== 0 ||
            event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        const link = event.target.closest('a[href]');
        if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
        const url = new URL(link.href, location.href);
        if (url.origin !== location.origin || !/\/(?:index|Project)\.html$/.test(url.pathname)) return;
        if (url.pathname === location.pathname && url.search === location.search) return;
        const rect = link.getBoundingClientRect();
        try {
            sessionStorage.setItem(key, JSON.stringify({
                url: url.href, time: Date.now(),
                x: event.detail ? event.clientX : rect.left + rect.width / 2,
                y: event.detail ? event.clientY : rect.top + rect.height / 2
            }));
        } catch {}
    });
    window.addEventListener('pageswap', event => {
        const destination = event.activation?.entry?.url;
        if (destination && new URL(destination).pathname.endsWith('/article.html')) {
            event.viewTransition?.skipTransition();
        }
    });
    window.addEventListener('pagereveal', event => {
        const transition = event.viewTransition;
        if (!transition) return;
        if (location.pathname.endsWith('/article.html')) {
            transition.skipTransition();
            return;
        }
        let point = { x: innerWidth / 2, y: innerHeight / 2 };
        try {
            const saved = JSON.parse(sessionStorage.getItem(key));
            sessionStorage.removeItem(key);
            if (saved?.url === location.href && Date.now() - saved.time < 15000) point = saved;
        } catch {}
        void reveal(transition, point);
    });
})();
