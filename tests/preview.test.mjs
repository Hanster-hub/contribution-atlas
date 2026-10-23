import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {demoData} from '../scripts/demo-data.mjs';

test('published standalone demo renders, switches views and matches synthetic generator',async()=>{
 const html=readFileSync(new URL('../docs/index.html',import.meta.url),'utf8');
 const scripts=[...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)];
 assert.equal(scripts.length,1);assert.doesNotMatch(html,/<script[^>]*\bsrc=/);
 const nodes=new Map();
 const element=(value='')=>({value,hidden:false,textContent:'',innerHTML:'',dataset:{},classList:{toggle(){}},setAttribute(){},scrollIntoView(){}});
 const get=id=>{if(!nodes.has(id))nodes.set(id,element(id==='#person'?'all':''));return nodes.get(id)};
 const buttons=['tracking','game'].map(mode=>({...element(),dataset:{mode}}));
 const context=vm.createContext({document:{querySelector:get,querySelectorAll:selector=>selector==='[data-mode]'?buttons:[]},window:{addEventListener(){}},location:{search:'',hash:''},URLSearchParams,console,fetch(){throw Error('Standalone demo must not fetch a snapshot');}});
 // The published module has no imports. An async wrapper preserves its top-level
 // await support while executing the actual bundled source, not rewritten copies.
 const result=await vm.runInContext('(async()=>{'+scripts[0][1]+';return demoData();})()',context);
 assert.deepEqual(JSON.parse(JSON.stringify(result)),demoData());
 assert.equal(get('#load-error').hidden,true,'startup must not fall into the error handler');
 assert.match(get('#game-board').innerHTML,/demo-alex/);
 assert.match(get('#people').innerHTML,/demo-alex/);
 assert.match(get('#ledger').innerHTML,/evidence-card/);
 assert.equal(get('#export').disabled,false);
 buttons[1].onclick();assert.equal(get('#game-view').hidden,false);assert.equal(get('#tracking-view').hidden,true);assert.equal(context.location.hash,'game');
 buttons[0].onclick();assert.equal(get('#game-view').hidden,true);assert.equal(get('#tracking-view').hidden,false);
 get('#search').value='missing';get('#reset').onclick();assert.equal(get('#search').value,'');assert.equal(get('#load-error').hidden,true);
});
