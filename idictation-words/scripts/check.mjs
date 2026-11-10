import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const walk = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const file = join(directory, entry.name);
  return entry.isDirectory() ? walk(file) : [file];
});
const scripts = [
  join(root, 'start.mjs'),
  ...walk(join(root, 'src')),
  ...walk(join(root, 'scripts'))
].filter(file => /\.mjs$/.test(file));
for (const file of scripts) {
  // Parse only: do not import entry points, launch browsers or contact the website.
  execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
}
for (const name of ['start.bat', 'start.sh', 'ensure-node.ps1', 'README.md', 'LICENSE']) {
  assert.ok(statSync(join(root, name)).isFile(), 'Missing required file: ' + name);
}
const config = JSON.parse(readFileSync(join(root, 'config.example.json'), 'utf8'));
assert.equal(typeof config.bookPath, 'string');
assert.equal(typeof config.bookTitle, 'string');
assert.ok(Array.isArray(config.chapters), 'chapters must be an array');
assert.equal(typeof config.logPath, 'string');
assert.ok(Number.isInteger(config.maxFail) && config.maxFail > 0, 'maxFail must be a positive integer');
assert.equal(typeof config.restart, 'boolean');
console.log('Checked ' + scripts.length + ' JavaScript files, launcher assets and example configuration.');
