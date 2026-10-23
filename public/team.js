import {isAutomation} from './engine.js';
export let MAIN_ACCOUNTS=[];
const login=x=>typeof x==='string'?x:x?.login||'';
const human=x=>x.is_human!==false&&!isAutomation({...x,author:login(x.author||x.user)}) && (x.author||x.user)?.type!=='Bot';
export function teamData(data){
 const configured=data.config?.accounts||[];
 const candidates=configured.length?configured:[...data.prs,...data.commits,...data.reviews].filter(x=>human(x)&&!/unresolved|unlinked/.test(x.identity_basis||'')).map(x=>login(x.author||x.user));
 // GitHub logins are case-insensitive. Preserve a single display spelling,
 // preferring the configured spelling, across filters and both score views.
 const canonical=new Map();
 for(const name of candidates){if(typeof name==='string'&&name&&!isAutomation(name)&&!canonical.has(name.toLowerCase()))canonical.set(name.toLowerCase(),name);}
 MAIN_ACCOUNTS=[...canonical.values()].sort();
 const nameOf=x=>canonical.get(login(x).toLowerCase())||login(x);
 const keep=x=>human(x)&&canonical.has(login(x.author||x.user).toLowerCase())&&!/unresolved|unlinked/.test(x.identity_basis||'');
 return {...data,commits:data.commits.filter(keep).map(c=>({...c,author:nameOf(c.author)})),prs:data.prs.filter(keep).map(p=>({...p,author:nameOf(p.author)})),reviews:data.reviews.filter(keep).map(r=>({...r,author:nameOf(r.author||r.user),user:{...typeof r.user==='object'?r.user:{},login:nameOf(r.author||r.user)},pr_author:nameOf(data.prs.find(p=>Number(p.number)===Number(r.pr_number))?.author||r.pr_author)}))};
}
