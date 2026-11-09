'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { buildNotes } = require('./lib/content');
const { render } = require('./lib/templates');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');
function rejectLinks(file) {
 const stat = fs.lstatSync(file);
 if (stat.isSymbolicLink()) throw new Error('Symlink not allowed: ' + file);
 if (stat.isDirectory()) for (const name of fs.readdirSync(file)) rejectLinks(path.join(file, name));
}
for (const entry of ['src','public','config','content']) rejectLinks(path.join(root,entry));
const notes = buildNotes(root);
const stage = fs.mkdtempSync(path.join(root,'.site-build-'));
try {
 fs.cpSync(path.join(root,'public'),stage,{recursive:true});
 for(const [source,target] of [['src/styles','assets/css'],['src/scripts','assets/js'],['config/site.js','assets/data/site-config.js'],['config/books.js','assets/data/books.js']]){
  const destination=path.join(stage,target);fs.mkdirSync(path.dirname(destination),{recursive:true});
  fs.cpSync(path.join(root,source),destination,{recursive:true});
 }
 fs.writeFileSync(path.join(stage,'assets/data/notes_data.js'),'const notesData = '+JSON.stringify(notes,null,2)+';\n');
 for(const name of ['home','articles','article']){
  const page=JSON.parse(fs.readFileSync(path.join(root,'src/pages',name+'.json'),'utf8'));
  const styles=['assets/css/tokens.css','assets/css/base.css',...page.styles].map(file=>'<link rel="stylesheet" href="'+file+'">').join('\n');
  const content=fs.readFileSync(path.join(root,'src/pages',name+'.html'),'utf8');
  const layout=fs.readFileSync(path.join(root,'src/layouts/base.html'),'utf8');
  fs.writeFileSync(path.join(stage,page.output),render(layout,{...page,styles,content},path.join(root,'src/components')));
 }
 fs.writeFileSync(path.join(stage,'.nojekyll'),'');
 fs.rmSync(output,{recursive:true,force:true});fs.renameSync(stage,output);
 console.log('Built dist/: 3 pages, '+notes.length+' articles.');
} finally { if(fs.existsSync(stage))fs.rmSync(stage,{recursive:true,force:true}); }
