const $=s=>document.querySelector(s),video=$('#video'),frames=[...document.querySelectorAll('iframe')];
const broadcast=d=>frames.filter(f=>f.hasAttribute('src')).forEach(f=>f.contentWindow?.postMessage(d,location.origin));
let condition='C0',scan=false,reveal=true;
function clock(t){return `${String(Math.floor(t/60)).padStart(2,'0')}:${String(Math.floor(t%60)).padStart(2,'0')}`}
function tick(t){broadcast({type:'clock',time:t});$('#time').value=t;$('#clock').textContent=clock(t)}
video.addEventListener('loadedmetadata',()=>{video.currentTime=18;$('#time').max=video.duration;});
video.addEventListener('seeked',()=>tick(video.currentTime));
if(video.requestVideoFrameCallback){const next=(_,m)=>{tick(m.mediaTime);video.requestVideoFrameCallback(next)};video.requestVideoFrameCallback(next)}else video.addEventListener('timeupdate',()=>tick(video.currentTime));
function togglePlay(){if(video.paused)video.play().catch(()=>{$('#play').textContent='▶ Try play'});else video.pause()}
$('#play').onclick=$('#start').onclick=togglePlay;
video.addEventListener('play',()=>{$('#play').textContent='Ⅱ Pause';$('#start').textContent='Ⅱ'});video.addEventListener('pause',()=>{$('#play').textContent='▶ Play';$('#start').textContent='▶'});
$('#time').oninput=e=>{video.currentTime=+e.target.value};
$('#restart').onclick=()=>{video.currentTime=0;video.play().catch(()=>{})};
$('#reset').onclick=()=>broadcast({type:'reset'});
$('#reveal').onchange=e=>{reveal=e.target.checked;broadcast({type:'reveal',value:reveal})};
$('#scan').onclick=()=>{scan=!scan;if(scan)video.pause();$('#scan').setAttribute('aria-pressed',scan);$('#scan-near').setAttribute('aria-pressed',scan);$('#scan-near').textContent=scan?'Back to reconstruction':'Compare with laser scan';$('#scan').innerHTML=scan?'Back to reconstruction <span>↘</span>':'Compare with laser scan <span>↗</span>';$('#scan-compare').hidden=!scan;$('#reveal').disabled=scan;broadcast({type:'scan',value:scan});};
$('#scan-split').oninput=e=>broadcast({type:'scan-split',value:+e.target.value/100});

function setCondition(id){condition=id;document.querySelectorAll('[data-condition]').forEach(b=>b.classList.toggle('active',b.dataset.condition===id));const f=frames.find(f=>f.hasAttribute('src'));if(f){f.dataset.condition=id;f.contentWindow.postMessage({type:'condition',value:id},location.origin)}}
document.querySelectorAll('[data-condition]').forEach(b=>b.onclick=()=>setCondition(b.dataset.condition));
const narrow=matchMedia('(max-width:700px)');let mobileIndex=0,viewportVisible=true;
function launch(i){const f=frames[i];if(!f||f.hasAttribute('src'))return;f.dataset.condition=condition;f.src=f.dataset.src+'&condition='+condition;}
function mobileSelect(i){mobileIndex=i;frames.forEach((f,j)=>{f.closest('article').classList.toggle('mobile-current',j===i);if(narrow.matches&&j!==i){f.removeAttribute('src');}});document.querySelectorAll('[data-mobile]').forEach(b=>b.classList.toggle('active',+b.dataset.mobile===i));launch(i);}
document.querySelectorAll('[data-mobile]').forEach(b=>b.onclick=()=>mobileSelect(+b.dataset.mobile));
window.addEventListener('message',e=>{if(e.origin!==location.origin)return;const i=frames.findIndex(f=>f.contentWindow===e.source);if(i<0)return;if(e.data.type==='viewer-ready'){for(const d of [{type:'clock',time:video.currentTime||18},{type:'scan',value:scan},{type:'scan-split',value:+$('#scan-split').value/100},{type:'reveal',value:reveal},{type:'visibility',value:viewportVisible}])e.source.postMessage(d,location.origin);}if(['scene-loaded','scene-failed'].includes(e.data.type)&&!narrow.matches){const next=frames.find(f=>f.hasAttribute('src')&&f.dataset.condition!==condition);if(next){next.dataset.condition=condition;next.contentWindow.postMessage({type:'condition',value:condition},location.origin)}else launch(i+1);}});
new IntersectionObserver(entries=>{viewportVisible=entries[0].isIntersecting;broadcast({type:'visibility',value:viewportVisible});},{rootMargin:'100px'}).observe($('.triptych'));
narrow.addEventListener('change',()=>{if(narrow.matches)mobileSelect(mobileIndex);else frames.forEach((_,i)=>launch(i));});
mobileSelect(0);
const data=await fetch('benchmark.json').then(r=>r.json());
function family(n){return ['GPT','Claude','Gemini','Grok','Muse','Qwen','GLM','DeepSeek','Kimi','MiniMax','Seed'].find(f=>n.startsWith(f))||n.split(' ')[0]}
function brand(n){return ({GPT:'openai',Claude:'claude',Gemini:'gemini',Grok:'grok',Muse:'meta',Qwen:'qwen',GLM:'zhipu',DeepSeek:'deepseek',Kimi:'kimi',MiniMax:'minimax',Seed:'bytedance'})[family(n)]||'openai'}
const colors=['#c9ddbc','#d8b589','#9dc8d6','#b7b1dc','#dcaeaf','#afcbbb'];
function focus(r,c){$('#leader-focus').innerHTML=`<div class="focus-rank">${String(r.rank).padStart(2,'0')}<small>OF ${data.rows.length}</small></div><div class="focus-name"><span>${r.source_label.toUpperCase()}</span><h3><img class="focus-logo" src="logos/${brand(r.name)}.svg" alt="">${r.name}</h3><p>95% confidence interval · ${r.lo}–${r.hi}</p></div><div class="focus-score" style="color:${c}">${r.score.toFixed(1)}<small>GEOMETRIC ACCURACY / 100</small></div>`;$('#detail').textContent=`${r.name} · Rank ${r.rank} of ${data.rows.length} · Mean score ${r.score.toFixed(1)} [${r.lo}, ${r.hi}] · ${r.source_label}${r.n ? ` · ${r.n} rooms` : ""}`;}
function draw(all=false){$('#all').classList.toggle('active',all);$('#families').classList.toggle('active',!all);const used=new Set();const rows=all?data.rows:data.rows.filter(r=>{let f=family(r.name);if(r.featured)return true;if(used.has(f))return false;used.add(f);return true});$('#chart').replaceChildren();for(const [i,r] of rows.entries()){const c=colors[i%colors.length],b=document.createElement('button');b.className='rank-row';b.style.setProperty('--row-color',c);b.setAttribute('aria-label',`${r.name}: score ${r.score}, interval ${r.lo} to ${r.hi}`);b.innerHTML=`<span class="rank-name"><i>${String(r.rank).padStart(2,'0')}</i><strong><img class="brand-logo" src="logos/${brand(r.name)}.svg" alt="">${r.name.split(',')[0]}${r.featured?'<em class="new-tag">NEW</em>':''}</strong><small>${r.name.includes(',')?r.name.split(',').slice(1).join(','):''}${r.featured?` · Our harness · ${r.n} rooms`:''}</small></span><span class="rank-track"><span class="rank-interval" style="left:${r.lo}%;width:${r.hi-r.lo}%"></span><span class="rank-node" style="left:${r.score}%"></span><b style="left:calc(${r.hi}% + 14px)">${r.score.toFixed(1)}</b></span>`;b.onclick=()=>{document.querySelectorAll('.rank-row').forEach(x=>x.classList.remove('selected'));b.classList.add('selected');focus(r,c)};$('#chart').append(b)}focus(rows[0],colors[0]);$('#chart').firstElementChild.classList.add('selected');}
$('#families').onclick=()=>draw(false);$('#all').onclick=()=>draw(true);draw();
const results=[{name:'GPT-6.1 Terra',video:41.1,points:64.8},{name:'GPT-6.1 Sol',video:46.2,points:69.4},{name:'GPT-6 Astra',video:51.4,points:73.1}];
$('#study-bars').innerHTML=results.map(r=>`<div class="study-row"><span>${r.name}</span><div class="study-track"><div class="study-fill" style="width:${r.video}%"></div></div><b>${r.video}</b></div>`).join('');
function study(mode){document.querySelectorAll('[data-study]').forEach(b=>b.classList.toggle('active',b.dataset.study===mode));document.querySelectorAll('.study-row').forEach((row,i)=>{row.querySelector('.study-fill').style.width=results[i][mode]+'%';row.querySelector('b').textContent=results[i][mode].toFixed(1)})}
document.querySelectorAll('[data-study]').forEach(b=>b.onclick=()=>study(b.dataset.study));$('#try-points').onclick=()=>setCondition('C2');

$('#scan-near').onclick=()=>$('#scan').click();
