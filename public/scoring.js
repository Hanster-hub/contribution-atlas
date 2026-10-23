(function(root){
'use strict';
const ranks=[['Intern',0],['Technician',100],['Engineer',500],['Senior Engineer',1500],['Lead Engineer',3000],['Principal Engineer',6000],['CTO',10000]];
const rank=x=>ranks.filter(r=>x>=r[1]).at(-1)[0];
const login=x=>typeof x==='string'?x:x?.login||'';
const bot=(x,n)=>!!x.is_bot||(x.author||x.user)?.type==='Bot'||/\[bot\]$|^(dependabot|github-actions)$/i.test(n);
const total=c=>c.commits*2+c.merged*20+c.unmerged*2+c.reviews*5;
function analyze(data){
 const accounts=new Map(),unresolved=new Map(),end=new Date(data.generated_at),start=new Date(end);start.setUTCDate(start.getUTCDate()-6);start.setUTCHours(0,0,0,0);
 const blank=()=>({commits:0,merged:0,unmerged:0,reviews:0});
 const get=(name,unknown=false,b=false)=>{const map=unknown?unresolved:accounts,key=unknown?name:name.toLowerCase();if(!map.has(key))map.set(key,{id:(unknown?'unresolved:':'github:')+key,handle:name,automation:b,lifetime:blank(),week:blank(),excluded:{merges:0,imports:0,bundles:0}});const p=map.get(key);p.automation ||=b;return p};
 const add=(p,field,date)=>{p.lifetime[field]++;const d=new Date(date);if(d>=start&&d<=end)p.week[field]++};
 const seen=new Set();for(const c of data.commits||[]){if(seen.has(c.sha))continue;seen.add(c.sha);const n=login(c.author);if(!n)continue;const unknown=/unresolved|unlinked/.test(c.identity_basis||'');const p=get(n,unknown,bot(c,n));if(c.is_root_import||c.sha===data.import_sha){p.excluded.imports++;continue}if(c.is_merge||(c.parents||[]).length>1){p.excluded.merges++;continue}add(p,'commits',c.date)}
 const prs=new Set();for(const pr of data.prs||[]){if(prs.has(pr.number))continue;prs.add(pr.number);const n=login(pr.author||pr.user);if(!n)continue;const p=get(n,false,bot(pr,n));if(pr.is_integration){p.excluded.bundles++;continue}add(p,pr.merged_at?'merged':'unmerged',pr.merged_at||pr.created_at)}
 const prAuthors=new Map((data.prs||[]).map(p=>[Number(p.number),login(p.author||p.user).toLowerCase()]));
 const eligible=new Map();for(const r of data.reviews||[]){
  const n=login(r.author||r.user),number=Number(r.pr_number),date=new Date(r.submitted_at),author=login(r.pr_author||prAuthors.get(number)).toLowerCase();
  if(!r.submitted_at||String(r.state).toUpperCase()==='PENDING'||!n||!Number.isSafeInteger(number)||number<1||!Number.isFinite(date.getTime())||!author||author===n.toLowerCase())continue;
  const key=n.toLowerCase()+'|'+number,prior=eligible.get(key);if(!prior||date<new Date(prior.submitted_at))eligible.set(key,{...r,author:n});
 }
 for(const r of eligible.values()){const n=r.author;add(get(n,false,bot(r,n)),'reviews',r.submitted_at)}

 return {accounts:[...accounts.values()],unresolved:[...unresolved.values()],start:start.toISOString(),end:end.toISOString()};
}
const api={analyze,rank,ranks,total};if(typeof module!=='undefined')module.exports=api;else root.Scoring=api;
})(typeof window!=='undefined'?window:globalThis);
