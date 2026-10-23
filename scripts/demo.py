"""Generate deterministic fictional data. No GitHub requests or real identities."""
import json
from pathlib import Path
from datetime import datetime,timedelta,timezone
ROOT=Path(__file__).resolve().parents[1]
people=['demo-alex','demo-jordan','demo-morgan','demo-riley','demo-sam']
end=datetime(2026,6,30,18,tzinfo=timezone.utc)
def date(days):return (end-timedelta(days=days)).isoformat().replace('+00:00','Z')
commits=[]
for i in range(180):
 person=people[(i*i+3*i)//2%5]
 commits.append(dict(sha=f'{i+1:040x}',author=person,date=date(i%60),message=['Improve navigation','Add API validation','Document setup','Cover an edge case','Polish settings'][i%5],parents=[{'sha':f'{i:040x}'}],identity_basis='github_login',is_bot=False,is_root_import=False,url=''))
prs=[];reviews=[]
for i in range(1,36):
 author=people[i%5];merged=i<29;created=date(60-i)
 files=[dict(filename=['src/navigation.ts','server/api.py','docs/setup.md','tests/settings.test.js','infra/service.yml'][i%5],additions=i*3,deletions=i,excluded_from_churn=False)]
 prs.append(dict(number=i,author=author,title=['Improve keyboard navigation','Validate API requests','Make onboarding clearer','Cover settings edge cases','Simplify deployment'][i%5],body='Fictional example activity for the Contribution Atlas demo. No real project records are included.',created_at=created,updated_at=date(35-i),merged_at=date(35-i) if merged else None,state='closed' if merged or i==29 else 'open',files=files,filtered_additions=i*3,filtered_deletions=i,is_integration=i==28,url=''))
 if i<31:
  reviews.append(dict(id=i,pr_number=i,pr_author=author,user={'login':people[(i+1)%5]},submitted_at=date(35-i),state='APPROVED'))
reviews.append({**reviews[0],'id':100,'submitted_at':date(1)})
data=dict(schema_version=1,demo=True,generated_at=date(0),repository={'full_name':'demo-team/northstar','default_branch':'main'},config={'title':'Contribution Atlas · Demo','accounts':people},coverage={'reviews_complete':True,'history_note':'Fictional demo snapshot: all names, dates, commits and pull requests are synthetic. Replace it with your own read-only GitHub snapshot.'},commits=commits,prs=prs,reviews=reviews)
(ROOT/'public/data.json').write_text(json.dumps(data,indent=2)+'\n')
print('Generated fictional demo: 180 commits, 35 PRs, 31 raw reviews.')
