'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),dist=path.join(root,'dist');
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
for(const directory of ['src/scripts','config','scripts','test'])for(const file of walk(path.join(root,directory)).filter(f=>/\.(?:js|cjs)$/.test(f)))execFileSync(process.execPath,['--check',file],{stdio:'pipe'});
function asset(value,base=dist){
 if(/^(?:https?:|data:|#)/.test(value)||!value)return;
 const file=path.resolve(base,decodeURIComponent(value.split(/[?#]/)[0]));
 if(!file.startsWith(dist+path.sep)||!fs.existsSync(file))throw new Error('Missing or invalid asset: '+value);
}
for(const page of ['index.html','Project.html','article.html']){
 const html=fs.readFileSync(path.join(dist,page),'utf8');
 if(/{{[^}]+}}/.test(html))throw new Error('Unresolved template in '+page);
 for(const m of html.matchAll(/(?:href|src)="([^"]+)"/g))asset(m[1]);
}
for(const css of walk(path.join(dist,'assets/css')).filter(f=>f.endsWith('.css')))for(const m of fs.readFileSync(css,'utf8').matchAll(/url\(['"]?([^)'"]+)['"]?\)/g))asset(m[1],path.dirname(css));
const context={window:{}};
for(const file of ['site-config.js','books.js'])vm.runInNewContext(fs.readFileSync(path.join(dist,'assets/data',file),'utf8'),context,{timeout:1000});
asset(context.window.siteConfig.avatar);asset(context.window.siteConfig.background);
for(const book of context.window.booksData)if(!book.localOnly)asset(book.file);
const records=vm.runInNewContext(fs.readFileSync(path.join(dist,'assets/data/notes_data.js'),'utf8')+';notesData',{}, {timeout:1000});
if(!Array.isArray(records)||new Set(records.map(n=>n.idDate)).size!==records.length)throw new Error('Invalid article data');
console.log('Checked source syntax, rendered pages and public resources.');
