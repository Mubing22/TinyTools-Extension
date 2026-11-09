(() => {
    'use strict';

    const list = document.getElementById('reading-list');
    const empty = document.getElementById('reading-empty');
    const books = Array.isArray(window.booksData) ? window.booksData : [];
    if (list && empty) {
        books.forEach(book => {
            if (!book || book.localOnly || typeof book.title !== 'string' || !book.title.trim() || typeof book.file !== 'string') return;
            let url;
            try { url = new URL(book.file, location.href); } catch { return; }
            const base = new URL('assets/books/', location.href);
            if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname) || !url.pathname.toLowerCase().endsWith('.pdf') || url.search || url.hash) return;
            const item = document.createElement('li');
            item.className = 'reading-book';
            const spine = document.createElement('span');
            spine.className = 'reading-book-spine';
            spine.setAttribute('aria-hidden', 'true');
            spine.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8m-8 4h5"/></svg>';
            const info = document.createElement('div');
            info.className = 'reading-book-info';
            const title = document.createElement('span');
            title.className = 'reading-book-title';
            title.textContent = book.title;
            info.appendChild(title);
            if (book.author) {
                const author = document.createElement('span');
                author.className = 'reading-book-author';
                author.textContent = book.author;
                info.appendChild(author);
            }
            const download = document.createElement('a');
            download.className = 'reading-download';
            download.href = url.href;
            download.download = decodeURIComponent(url.pathname.split('/').pop());
            download.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M5 16v4h14v-4"/></svg>';
            download.title = '下载 ' + book.title;
            download.setAttribute('aria-label', '下载 ' + book.title + ' PDF');
            item.append(spine, info, download);
            list.appendChild(item);
        });
        empty.hidden = list.children.length > 0;
    }

})();
