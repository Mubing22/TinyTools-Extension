'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { render } = require('../scripts/lib/templates');
test('components share values and reject missing values and circular includes', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-template-'));
    try {
        fs.writeFileSync(path.join(dir, 'nav.html'), '<nav>{{label}}</nav>');
        assert.equal(render('<main>{{> nav}}{{content}}</main>', { label: 'Home', content: 'Body' }, dir), '<main><nav>Home</nav>Body</main>');
        assert.throws(() => render('{{missing}}', {}, dir), /Missing template value/);
        fs.writeFileSync(path.join(dir, 'loop.html'), '{{> loop}}');
        assert.throws(() => render('{{> loop}}', {}, dir), /Circular component/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
