import {rm,mkdir,copyFile} from 'node:fs/promises';
await rm('dist',{recursive:true,force:true});await mkdir('dist');
for(const file of ['index.html','app.js','engine.js','scoring.js','team.js','styles.css','data.json'])await copyFile('public/'+file,'dist/'+file);
console.log('Built static site in dist/ (no credentials or collector cache included).');
