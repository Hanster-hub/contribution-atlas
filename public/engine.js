// Reject malformed imports before replacing an existing, usable snapshot.
export function validateSnapshot(data){
 const fail=message=>{throw new Error(message)};
 if(!data||!Array.isArray(data.commits)||!Array.isArray(data.prs||data.pull_requests))fail('Use a Contribution Atlas JSON snapshot containing commits and prs arrays.');
 const date=(value,label)=>{if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value)||!Number.isFinite(Date.parse(value)))fail('Invalid '+label+' date.');};
 date(data.generated_at,'snapshot');
 if(data.reviews!==undefined&&!Array.isArray(data.reviews))fail('Reviews must be an array.');
 if(data.config?.accounts!==undefined&&(!Array.isArray(data.config.accounts)||data.config.accounts.some(x=>typeof x!=='string')))fail('Accounts must be an array of login strings.');
 for(const [kind,items] of [['commit',data.commits],['PR',data.prs||data.pull_requests],['review',data.reviews||[]]])for(const x of items){
  if(!x||typeof x!=='object')fail('Invalid '+kind+' record.');
  for(const key of ['title','body','message','impact_summary','url','html_url','identity_basis'])if(x[key]!=null&&typeof x[key]!=='string')fail('Invalid '+kind+' '+key+'.');
  for(const key of ['author','user'])if(x[key]!=null&&typeof x[key]!=='string'&&(typeof x[key]!=='object'||(x[key].login!=null&&typeof x[key].login!=='string')||(x[key].name!=null&&typeof x[key].name!=='string')))fail('Invalid '+kind+' identity.');
  if(kind==='commit')date(dateOfCommit(x),'commit');
  if(kind==='PR'){
   date(x.created_at,'PR creation');if(x.merged_at)date(x.merged_at,'PR merge');
   if(x.modules!==undefined&&(!Array.isArray(x.modules)||x.modules.some(m=>typeof m!=='string')))fail('PR modules must be strings.');
   if(x.files!==undefined&&(!Array.isArray(x.files)||x.files.some(f=>typeof f!=='string'&&(!f||typeof f.filename!=='string'))))fail('Invalid PR files.');
  }
  if(kind==='review'&&(x.submitted_at||x.date))date(x.submitted_at||x.date,'review');
 }
 return data;
}
export const isAutomation = x => !!x?.is_bot || x?.type==='Bot' || (x?.author||x?.user)?.type==='Bot' || /\[bot\]$|^(dependabot|github-actions)$/i.test(typeof x==='string'?x:asLogin(x?.author||x?.user||x));
export const asLogin = x => typeof x==='string' ? x : x?.login || x?.name || 'Unlinked identity';
export const dateOfCommit = c => c.date || c.commit?.author?.date || c.commit?.committer?.date || '';
export const titleOfCommit = c => (c.message || c.commit?.message || '').split('\n')[0];
export function normalize(data){
 const prs=(data.prs||data.pull_requests||[]).map(p=>({...p,is_bot:isAutomation(p), number:Number.isSafeInteger(Number(p.number))?Number(p.number):0, author:asLogin(p.author||p.user),url:p.url?.includes('api.github')?p.html_url:p.html_url||p.url,merged_at:p.merged_at||null,files:Array.isArray(p.files)?p.files:[], body:p.body||'',title:p.title||''}));
 const commits=[...new Map((data.commits||[]).map(c=>[c.sha,{...c,is_bot:isAutomation(c),author:asLogin(c.author||c.commit?.author),date:dateOfCommit(c),message:c.message||c.commit?.message||'',url:c.html_url||c.url}])).values()];
 return {...data,repository:data.repository||data.repo||{full_name:'example/project'},prs,commits,reviews:data.reviews||[]};
}
export function integration(p){
 if(typeof p.is_integration==='boolean')return p.is_integration;
 return /\b(combin(?:e|ed|es|ing)|bundl(?:e|ed|es|ing))\b/i.test(p.title)&&/#[0-9]+/.test(p.title+' '+p.body);
}
export function modules(p){
 if(Array.isArray(p.modules)&&p.modules.length)return p.modules;
 const files=p.files.map(f=>typeof f==='string'?f:f.filename).join(' ');
 const text=(files||p.title).toLowerCase();
 const defs=[['Frontend',/frontend|\.[jt]sx?|css|html/],['Backend',/server|api|backend|\.py\b|\.go\b/],['Infrastructure',/deploy|docker|\.github|infra|terraform/],['Tests & quality',/test|spec|fixture/],['Documentation',/\.md\b|docs\//]];
 return defs.filter(([,r])=>r.test(text)).map(([n])=>n).length?defs.filter(([,r])=>r.test(text)).map(([n])=>n):['Other'];
}
export function analyze(data,from='',to='',person='all'){
 const within=d=>!!d&&(!from||d.slice(0,10)>=from)&&(!to||d.slice(0,10)<=to);
 const prs=data.prs.filter(p=>within(p.merged_at||p.created_at)&& (person==='all'||p.author===person));
 const commits=data.commits.filter(c=>within(c.date)&&(person==='all'||c.author===person));
 const reviews=data.reviews.filter(r=>within(r.submitted_at||r.date)&&(person==='all'||asLogin(r.user||r.author)===person));
 const accounts=new Map();
 const get=login=>{if(!accounts.has(login)) accounts.set(login,{login,merged:0,integrations:0,open:0,commits:0,mergeCommits:0,reviews:0,rootImports:0,isBot:false,unlinked:false,additions:0,deletions:0,filePaths:new Set(),weeks:new Set(),modules:{}});return accounts.get(login)};
 const week=d=>{const t=new Date(d);t.setUTCDate(t.getUTCDate()-((t.getUTCDay()+6)%7));return t.toISOString().slice(0,10)};
 prs.forEach(p=>{const a=get(p.author); if(p.merged_at){if(integration(p))a.integrations++;else {a.merged++;a.additions+=p.filtered_additions||0;a.deletions+=p.filtered_deletions||0;for(const f of p.files){if(!f.excluded_from_churn)a.filePaths.add(typeof f==='string'?f:f.filename)}}a.weeks.add(week(p.merged_at));if(!integration(p))for(const m of modules(p))a.modules[m]=(a.modules[m]||0)+1;}else if(p.state==='open'){a.open++;a.weeks.add(week(p.created_at))}});
 commits.forEach(c=>{const a=get(c.author);a.isBot=a.isBot||isAutomation(c);a.unlinked=a.unlinked||c.identity_basis==='git_name_unlinked';if(c.is_root_import)a.rootImports++;else if(c.parents?.length>1)a.mergeCommits++;else a.commits++;a.weeks.add(week(c.date));});
 reviews.forEach(r=>{const a=get(asLogin(r.user||r.author));a.reviews++;a.weeks.add(week(r.submitted_at||r.date));});
 return {prs,commits,reviews,people:[...accounts.values()].map(a=>({...a,activeWeeks:a.weeks.size,filesTouched:a.filePaths.size})).sort((a,b)=>b.commits-a.commits||b.merged-a.merged),merged:prs.filter(p=>p.merged_at&&!integration(p)),integrations:prs.filter(p=>p.merged_at&&integration(p)),nonmerge:commits.filter(c=>!(c.parents?.length>1)&&!c.is_root_import)};
}
export const safeURL = x => /^https:\/\/github\.com\//.test(x||'')?x:'#';
export const escapeHTML = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const csvCell = s => '"'+String(s??'').replace(/^(?=[\s]*[=+@-]|[\t\r\n])/,'\'').replaceAll('"','""')+'"';
