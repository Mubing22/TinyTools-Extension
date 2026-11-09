'use strict';
const fs = require('node:fs');
const path = require('node:path');
function render(source, values, directory, stack = []) {
    return source.replace(/{{\s*>\s*([a-z-]+)\s*}}/g, (_, name) => {
        if (stack.includes(name)) throw new Error('Circular component: ' + name);
        return render(fs.readFileSync(path.join(directory, name + '.html'), 'utf8'), values, directory, [...stack, name]);
    }).replace(/{{\s*([a-zA-Z]+)\s*}}/g, (_, key) => {
        if (!Object.hasOwn(values, key)) throw new Error('Missing template value: ' + key);
        return render(String(values[key]), values, directory, stack);
    });
}
module.exports = { render };
