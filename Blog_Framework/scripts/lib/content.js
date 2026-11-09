'use strict';
const fs = require('node:fs');
const path = require('node:path');

function parseNote(source, filename = 'article') {
    source = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    const separator = /^---[ \t]*$/m.exec(source);
    if (!separator) throw new Error(filename + ': missing metadata separator ---');
    const metadata = {};
    for (const line of source.slice(0, separator.index).split('\n')) {
        if (!line.trim()) continue;
        const pair = /^([A-Za-z]+):\s*(.*)$/.exec(line);
        if (!pair) throw new Error(filename + ': invalid metadata line');
        if (Object.hasOwn(metadata, pair[1])) throw new Error(filename + ': duplicate metadata ' + pair[1]);
        metadata[pair[1]] = pair[2].trim();
    }
    const date = /^(\d{4})\.(\d{1,2})\.(\d{1,2})\s*\/\s*(\d{1,2}):(\d{2})$/.exec(metadata.DateTime || '');
    if (!metadata.Title || !date) throw new Error(filename + ': Title and DateTime (YYYY.MM.DD / HH:mm) are required');
    const day = [date[1], date[2].padStart(2, '0'), date[3].padStart(2, '0')].join('-');
    const clock = date[4].padStart(2, '0') + ':' + date[5];
    const iso = day + 'T' + clock + ':00Z';
    const instant = new Date(iso);
    if (!Number.isFinite(instant.getTime()) || instant.toISOString().slice(0, 16) !== day + 'T' + clock) {
        throw new Error(filename + ': invalid date or time');
    }
    const id = metadata.Id || day.replace(/-/g, '');
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id)) throw new Error(filename + ': Id must use letters, digits, hyphens or underscores');
    if (metadata.Category === 'All') throw new Error(filename + ': All is reserved for the category filter');
    if (metadata.Color && !/^#[0-9a-f]{6}$/i.test(metadata.Color)) throw new Error(filename + ': Color must be a six-digit hex value');
    return {
        title: metadata.Title, datetime: day.replace(/-/g, '.') + ' / ' + clock,
        date: day, idDate: id, status: metadata.Status || metadata.Category || '',
        color: metadata.Color || '#58a6ff', summary: metadata.Summary || '',
        category: metadata.Category || '',
        tags: [...new Set((metadata.Tags || '').split(',').map(tag => tag.trim()).filter(Boolean))],
        content: source.slice(separator.index + separator[0].length).trim()
    };
}

function readNotes(directory) {
    const ids = new Set();
    const notes = fs.readdirSync(directory).filter(file => /\.(txt|md)$/i.test(file)).sort().map(file => {
        const note = parseNote(fs.readFileSync(path.join(directory, file), 'utf8'), file);
        if (ids.has(note.idDate)) throw new Error(file + ': duplicate Id ' + note.idDate);
        ids.add(note.idDate);
        return note;
    });
    return notes.sort((a, b) => b.datetime.localeCompare(a.datetime));
}

function buildNotes(root) {
    const notes = readNotes(path.join(root, 'content/posts'));
    const target = path.join(root, '.local/notes_data.js');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const data = 'const notesData = ' + JSON.stringify(notes, null, 2) + ';\n';
    if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== data) fs.writeFileSync(target, data);
    return notes;
}

module.exports = { parseNote, readNotes, buildNotes };
