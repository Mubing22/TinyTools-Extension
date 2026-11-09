(() => {
    'use strict';
    const config = window.siteConfig || {};
    const name = config.name || 'Your Blog';
    const safeUrl = value => {
        if (typeof value !== 'string' || !value.trim()) return '';
        try {
            const url = new URL(value, location.href);
            if (url.username || url.password || !['http:', 'https:'].includes(url.protocol)) return '';
            return url.href;
        } catch { return ''; }
    };
    document.querySelectorAll('[data-site-name]').forEach(el => { el.textContent = name; });
    document.querySelectorAll('[data-site-tagline]').forEach(el => { el.textContent = config.tagline || ''; });
    document.querySelectorAll('[data-site-bio]').forEach(el => { el.textContent = config.bio || ''; });
    document.querySelectorAll('[data-site-footer]').forEach(el => { el.textContent = config.footer || ''; });
    document.querySelectorAll('[data-site-avatar]').forEach(el => {
        el.src = safeUrl(config.avatar) || 'assets/images/avatar.svg';
    });
    const background = safeUrl(config.background);
    if (background) document.documentElement.style.setProperty('--site-background', 'url(' + JSON.stringify(background) + ')');
    document.querySelectorAll('[data-social]').forEach(link => {
        const url = safeUrl(config.socials?.[link.dataset.social]);
        link.hidden = !url;
        if (url) link.href = url;
    });
    const records = typeof notesData !== 'undefined' ? notesData : [];
    const id = new URLSearchParams(location.search).get('id');
    const article = records.find(note => note.idDate === id);
    document.title = location.pathname.endsWith('/Project.html') ? '文章 | ' + name :
        article ? article.title + ' | ' + name : name;
})();
