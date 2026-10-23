// DOM-contract checks without a browser; visual layout still needs browser QA.
import test from 'node:test';
import assert from 'node:assert/strict';
const nodes=new Map();
const get=id=>{if(!nodes.has(id))nodes.set(id,{value:id==='#person'?'all':'',hidden:false,textContent:'',innerHTML:'',classList:{toggle(){}},setAttribute(){},scrollIntoView(){}});return nodes.get(id)};
globalThis.document={querySelector:get,querySelectorAll:()=>[]};
globalThis.window={addEventListener(){}};
globalThis.location={search:'',hash:''};
const snapshot={generated_at:'2026-06-30T18:00:00Z',repository:{full_name:'example/project'},commits:[{sha:'a',author:'alex',date:'2026-06-10',identity_basis:'github_login'}],prs:[{number:1,author:'alex',created_at:'2026-05-01',merged_at:null,state:'open'}],reviews:[]};
globalThis.fetch=async()=>({ok:true,json:async()=>snapshot});
await import('../public/app.js');
test('initial range includes older PR activity, not just commits',()=>{assert.equal(get('#from').value,'2026-05-01');assert.equal(get('#to').value,'2026-06-30');assert.equal(get('#export').disabled,false);assert.equal(get('#load-error').hidden,true);assert.match(get('#game-board').innerHTML,/alex/);assert.match(get('#ledger').innerHTML,/No matching evidence/)});
test('reset clears search and restores full activity date range',()=>{get('#search').value='not present';get('#from').value='2026-06-15';get('#reset').onclick();assert.equal(get('#search').value,'');assert.equal(get('#from').value,'2026-05-01')});
test('invalid import leaves previous snapshot usable',async()=>{const before=get('#history-detail').textContent;const target={files:[{size:25,text:async()=>JSON.stringify({...snapshot,generated_at:'not-a-date'})}],value:'file'};await get('#file').onchange({target});assert.match(get('#load-error').textContent,/Invalid snapshot date/);assert.equal(get('#history-detail').textContent,before);assert.equal(target.value,'');get('#reset').onclick();assert.equal(get('#load-error').hidden,true)});
