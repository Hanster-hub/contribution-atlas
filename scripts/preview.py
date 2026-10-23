"""Produce self-contained demo HTML for offline previews and screenshots."""
from pathlib import Path
import json,re
root=Path(__file__).resolve().parents[1];p=root/'public'
html=(p/'index.html').read_text().replace('<link rel="stylesheet" href="styles.css">','<style>'+(p/'styles.css').read_text()+'</style>')
script=(root/'scripts/demo-data.mjs').read_text().replace('export ','')+'\n'
for name in ['scoring.js','engine.js','team.js','app.js']:
 s=(p/name).read_text()
 s=re.sub(r'^import .*?;\n','',s,flags=re.M)
 s=s.replace('export ','')
 if name=='team.js':s=s.replace('const login=', 'const teamLogin=').replace('login(', 'teamLogin(')
 if name=='app.js':
  s='const e=escapeHTML;\n'+s
  s=s.replace("try{const res=await fetch('./data.json',{cache:'no-cache'});if(!res.ok)throw Error('No packaged snapshot found');setup(await res.json())}", 'try{setup(demoData())}')
 script+=s+'\n'
html=html.replace('<script type="module" src="app.js"></script>','<script type="module">'+script.replace('</script','<\\/script')+'</script>')
(root/'dist/demo.html').write_text(html)
print('Wrote dist/demo.html')
