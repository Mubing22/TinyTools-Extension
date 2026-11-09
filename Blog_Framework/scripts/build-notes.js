'use strict';
const path = require('node:path');
const { buildNotes } = require('./lib/content');
try {
    const notes = buildNotes(path.resolve(__dirname, '..'));
    console.log('Built ' + notes.length + ' articles.');
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}
