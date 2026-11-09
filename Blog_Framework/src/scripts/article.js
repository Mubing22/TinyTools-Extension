(() => {
'use strict';
marked.setOptions({ gfm:true, breaks:true });
const params = new URLSearchParams(window.location.search);
const id = params.get('id');
const records = typeof notesData !== 'undefined' ? notesData : [];
const note = Array.isArray(records) ? records.find((item) => item.idDate === id) : null;
const normalize = (content = '') => String(content).replace(/\r\n/g,'\n').replace(/<br\s*\/?>(\s*)/gi,'\n').replace(/^\s*---\s*\n?/,'').trim();
const getArticleStats = (content) => {
    const text = document.createElement('div');
    text.innerHTML = marked.parse(normalize(content));
    const plainText = text.textContent.replace(/\s+/g, '');
    const cjkCount = (plainText.match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g) || []).length;
    const latinCount = (plainText.match(/[A-Za-z0-9]+/g) || []).reduce((total, token) => total + token.length, 0);
    const count = cjkCount + latinCount;
    return { count, minutes: Math.max(1, Math.ceil(count / 350)) };
};
const enableAutoHideNavbar = () => {
    const navbar = document.querySelector('body > nav');
    const article = document.getElementById('article-shell');
    if (!navbar || !article) return;

    let lastScrollY = window.scrollY;
    let framePending = false;
    const updateNavbar = () => {
        const scrollY = window.scrollY;
        const articleTop = article.getBoundingClientRect().top + scrollY;
        const collapseAt = Math.max(0, articleTop - navbar.offsetHeight - 16);
        const scrollingDown = scrollY > lastScrollY;

        if (scrollY < collapseAt || scrollY < lastScrollY) {
            navbar.classList.remove('nav-hidden');
        } else if (scrollingDown) {
            navbar.classList.add('nav-hidden');
        }

        lastScrollY = scrollY;
        framePending = false;
    };

    window.addEventListener('scroll', () => {
        if (framePending) return;
        framePending = true;
        requestAnimationFrame(updateNavbar);
    }, { passive: true });
    updateNavbar();
};
const slugify = (text, used) => {
    const base = String(text).trim().toLowerCase()
        .replace(/[`~!@#$%^&*()+=\[\]{}\\|;:'",.<>/?～！￥……（）【】「」；：‘’“”，。、《》？]/g, '')
        .replace(/\s+/g, '-').replace(/-+/g, '-') || 'section';
    let slug = base;
    let index = 2;
    while (used.has(slug)) slug = `${base}-${index++}`;
    used.add(slug);
    return slug;
};
const createToc = () => {
    const toc = document.getElementById('article-toc');
    const body = document.getElementById('toc-body');
    const headings = [...document.querySelectorAll('#article-content h1, #article-content h2, #article-content h3, #article-content h4, #article-content h5, #article-content h6')];
    if (!toc || !body || headings.length === 0) return;

    const usedIds = new Set();
    const root = document.createElement('ul');
    root.className = 'toc-list';
    const stack = [{ level: 0, list: root }];

    headings.forEach((heading) => {
        if (!heading.id) heading.id = slugify(heading.textContent, usedIds);
        else usedIds.add(heading.id);
        const rawLevel = Number(heading.tagName.slice(1));
        const level = Math.min(rawLevel, stack[stack.length - 1].level + 1);
        while (stack.length > 1 && level <= stack[stack.length - 1].level) stack.pop();
        const parent = stack[stack.length - 1].list;
        const item = document.createElement('li');
        item.className = `toc-item toc-level-${level}`;
        const link = document.createElement('a');
        link.href = `#${heading.id}`;
        link.textContent = heading.textContent.trim();
        link.className = 'toc-link';
        link.addEventListener('click', () => {
            history.replaceState(null, '', `#${heading.id}`);
        });
        item.appendChild(link);
        parent.appendChild(item);
        const childList = document.createElement('ul');
        childList.className = 'toc-list';
        item.appendChild(childList);
        stack.push({ level, list: childList });
    });

    // Remove empty child lists so leaf entries keep a compact tree shape.
    body.replaceChildren(root);
    body.querySelectorAll('.toc-item > .toc-list').forEach((list) => {
        if (!list.children.length) list.remove();
    });
    toc.hidden = false;

    const collapse = document.getElementById('toc-collapse');
    if (collapse && window.matchMedia('(max-width: 700px)').matches) {
        toc.classList.add('is-collapsed');
        collapse.textContent = '+';
        collapse.setAttribute('aria-expanded', 'false');
    }
    collapse?.addEventListener('click', () => {
        const collapsed = toc.classList.toggle('is-collapsed');
        collapse.textContent = collapsed ? '+' : '−';
        collapse.setAttribute('aria-expanded', String(!collapsed));
    });

    const links = [...body.querySelectorAll('.toc-link')];
    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            links.forEach((link) => link.classList.toggle('is-active', link.getAttribute('href') === `#${entry.target.id}`));
        });
    }, { rootMargin: '-18% 0px -68% 0px', threshold: 0 });
    headings.forEach((heading) => observer.observe(heading));
};
if (!note) {
    document.getElementById('article-title').textContent = 'RECORD_NOT_FOUND';
    document.getElementById('article-content').innerHTML = '<p class="error">The requested article does not exist in notes_data.js.</p>';
} else {
    document.title = `${note.title} | ${window.siteConfig?.name || 'Your Blog'}`;
    document.getElementById('article-date').textContent = '';
    document.getElementById('article-status').textContent = note.status;
    const stats = getArticleStats(note.content);
    document.getElementById('article-word-count').textContent = `字数 ${stats.count.toLocaleString('zh-CN')}`;
    document.getElementById('article-reading-time').textContent = `阅读约 ${stats.minutes} 分钟`;
    document.getElementById('article-title').textContent = note.title;
    document.getElementById('article-content').innerHTML = marked.parse(normalize(note.content));
    document.querySelectorAll('#article-content img').forEach((image) => {
        image.loading = 'lazy';
        image.decoding = 'async';
        image.referrerPolicy = 'no-referrer';
        image.addEventListener('error', () => image.dataset.imageError = 'true', { once: true });
    });
    const firstHeading = document.querySelector('#article-content h1, #article-content h2');
    if (firstHeading && firstHeading.textContent.trim() === note.title.trim()) firstHeading.remove();
    createToc();
    enableAutoHideNavbar();
}
})();
