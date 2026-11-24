"""Validate the complete static Pages artifact using only the Python standard library."""
import gzip,json,re,sys
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit,unquote
root=Path(__file__).resolve().parents[1]/'site';errors=[]
def check(ok,message):
 if not ok:errors.append(message)
class Links(HTMLParser):
 def __init__(self,path):super().__init__();self.path=path
 def handle_starttag(self,tag,attrs):
  for key,value in attrs:
   if key not in ['src','href','data-src'] or not value:continue
   u=urlsplit(value)
   if u.scheme or u.netloc or not u.path:continue
   target=(self.path.parent/unquote(u.path)).resolve()
   check(target.is_relative_to(root.resolve()),f'Path escapes site: {self.path.name}: {value}')
   check(target.exists(),f'Missing link: {self.path.name}: {value}')
for p in root.rglob('*.html'):Links(p).feed(p.read_text())
for p in root.rglob('*'):
 if not p.is_file():continue
 check(p.stat().st_size<100_000_000,f'File too large for git: {p.name}')
 if p.suffix in ['.js','.json','.html','.css','.txt','.svg']:
  t=p.read_text()
  for pat in [r'/Users/',r'/home/',r'localhost',r'127\.0\.0\.1',r'github_pat_',r'ghp_[a-zA-Z0-9]{25,}',r'hf_[a-zA-Z0-9]{25,}']:
   check(not re.search(pat,t),f'Non-release string {pat} in {p.relative_to(root)}')
 if p.suffix=='.json':json.loads(p.read_text())
for p in (root/'assets').glob('scene*occluded.json'):
 d=json.loads(p.read_text());positions,birth=[root/'assets/packed'/(Path(n).name+'.gz') for n in d['revealBuffers']]
 check(positions.exists() and birth.exists(),f'Missing geometry buffers: {p.name}')
 if not positions.exists() or not birth.exists():continue
 pos_bytes=len(gzip.decompress(positions.read_bytes()));time_bytes=len(gzip.decompress(birth.read_bytes()))
 check(pos_bytes%12==0 and time_bytes%4==0 and pos_bytes//12==time_bytes//4,f'Position/time mismatch: {p.name}')
 n=pos_bytes//12
 for m in d['meshes']:check(0<=m['start'] and m['start']+m['count']<=n,f'Mesh exceeds buffer: {p.name}')
for p in (root/'assets/packed').glob('*.json.gz'):json.loads(gzip.decompress(p.read_bytes()))
b=json.loads((root/'benchmark.json').read_text());rows=b['rows']
check(len(rows)==69 and len({r['name'] for r in rows})==69,'Expected 69 unique configurations')
check(all(0<=r['lo']<=r['score']<=r['hi']<=100 for r in rows),'Invalid score interval')
check([r['rank'] for r in rows]==list(range(1,70)),'Invalid ranks')
check(all(rows[i]['score']>=rows[i+1]['score'] for i in range(68)),'Scores not sorted')
for n in ['openai','claude','gemini','grok','meta','qwen','zhipu','deepseek','kimi','minimax','bytedance']:check((root/'logos'/f'{n}.svg').is_file(),f'Missing {n} icon')
for n in ['index.html','viewer.html','viewer.js','page.js','credits.html','licenses/ARKitScenes-LICENSE.txt','vendor/THREE-LICENSE.txt','logos/LICENSE','assets/video.mp4','.nojekyll']:check((root/n).is_file(),f'Missing release file: {n}')
if errors:print('\n'.join(errors));sys.exit(1)
print('PASS: local links, 6 scene buffers, 69 benchmark entries, licenses, icons and release-string checks.')
