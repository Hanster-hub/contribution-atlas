import './scoring.js';
import {teamData,MAIN_ACCOUNTS} from './team.js';
import {isAutomation,validateSnapshot,normalize,analyze,integration,modules,asLogin,escapeHTML as e,safeURL,csvCell} from './engine.js';
let gamePeriod='lifetime',gameCategory='all',gameSelected='';
let data=null,view=null,tab='merged',limit=20;const $=s=>document.querySelector(s), num=n=>Number(n||0).toLocaleString('en-US');
const colors=['#e1ead8','#e3e9ed','#eee4d7','#e5e2ec','#d9ebe4'];
function inform(msg){$('#load-error').hidden=false;$('#load-error').textContent=msg;}
function fmt(d){return d?new Date(d).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}):'Not available'}
function setup(raw){
 validateSnapshot(raw);
 tab='merged';limit=20;gameSelected='';$('#search').value='';document.querySelectorAll('[data-state]').forEach(b=>b.classList.toggle('active',b.dataset.state===tab));
 data=teamData(normalize(raw)); document.title=(raw.config?.title||'Contribution Atlas')+' · Tracking & Game'; $('.breadcrumb').textContent=data.repository.full_name||'Contribution Atlas'; $('.aside-bottom small').textContent=data.repository.full_name||'Repository'; $('.sync-status').textContent=raw.demo?'Fictional demo · no live data':'Snapshot · '+(raw.generated_at||'');$('#load-error').hidden=true;$('#export').disabled=false;
 const dates=[...data.commits.map(c=>c.date),...data.prs.map(p=>p.merged_at||p.created_at),...data.reviews.map(r=>r.submitted_at||r.date)].filter(Boolean).map(d=>d.slice(0,10)).sort();const earliest=dates[0]||data.repository.created_at?.slice(0,10)||'';
 const latest=dates.at(-1)||'';$('#from').value=earliest;$('#to').value=(data.generated_at||new Date().toISOString()).slice(0,10);$('#from').min=earliest;
 const people=MAIN_ACCOUNTS;
 $('#person').innerHTML='<option value="all">Everyone</option>'+people.map(p=>`<option>${e(p)}</option>`).join('');
 $('#history-label').textContent='Preserved repository history';$('#history-detail').textContent=`${fmt(earliest)} → ${fmt(latest)} · default branch: ${data.repository.default_branch||'master'}`;
 $('#snapshot').textContent='Updated '+new Date(data.generated_at).toISOString().slice(0,16).replace('T',' ')+' UTC';$('#generated').textContent='Snapshot '+new Date(data.generated_at).toISOString().slice(0,16).replace('T',' ')+' UTC';
 $('#coverage').textContent=raw.coverage?.history_note||'Default-branch reachable commits are counted once by SHA. Configured imports, merge commits and integration bundles are excluded from XP.';
 $('#coverage-notes').textContent='';
 renderGame();
 render();
}
function render(){
 if(!data)return;const from=$('#from').value,to=$('#to').value;
 if(from&&to&&from>to){inform('The start date must be on or before the end date.');return;}$('#load-error').hidden=true;
 view=analyze(data,from,to,$('#person').value);const linked=new Set(data.prs.map(p=>p.author).concat(data.commits.filter(c=>c.identity_basis==='github_login').map(c=>c.author)));const humans=view.people.filter(p=>!p.isBot&&!isAutomation(p.login)&&linked.has(p.login));
 const kpis=[['GitHub contributors',humans.length,'Main GitHub accounts','◉'],['Non-merge commits',view.nonmerge.length,'Unique SHA · excludes root import','↗'],['Merged PRs',view.merged.length,'Excludes detected integration bundles','⑂'],['Integration PRs',view.integrations.length,'Release / bundled work, separate','◫']];
 $('#kpis').innerHTML=kpis.map(([l,v,s,i])=>`<article class="kpi"><div class="klabel">${l}</div><div class="kicon">${i}</div><div class="kvalue">${num(v)}</div><div class="ksub">${s}</div></article>`).join('');
 const weeks={};view.nonmerge.forEach(c=>{const d=new Date(c.date);d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));const w=d.toISOString().slice(0,10);weeks[w]=(weeks[w]||0)+1});
 const keys=Object.keys(weeks).sort();if(keys.length){let d=new Date(keys[0]);const end=new Date(keys.at(-1));while(d<=end){const k=d.toISOString().slice(0,10);weeks[k]??=0;d.setUTCDate(d.getUTCDate()+7)}}
 const wk=Object.keys(weeks).sort(),max=Math.max(1,...Object.values(weeks));
 $('#timeline').innerHTML=wk.length?`<div class="chart-y"><span>${num(max)}</span><span>${num(Math.round(max/2))}</span><span>0</span></div><div class="bars">${wk.map((w,i)=>`<div class="barcol"><div class="bar" style="height:${Math.max(1,weeks[w]/max*100)}%" title="Week ${w}: ${weeks[w]} commits" role="img" aria-label="Week ${w}: ${weeks[w]} non-merge commits"></div>${i%Math.max(1,Math.ceil(wk.length/5))===0?`<span class="tick">${new Date(w).toLocaleDateString('en-GB',{day:'numeric',month:'short',timeZone:'UTC'})}</span>`:''}</div>`).join('')}</div>`:'<div class="empty">No commits in this selection.</div>';
 const mods={};view.merged.forEach(p=>modules(p).forEach(m=>mods[m]=(mods[m]||0)+1));const entries=Object.entries(mods).sort((a,b)=>b[1]-a[1]).slice(0,5),mx=Math.max(1,...Object.values(mods));
 $('#modules').innerHTML=entries.map(([m,n])=>`<div class="module-row"><div class="module-text"><span>${e(m)}</span><b>${num(n)}</b></div><div class="track"><div class="fill" style="width:${n/mx*100}%"></div></div></div>`).join('')||'<div class="empty">No merged work in this selection.</div>';
 $('#people').innerHTML=view.people.map((p,i)=>`<tr><td><button class="person-btn" data-person="${e(p.login)}"><span class="avatar" style="background:${colors[i%colors.length]}">${e(p.login.slice(0,2).toUpperCase())}</span><span>${e(p.login)}<div class="person-sub">${p.isBot||isAutomation(p.login)?'Automation identity':!linked.has(p.login)?'Unlinked git identity':'GitHub account'}</div></span></button></td><td>${num(p.commits)}</td><td>${num(p.merged)}</td><td>${num(p.integrations)}</td><td>${data.coverage?.reviews_complete===false?'≥ ':''}${num(p.reviews)}</td><td>${p.activeWeeks}</td><td>${num(p.filesTouched)}</td><td><span class="churn-add">+${num(p.additions)}</span><br><span class="churn-del">−${num(p.deletions)}</span></td><td>${Object.entries(p.modules).sort((a,b)=>b[1]-a[1]).slice(0,2).map(([m])=>`<span class="tag">${e(m)}</span>`).join('')||'—'}</td></tr>`).join('')||'<tr><td colspan="9" class="empty">No activity in this selection.</td></tr>';
 document.querySelectorAll('[data-person]').forEach(b=>b.onclick=()=>{$('#person').value=b.dataset.person;limit=20;render();$('#evidence').scrollIntoView({behavior:'smooth'})});
 renderLedger();
}
function summary(p){
 if(p.impact_summary)return p.impact_summary.replace(/ (Open PR;.*|Merged PR;.*|Merged release bundle;.*)$/,'');
 const lines=(p.body||'').split('\n').map(l=>l.trim()).filter(l=>l&&!/^#|^[-*] \[|^\||^```|^🤖|^Co-authored|^https?:/i.test(l));
 const t=lines.find(l=>l.length>35)||'';return t.replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/[*`]/g,'').slice(0,240)+(t.length>240?'…':'');
}
function renderLedger(){
 if(!view)return;const q=$('#search').value.toLowerCase();
 const matches=view.prs.filter(p=>tab==='integration'?p.merged_at&&integration(p):tab==='open'?p.state==='open':tab==='closed'?p.state==='closed'&&!p.merged_at:p.merged_at&&!integration(p)).filter(p=>(p.title+' '+p.author+' '+modules(p).join(' ')).toLowerCase().includes(q)).sort((a,b)=>(b.merged_at||b.created_at||'').localeCompare(a.merged_at||a.created_at||''));
 $('#evidence-count').textContent=`${num(matches.length)} records`;
 $('#ledger').innerHTML=matches.slice(0,limit).map(p=>`<article class="evidence-card"><div class="evidence-meta"><b>#${p.number}</b><span>${e(fmt(p.merged_at||p.created_at))}</span><span>${e(p.author)}</span></div><div><h3><a href="${e(safeURL(p.url))}" target="_blank" rel="noopener noreferrer">${e(p.title)}</a></h3><div>${modules(p).map(m=>`<span class="tag">${e(m)}</span>`).join('')}</div>${summary(p)?`<p>${e(summary(p))}</p>`:''}<div class="evidence-status">${p.merged_at?'Merged':p.state==='closed'?'Closed':'Open'}${integration(p)?' · Release bundle':''}</div></div><a class="evidence-arrow" href="${e(safeURL(p.url))}" target="_blank" rel="noopener noreferrer" aria-label="Open PR ${p.number}">↗</a></article>`).join('')||'<div class="empty panel">No matching evidence. Try another contributor, date range or search.</div>';
 $('#more').hidden=matches.length<=limit;
}
$('#from').onchange=$('#to').onchange=$('#person').onchange=()=>{limit=20;render()};$('#search').oninput=()=>{limit=20;renderLedger()};$('#reset').onclick=()=>{if(data)setup(data)};$('#more').onclick=()=>{limit+=20;renderLedger()};
 document.querySelectorAll('[data-state]').forEach(b=>b.onclick=()=>{tab=b.dataset.state;limit=20;document.querySelectorAll('[data-state]').forEach(c=>c.classList.toggle('active',c===b));renderLedger()});
$('#import').onclick=()=>$('#file').click();$('#file').onchange=async ev=>{try{const f=ev.target.files[0];if(!f)return;if(f.size>100*1024*1024)throw Error('Snapshot is too large (100 MB maximum).');setup(JSON.parse(await f.text()));$('#snapshot').textContent='Imported · '+fmt(data.generated_at)}catch(err){inform('Could not import snapshot: '+err.message)}finally{ev.target.value=''}};
$('#export').onclick=()=>{if(!view)return;const cols=['contributor','non_merge_commits','merged_prs_excluding_integration_candidates','integration_prs','collected_reviews','active_weeks','unique_filtered_pr_paths','filtered_pr_additions','filtered_pr_deletions','root_imports'];const rows=view.people.map(p=>[p.login,p.commits,p.merged,p.integrations,p.reviews,p.activeWeeks,p.filesTouched,p.additions,p.deletions,p.rootImports]);const blob=new Blob(['\uFEFF'+[cols,...rows].map(r=>r.map(csvCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='contributions-'+(data.generated_at||'snapshot').slice(0,10)+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
try{const res=await fetch('./data.json',{cache:'no-cache'});if(!res.ok)throw Error('No packaged snapshot found');setup(await res.json())}catch(err){inform('No snapshot loaded yet. Import a collected Contribution Atlas JSON file to begin.');$('#snapshot').textContent='Awaiting snapshot';$('#history-detail').textContent='No data loaded';$('#export').disabled=true;}


function renderGame(){
 if(!data)return;const S=window.Scoring,r=S.analyze(data),accounts=MAIN_ACCOUNTS.map(handle=>r.accounts.find(p=>p.handle===handle)||{handle,lifetime:{commits:0,merged:0,unmerged:0,reviews:0},week:{commits:0,merged:0,unmerged:0,reviews:0}});
 const points=p=>{const c=p[gamePeriod];return gameCategory==='commits'?c.commits*2:gameCategory==='prs'?c.merged*20+c.unmerged*2:gameCategory==='reviews'?c.reviews*5:S.total(c)};
 const sorted=accounts.sort((a,b)=>points(b)-points(a)||a.handle.localeCompare(b.handle));
 $('#game-window').textContent=gamePeriod==='week'?`${r.start.slice(0,10)} – ${r.end.slice(0,10)} UTC`:'Full preserved history';
 $('#game-board').innerHTML=sorted.map((p,i)=>`<button class="game-row ${p.handle===gameSelected?'selected':''}" data-player="${e(p.handle)}"><span class="game-position">${String(sorted.findIndex(x=>points(x)===points(p))+1).padStart(2,'0')}</span><span class="avatar">${e(p.handle.slice(0,2).toUpperCase())}</span><span class="game-name"><b>${e(p.handle)}</b><small>${S.rank(S.total(p.lifetime))}</small></span><strong>${num(points(p))}<small> XP</small></strong></button>`).join('');
 if(!accounts.length){$('#game-profile').innerHTML='<h2>No eligible accounts yet</h2><p>Collect a repository snapshot or adjust the account filter.</p>';$('#rank-ladder').innerHTML=S.ranks.map(([n,x])=>`<div><strong>${n}</strong><span>${num(x)} XP</span></div>`).join('');return;}
 const p=accounts.find(p=>p.handle===gameSelected)||accounts[0],xp=S.total(p.lifetime),idx=S.ranks.findIndex(x=>x[0]===S.rank(xp)),base=S.ranks[idx][1],next=S.ranks[idx+1],progress=next?(xp-base)/(next[1]-base)*100:100,c=p[gamePeriod];
 $('#game-profile').innerHTML=`<span class="eyebrow">PLAYER PROFILE</span><h2>${e(p.handle)}</h2><span class="rank-title">${S.rank(xp)}</span><div class="xp-total">${num(xp)} <small>XP · all time</small></div><div class="track"><div class="fill" style="width:${progress}%"></div></div><p class="subtext">${next?`${num(next[1]-xp)} XP to ${next[0]}`:'Highest rank reached'}</p><h3>Score breakdown</h3><dl class="score-breakdown"><div><dt>Commits · ${num(c.commits)} × 2</dt><dd>${num(c.commits*2)}</dd></div><div><dt>Merged PRs · ${num(c.merged)} × 20</dt><dd>${num(c.merged*20)}</dd></div><div><dt>Unmerged PRs · ${num(c.unmerged)} × 2</dt><dd>${num(c.unmerged*2)}</dd></div><div><dt>Reviewed PRs · ${num(c.reviews)} × 5</dt><dd>${num(c.reviews*5)}</dd></div></dl>`;
 $('#rank-ladder').innerHTML=S.ranks.map(([name,x])=>`<div><strong>${name}</strong><span>${num(x)} XP</span></div>`).join('');
 document.querySelectorAll('[data-player]').forEach(b=>b.onclick=()=>{gameSelected=b.dataset.player;renderGame()});
}
function setMode(mode){const game=mode==='game';$('#tracking-view').hidden=game;$('#game-view').hidden=!game;document.querySelectorAll('[data-mode]').forEach(b=>{b.classList.toggle('active',b.dataset.mode===mode);b.setAttribute('aria-pressed',String(b.dataset.mode===mode))});$('#tracking-nav').hidden=game;$('#export').hidden=game;location.hash=game?'game':'tracking';if(game)renderGame();}
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
document.querySelectorAll('[data-game-period]').forEach(b=>b.onclick=()=>{gamePeriod=b.dataset.gamePeriod;document.querySelectorAll('[data-game-period]').forEach(x=>x.classList.toggle('active',x===b));renderGame()});
$('#game-category').onchange=ev=>{gameCategory=ev.target.value;renderGame()};
setMode(new URLSearchParams(location.search).get('mode')==='game'||location.hash==='#game'?'game':'tracking');

window.addEventListener('hashchange',()=>{const mode=location.hash==='#game'?'game':'tracking'; if(document.querySelector('#game-view').hidden===(mode==='game'))setMode(mode);});
