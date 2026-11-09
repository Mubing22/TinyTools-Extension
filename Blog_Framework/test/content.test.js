'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseNote, readNotes, buildNotes } = require('../scripts/lib/content');
const fixture = extra => 'Title: 示例\nDateTime: 2026.1.2 / 9:05\nId: example\n' + extra + '\n---\n# 示例\n\n正文。';

test('custom categories and explicit tags survive parsing without inferred tags', () => {
    const note = parseNote(fixture('Category: 自定义\nTags: one, two, one\nSummary: 简介'));
    assert.equal(note.datetime, '2026.01.02 / 09:05');
    assert.equal(note.category, '自定义');
    assert.deepEqual(note.tags, ['one', 'two']);
    assert.equal(note.summary, '简介');
    assert.equal(parseNote(fixture('')).category, '');
    assert.deepEqual(parseNote(fixture('')).tags, []);
});
test('reject invalid calendar dates, time, duplicate metadata and invalid IDs', () => {
    for (const date of ['2026.02.30 / 12:00', '2026.01.01 / 24:00', '2026.01.01 / 12:60']) {
        assert.throws(() => parseNote(fixture('').replace('2026.1.2 / 9:05', date)), /invalid date/);
    }
    assert.throws(() => parseNote(fixture('Id: other')), /duplicate metadata/);
    assert.throws(() => parseNote(fixture('').replace('Id: example', 'Id: ../unsafe')), /Id must/);
});
test('duplicate article IDs fail without overwriting existing generated data', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-content-test-'));
    try {
        fs.mkdirSync(path.join(root, 'content/posts'), { recursive: true });
        fs.mkdirSync(path.join(root, '.local'), { recursive: true });
        fs.writeFileSync(path.join(root, 'content/posts/a.md'), fixture(''));
        fs.writeFileSync(path.join(root, 'content/posts/b.md'), fixture(''));
        const output = path.join(root, '.local/notes_data.js');
        fs.writeFileSync(output, 'preserve');
        assert.throws(() => readNotes(path.join(root, 'content/posts')), /duplicate Id/);
        assert.throws(() => buildNotes(root), /duplicate Id/);
        assert.equal(fs.readFileSync(output, 'utf8'), 'preserve');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
