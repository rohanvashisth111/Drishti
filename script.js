const API_BASE = '/api';

async function apiFetch(path, opts = {}) {
  const token = sessionStorage.getItem('drishti_token') || localStorage.getItem('drishti_token');
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  if (res.status === 401) { doLogout(); throw new Error('Session expired — please sign in again.'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || `Server error ${res.status}`);
  return data;
}

let currentUser = null;
let allAlerts = [];
let filteredAlerts = [];
let activeFilter = 'all';
let _modalAlertId = null;

async function doLogin() {
  const identifier = document.getElementById('l-id').value.trim();
  const password   = document.getElementById('l-pw').value;
  const remember   = document.getElementById('l-remember').checked;
  const errEl = document.getElementById('login-err');
  const btn   = document.getElementById('login-btn');
  errEl.classList.remove('show');

  if (!identifier || !password) {
    errEl.textContent = 'Please enter your phone/email and password.';
    errEl.classList.add('show'); return;
  }

  setLoading(btn, true, 'Signing in…');
  try {
    const data = await apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ identifier, password }) });
    (remember ? localStorage : sessionStorage).setItem('drishti_token', data.token);
    launchDash(data.user);
  } catch(e) {
    errEl.textContent = e.message;
    errEl.classList.add('show');
    setLoading(btn, false, 'Sign In →');
  }
}

async function doSignup() {
  const name     = document.getElementById('s-name').value.trim();
  const phone    = document.getElementById('s-phone').value.trim();
  const email    = document.getElementById('s-email').value.trim();
  const address  = document.getElementById('s-addr').value.trim();
  const password = document.getElementById('s-pw').value;
  const errEl = document.getElementById('signup-err');
  const btn   = document.getElementById('signup-btn');
  errEl.classList.remove('show');

  if (!name || !phone || password.length < 6) {
    errEl.textContent = 'Please fill all required fields (password min 6 chars).';
    errEl.classList.add('show'); return;
  }

  setLoading(btn, true, 'Creating account…');
  try {
    const data = await apiFetch('/auth/signup', { method: 'POST', body: JSON.stringify({ name, phone, email, address, password }) });
    sessionStorage.setItem('drishti_token', data.token);
    launchDash(data.user);
  } catch(e) {
    errEl.textContent = e.message;
    errEl.classList.add('show');
    setLoading(btn, false, 'Create Account →');
  }
}

function doLogout() {
  currentUser = null; allAlerts = [];
  localStorage.removeItem('drishti_token');
  sessionStorage.removeItem('drishti_token');
  showPage('page-login');
}

function setLoading(btn, loading, label) {
  btn.disabled = loading;
  btn.innerHTML = loading ? `<span class="btn-spinner"></span>${label}` : label;
}

async function loadAllAlerts() {
  if (!currentUser) return;
  try {
    const data = await apiFetch('/alerts');
    allAlerts = (Array.isArray(data) ? data : (data.alerts || [])).sort((a,b) => new Date(b.timestamp)-new Date(a.timestamp));
  } catch(e) {
    notify(`Failed to load alerts: ${e.message}`, 'high');
    allAlerts = [];
  }
  filteredAlerts = [...allAlerts];
  const nc = document.getElementById('alert-count-nav');
  if (nc) nc.textContent = allAlerts.filter(a=>!a.acknowledged).length;
  updateStats(); renderLiveFeed(); renderDetBars(); renderHeatmap(); renderTrendChart(); renderTimeline(); renderAlertsTable();
}

async function ackAlert(id, btn) {
  const a = allAlerts.find(x=>x.id===id);
  if (!a || a.acknowledged) return;
  try {
    await apiFetch(`/alerts/${id}/acknowledge`, { method:'POST' });
    a.acknowledged = true; a.acknowledged_at = new Date().toISOString();
    if (btn) { btn.textContent='Acknowledged'; btn.classList.add('done'); }
    const nc = document.getElementById('alert-count-nav');
    if (nc) nc.textContent = allAlerts.filter(x=>!x.acknowledged).length;
    notify(`Acknowledged: ${a.extra.label}`, 'ok');
    renderAlertsTable();
  } catch(e) { notify(`Acknowledge failed: ${e.message}`, 'high'); }
}

async function saveProfile() {
  const name=document.getElementById('pf-name').value.trim(), phone=document.getElementById('pf-phone').value.trim(), address=document.getElementById('pf-addr').value.trim();
  try {
    await apiFetch('/user/profile', { method:'PUT', body:JSON.stringify({name,phone,address}) });
    currentUser.name=name; currentUser.phone=phone; currentUser.address=address;
    document.getElementById('profile-name-disp').textContent=name;
    document.getElementById('profile-phone-disp').textContent=phone;
    document.getElementById('topbar-name').textContent=name.split(' ')[0];
    document.getElementById('topbar-avatar').textContent=name[0].toUpperCase();
    notify('Profile saved ✓','ok');
  } catch(e) { notify(e.message,'high'); }
}

async function changePassword() {
  const cur=document.getElementById('pf-pw-cur').value, nw=document.getElementById('pf-pw-new').value, con=document.getElementById('pf-pw-con').value;
  if (!cur||nw.length<6){notify('Fill all fields (min 6 chars).','high');return;}
  if (nw!==con){notify('Passwords do not match.','high');return;}
  try {
    await apiFetch('/user/change-password',{method:'POST',body:JSON.stringify({currentPassword:cur,newPassword:nw})});
    notify('Password updated ✓','ok');
    ['pf-pw-cur','pf-pw-new','pf-pw-con'].forEach(id=>document.getElementById(id).value='');
  } catch(e){notify(e.message,'high');}
}

async function saveEmergencyContact() {
  const phone=document.getElementById('pf-ec').value.trim();
  if (!phone){notify('Enter a phone number.','high');return;}
  try {
    await apiFetch('/user/emergency-contact',{method:'PUT',body:JSON.stringify({phone})});
    notify('Emergency contact saved ✓','ok');
  } catch(e){notify(e.message,'high');}
}

const AI_BASE = API_BASE;

async function aiFetch(path, body) {
  const token = sessionStorage.getItem('drishti_token') || localStorage.getItem('drishti_token');
  const res = await fetch(`${AI_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || `AI service error ${res.status}`);
  return data;
}

function updateAISummary(text, level) {
  const el = document.getElementById('ai-summary-text');
  if (el) { el.textContent = text; el.classList.remove('loading'); }
  const colors = { LOW:'rgba(59,130,246,.2)', MEDIUM:'rgba(249,115,22,.3)', HIGH:'rgba(239,68,68,.35)', CRITICAL:'rgba(239,68,68,.5)' };
  const p = document.getElementById('ai-summary-panel');
  if (p && level) p.style.borderColor = colors[level] || colors.LOW;
}

function updateAIBlock(id, text) {
  const el = document.getElementById(id);
  if (el) { el.textContent = text; el.style.fontStyle = 'normal'; el.style.color = 'var(--dim)'; }
}

async function requestAISummary() {
  updateAISummary('⏳ Generating summary…');
  updateAIBlock('ai-threat-text', '⏳ Generating…');
  try {
    const res = await aiFetch('/ai/summary', { alerts: allAlerts, user: currentUser });
    updateAISummary(res.text, res.riskLevel);
    updateAIBlock('ai-threat-text', res.text);
  } catch(e) {
    updateAISummary('Failed to generate summary. Check your AI endpoint.');
    updateAIBlock('ai-threat-text', `Error: ${e.message}`);
    notify(`AI Summary: ${e.message}`, 'high');
  }
}

async function requestAIPatterns() {
  updateAIBlock('ai-pattern-text', '⏳ Detecting patterns…');
  try {
    const res = await aiFetch('/ai/patterns', { alerts: allAlerts });
    updateAIBlock('ai-pattern-text', res.text);
  } catch(e) {
    updateAIBlock('ai-pattern-text', `Error: ${e.message}`);
    notify(`AI Patterns: ${e.message}`, 'high');
  }
}

async function requestAIRecommendations() {
  updateAIBlock('ai-rec-text', '⏳ Generating recommendations…');
  try {
    const res = await aiFetch('/ai/recommendations', { alerts: allAlerts, user: currentUser });
    updateAIBlock('ai-rec-text', res.text);
  } catch(e) {
    updateAIBlock('ai-rec-text', `Error: ${e.message}`);
    notify(`AI Recommendations: ${e.message}`, 'high');
  }
}

async function askAI() {
  const q = document.getElementById('ai-question').value.trim();
  if (!q) return;
  const el = document.getElementById('ai-answer');
  el.textContent = '⏳ Thinking…'; el.style.color = 'var(--muted)';
  try {
    const res = await aiFetch('/ai/ask', { question: q, alerts: allAlerts, user: currentUser });
    el.textContent = res.text;
    el.style.color = 'var(--dim)';
  } catch(e) {
    el.textContent = `Error: ${e.message}`;
    el.style.color = 'var(--muted)';
    notify(`AI Ask: ${e.message}`, 'high');
  }
}

async function analyzeAlert() {
  const a = allAlerts.find(x => x.id === _modalAlertId);
  if (!a) return;
  const box = document.getElementById('modal-ai-box');
  const txt = document.getElementById('modal-ai-text');
  const btn = document.getElementById('modal-analyze-btn');
  box.style.display = 'block';
  txt.textContent = '⏳ Analyzing threat context…';
  btn.disabled = true;
  try {
    const res = await aiFetch('/ai/analyze-alert', { alert: a, recentAlerts: allAlerts.slice(0, 20) });
    txt.textContent = res.text;
  } catch(e) {
    txt.textContent = `Error: ${e.message}`;
    notify(`AI Analysis: ${e.message}`, 'high');
  } finally {
    btn.disabled = false;
  }
}

function runAllAI() {
  requestAISummary();
  requestAIPatterns();
  requestAIRecommendations();
  notify('Running all AI analysis…', 'info');
}

function launchDash(user) {
  currentUser = user;
  const av = user.name[0].toUpperCase();
  ['topbar-avatar','profile-av'].forEach(id=>{ const el=document.getElementById(id); if(el) el.textContent=av; });
  document.getElementById('topbar-name').textContent = user.name.split(' ')[0];
  document.getElementById('profile-name-disp').textContent = user.name;
  document.getElementById('profile-phone-disp').textContent = user.phone;
  document.getElementById('pf-name').value = user.name;
  document.getElementById('pf-phone').value = user.phone;
  document.getElementById('pf-addr').value = user.address || '';
  if (user.emergency_contact) document.getElementById('pf-ec').value = user.emergency_contact;
  setGreeting();
  showPage('page-dash');
  buildCamGrid();
  loadAllAlerts();
  setTimeout(()=>notify('System online — AI scanning active 🟢','ok'), 1500);
}

window.addEventListener('load', () => {
  setTimeout(()=>{ const ld=document.getElementById('loader'); ld.style.opacity='0'; ld.style.transition='opacity .5s'; setTimeout(()=>ld.style.display='none',500); }, 2000);
  setGreeting();
  const token = localStorage.getItem('drishti_token') || sessionStorage.getItem('drishti_token');
  if (!token) return;
  apiFetch('/auth/me').then(d=>launchDash(d.user)).catch(()=>{
    localStorage.removeItem('drishti_token'); sessionStorage.removeItem('drishti_token');
  });
});

function setGreeting(){const h=new Date().getHours(),g=h<12?'Good morning':h<17?'Good afternoon':'Good evening',el=document.getElementById('greeting-text');if(el)el.textContent=`${g} 👋`;}
function showPage(id){document.querySelectorAll('.page,.page-layout').forEach(p=>p.classList.remove('active'));document.getElementById(id).classList.add('active');window.scrollTo(0,0);}
function switchPanel(name,el){document.querySelectorAll('.panel').forEach(p=>p.classList.remove('show'));document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));document.getElementById('panel-'+name).classList.add('show');if(el)el.classList.add('active');if(name==='alerts')renderAlertsTable();if(name==='cameras')setTimeout(animateCams,100);}
function animVal(id,target){const el=document.getElementById(id);if(!el)return;let c=0;const step=Math.max(1,target/40);const iv=setInterval(()=>{c=Math.min(c+step,target);el.textContent=Math.floor(c);el.classList.add('count-anim');if(c>=target)clearInterval(iv);},20);}
function updateStats(){const g=allAlerts.filter(a=>a.detection_class==='gun').length,i=allAlerts.filter(a=>a.detection_class==='intruder').length,cl=allAlerts.filter(a=>a.detection_class==='climbing').length,un=allAlerts.filter(a=>!a.acknowledged).length;animVal('s-total',allAlerts.length);animVal('s-gun',g);animVal('s-intruder',i);animVal('s-climb',cl);const ch=document.getElementById('s-total-ch');if(ch)ch.textContent=`${un} unacknowledged`;}
function detIcon(cls){return cls==='gun'?'🔫':cls==='intruder'?'🚶':'🧗';}
function sevClass(l){return l==='CRITICAL'?'sev-critical':'sev-high';}
function fmtTime(ts){const d=new Date(ts);return d.toLocaleDateString('en-IN',{day:'2-digit',month:'short'})+' '+d.toTimeString().slice(0,8);}

function renderLiveFeed(){
  const el=document.getElementById('live-feed');if(!el)return;
  if(!allAlerts.length){el.innerHTML='<div class="empty-state"><div class="empty-icon">📡</div><p>No alerts yet.</p></div>';return;}
  el.innerHTML=allAlerts.slice(0,8).map(a=>`<div class="af-item" onclick="openModal('${a.id}')"><span class="sev-chip ${sevClass(a.level)}">${a.level}</span><span class="af-label"><strong>${detIcon(a.detection_class)} ${a.extra.label}</strong></span><span class="af-cam">${a.camera_id}</span><span class="af-time">${fmtTime(a.timestamp)}</span></div>`).join('');
}

function renderDetBars(){
  const el=document.getElementById('det-bars');if(!el)return;
  const total=allAlerts.length||1,counts={gun:0,intruder:0,climbing:0};
  allAlerts.forEach(a=>{if(counts[a.detection_class]!==undefined)counts[a.detection_class]++;});
  el.innerHTML=[{label:'🔫 Gun Detection',key:'gun',color:'var(--red)'},{label:'🚶 Intruder',key:'intruder',color:'var(--orange)'},{label:'🧗 Climbing',key:'climbing',color:'var(--purple)'}].map(d=>`<div class="det-bar-item"><div class="det-bar-label"><span>${d.label}</span><span>${counts[d.key]} / ${total}</span></div><div class="det-bar"><div class="det-fill" data-w="${(counts[d.key]/total*100).toFixed(1)}" style="width:0%;background:${d.color}"></div></div></div>`).join('');
  setTimeout(()=>el.querySelectorAll('.det-fill').forEach(f=>f.style.width=f.dataset.w+'%'),200);
}

function renderTimeline(){
  const el=document.getElementById('activity-tl');if(!el)return;
  if(!allAlerts.length){el.innerHTML='<div style="font-size:.78rem;color:var(--muted)">No activity yet.</div>';return;}
  const colors={CRITICAL:'var(--red)',HIGH:'var(--orange)'};
  el.innerHTML=allAlerts.slice(0,5).map(a=>`<div class="tl-item"><div class="tl-left"><div class="tl-dot" style="background:${colors[a.level]||'var(--blue)'}"></div><div class="tl-line"></div></div><div class="tl-content"><div class="tl-title">${a.extra.label}</div><div class="tl-sub">${a.camera_id} · ${(a.confidence*100).toFixed(1)}% conf</div><div class="tl-time">${fmtTime(a.timestamp)}</div></div></div>`).join('');
}

function renderHeatmap(){
  const el=document.getElementById('day-heatmap'),lbl=document.getElementById('day-labels');if(!el)return;
  const days=Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()-(6-i));return d;});
  const counts=days.map(d=>allAlerts.filter(a=>a.timestamp.startsWith(d.toISOString().slice(0,10))).length);
  const max=Math.max(...counts,1);
  el.innerHTML=counts.map((c,i)=>{const hasCrit=allAlerts.some(a=>a.timestamp.startsWith(days[i].toISOString().slice(0,10))&&a.level==='CRITICAL');const bg=c===0?'rgba(255,255,255,.03)':`rgba(${hasCrit?'239,68,68':'59,130,246'},${0.15+c/max*0.75})`;return `<div title="${days[i].toLocaleDateString('en-IN',{weekday:'short',month:'short',day:'numeric'})}: ${c} alerts" style="aspect-ratio:1;border-radius:5px;background:${bg};cursor:pointer;transition:transform .15s" onmouseover="this.style.transform='scale(1.4)'" onmouseleave="this.style.transform='scale(1)'"></div>`;}).join('');
  if(lbl)lbl.innerHTML=days.map(d=>`<span>${d.toLocaleDateString('en-IN',{weekday:'short'})}</span>`).join('');
}

function renderTrendChart(){
  const c=document.getElementById('trend-chart');if(!c)return;
  c.width=c.parentElement.clientWidth;c.height=160;
  const ctx=c.getContext('2d'),w=c.width,h=c.height;ctx.clearRect(0,0,w,h);
  const counts=Array.from({length:24},(_,hr)=>allAlerts.filter(a=>new Date(a.timestamp).getHours()===hr).length);
  const max=Math.max(...counts,1),step=w/(counts.length-1);
  ctx.strokeStyle='rgba(99,180,255,.05)';ctx.lineWidth=1;for(let i=0;i<=4;i++){const y=h/4*i;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
  const grad=ctx.createLinearGradient(0,0,0,h);grad.addColorStop(0,'rgba(59,130,246,.3)');grad.addColorStop(1,'rgba(59,130,246,0)');
  ctx.beginPath();ctx.moveTo(0,h);counts.forEach((v,i)=>ctx.lineTo(i*step,h-(v/max)*(h*.85)-8));ctx.lineTo(w,h);ctx.closePath();ctx.fillStyle=grad;ctx.fill();
  ctx.beginPath();counts.forEach((v,i)=>{const x=i*step,y=h-(v/max)*(h*.85)-8;i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);});ctx.strokeStyle='rgba(59,130,246,.8)';ctx.lineWidth=2;ctx.lineJoin='round';ctx.stroke();
  counts.forEach((v,i)=>{if(v>0){const x=i*step,y=h-(v/max)*(h*.85)-8;ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fillStyle='#ef4444';ctx.fill();}});
}

function setFilter(f,btn){
  activeFilter=f;document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));if(btn)btn.classList.add('active');
  filteredAlerts=f==='all'?[...allAlerts]:allAlerts.filter(a=>a.level===f||a.detection_class===f);renderAlertsTable();
}

function renderAlertsTable(){
  const tb=document.getElementById('alerts-tbody');if(!tb)return;
  if(!filteredAlerts.length){tb.innerHTML=`<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">🔍</div><p>No alerts match this filter.</p></div></td></tr>`;return;}
  tb.innerHTML=filteredAlerts.map(a=>`<tr><td style="font-family:var(--font-mono);font-size:.72rem;color:var(--muted)">${fmtTime(a.timestamp)}</td><td><span class="sev-chip ${sevClass(a.level)}">${a.level}</span></td><td><div style="font-weight:700;font-size:.83rem">${detIcon(a.detection_class)} ${a.extra.label}</div><div style="font-size:.68rem;color:var(--muted);font-family:var(--font-mono)">${a.id.slice(0,8)}…</div></td><td style="font-family:var(--font-mono);font-size:.8rem;color:var(--cyan)">${a.camera_id}</td><td><div style="font-weight:700;font-size:.8rem">${(a.confidence*100).toFixed(1)}%</div><div class="conf-bar"><div class="conf-fill" style="width:${a.confidence*100}%;background:${a.level==='CRITICAL'?'var(--red)':'var(--orange)'}"></div></div></td><td><span style="font-size:.72rem;font-weight:700;color:${a.acknowledged?'var(--green)':'var(--muted)'}">${a.acknowledged?'✓ Acked':'— Pending'}</span></td><td><div style="display:flex;gap:.5rem"><button class="ack-btn ${a.acknowledged?'done':''}" onclick="ackAlert('${a.id}',this)">${a.acknowledged?'Acknowledged':'Acknowledge'}</button><button class="ack-btn" onclick="openModal('${a.id}')" style="color:var(--blue);border-color:rgba(59,130,246,.3)">View</button></div></td></tr>`).join('');
}

function openModal(id){
  const a=allAlerts.find(x=>x.id===id);if(!a)return;
  _modalAlertId=id;
  document.getElementById('modal-title').textContent=`${detIcon(a.detection_class)} ${a.extra.label}`;
  document.getElementById('modal-cam-label').textContent=`${a.camera_id} · ${fmtTime(a.timestamp)}`;
  document.getElementById('modal-ai-box').style.display='none';
  document.getElementById('modal-ai-text').textContent='';
  document.getElementById('modal-analyze-btn').disabled=false;

  const canvas=document.getElementById('modal-canvas'),ctx=canvas.getContext('2d');
  canvas.width=560;canvas.height=315;
  ctx.fillStyle='#0a0a0a';ctx.fillRect(0,0,560,315);
  for(let i=0;i<3000;i++){ctx.fillStyle=`rgba(255,255,255,${Math.random()*.06})`;ctx.fillRect(Math.random()*560,Math.random()*315,1,1);}
  ctx.fillStyle='rgba(0,0,0,.15)';for(let y=0;y<315;y+=4)ctx.fillRect(0,y,560,2);
  const vg=ctx.createRadialGradient(280,157,80,280,157,280);vg.addColorStop(0,'transparent');vg.addColorStop(1,'rgba(0,0,0,.7)');ctx.fillStyle=vg;ctx.fillRect(0,0,560,315);
  ctx.fillStyle='rgba(255,255,255,.7)';ctx.font='11px JetBrains Mono,monospace';ctx.fillText(fmtTime(a.timestamp),12,20);
  const sx=560/640,sy=315/480,bx=a.bbox.x*sx,by=a.bbox.y*sy,bw=a.bbox.w*sx,bh=a.bbox.h*sy,bc=a.level==='CRITICAL'?'#ef4444':'#f97316';
  ctx.shadowBlur=18;ctx.shadowColor=bc;ctx.strokeStyle=bc;ctx.lineWidth=2;ctx.strokeRect(bx,by,bw,bh);ctx.shadowBlur=0;
  [[bx,by],[bx+bw,by],[bx,by+bh],[bx+bw,by+bh]].forEach(([cx,cy],i)=>{const tl=10;ctx.strokeStyle=bc;ctx.lineWidth=3;ctx.beginPath();if(i===0){ctx.moveTo(cx+tl,cy);ctx.lineTo(cx,cy);ctx.lineTo(cx,cy+tl);}else if(i===1){ctx.moveTo(cx-tl,cy);ctx.lineTo(cx,cy);ctx.lineTo(cx,cy+tl);}else if(i===2){ctx.moveTo(cx+tl,cy);ctx.lineTo(cx,cy);ctx.lineTo(cx,cy-tl);}else{ctx.moveTo(cx-tl,cy);ctx.lineTo(cx,cy);ctx.lineTo(cx,cy-tl);}ctx.stroke();});
  ctx.fillStyle=bc;ctx.font='bold 11px JetBrains Mono,monospace';ctx.fillText(a.extra.label.toUpperCase(),bx,by-6);
  ctx.fillStyle='rgba(0,0,0,.5)';ctx.fillRect(bx,by-22,bw,8);ctx.fillStyle=bc;ctx.fillRect(bx,by-22,bw*a.confidence,8);

  document.getElementById('modal-meta').innerHTML=`<div class="meta-item"><div class="meta-key">Detection</div><div class="meta-val">${detIcon(a.detection_class)} ${a.detection_class.toUpperCase()}</div></div><div class="meta-item"><div class="meta-key">Severity</div><div class="meta-val" style="color:${a.level==='CRITICAL'?'var(--red)':'var(--orange)'}">${a.level}</div></div><div class="meta-item"><div class="meta-key">Confidence</div><div class="meta-val">${(a.confidence*100).toFixed(1)}%</div></div><div class="meta-item"><div class="meta-key">Camera</div><div class="meta-val" style="font-family:var(--font-mono);color:var(--cyan)">${a.camera_id}</div></div><div class="meta-item"><div class="meta-key">BBox</div><div class="meta-val" style="font-family:var(--font-mono);font-size:.78rem">${JSON.stringify(a.bbox)}</div></div><div class="meta-item"><div class="meta-key">Status</div><div class="meta-val" style="color:${a.acknowledged?'var(--green)':'var(--orange)'}">${a.acknowledged?'Acknowledged':'Pending'}</div></div>`;

  const ackBtn=document.getElementById('modal-ack-btn');
  if(a.acknowledged){ackBtn.textContent='✓ Acknowledged';ackBtn.classList.add('done');ackBtn.onclick=null;}
  else{ackBtn.textContent='Acknowledge';ackBtn.classList.remove('done');ackBtn.onclick=()=>ackAlert(id,ackBtn);}

  document.getElementById('modal').classList.add('open');
}

function closeModal(){document.getElementById('modal').classList.remove('open');_modalAlertId=null;}
document.getElementById('modal').addEventListener('click',e=>{if(e.target===document.getElementById('modal'))closeModal();});

let _camFrames={};
function buildCamGrid(){
  const el=document.getElementById('cam-grid');if(!el)return;
  const cams=['CAM-01'];
  el.innerHTML=cams.map(cam=>`<div class="cam-feed" onclick="openCamFull('${cam}')"><canvas id="cam-canvas-${cam}" width="560" height="315"></canvas><div class="cam-feed-label">${cam}</div><div class="cam-feed-status cam-live" id="cam-status-${cam}">● LIVE</div></div>`).join('');
}

function animateCams(){
  ['CAM-01'].forEach(cam=>{
    const canvas=document.getElementById(`cam-canvas-${cam}`);if(!canvas)return;
    let frame=0;
    function draw(){
      const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
      ctx.fillStyle='#000';ctx.fillRect(0,0,w,h);
      for(let i=0;i<40;i++){const x=(Math.sin(frame*.02+i)*.5+.5)*w,y=(Math.cos(frame*.015+i*.7)*.5+.5)*h,a=.2+Math.sin(frame*.05+i)*.1;ctx.beginPath();ctx.arc(x,y,1,0,Math.PI*2);ctx.fillStyle=`rgba(59,130,246,${a})`;ctx.fill();}
      ctx.strokeStyle='rgba(59,130,246,.04)';ctx.lineWidth=1;for(let x=0;x<w;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}for(let y=0;y<h;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
      const scanY=(frame*2)%h,sg=ctx.createLinearGradient(0,scanY-20,0,scanY+4);sg.addColorStop(0,'transparent');sg.addColorStop(1,'rgba(59,130,246,.12)');ctx.fillStyle=sg;ctx.fillRect(0,scanY-20,w,24);
      ctx.fillStyle='rgba(255,255,255,.4)';ctx.font='10px JetBrains Mono,monospace';ctx.fillText(new Date().toTimeString().slice(0,8),10,h-10);ctx.fillText(cam,w-60,h-10);
      if(frame%180<10){ctx.fillStyle=`rgba(239,68,68,${.06+(frame%180)/100*.04})`;ctx.fillRect(0,0,w,h);const s=document.getElementById(`cam-status-${cam}`);if(s){s.textContent='⚠ ALERT';s.className='cam-feed-status cam-alert';}}
      else if(frame%180===10){const s=document.getElementById(`cam-status-${cam}`);if(s){s.textContent='● LIVE';s.className='cam-feed-status cam-live';}}
      frame++;_camFrames[cam]=requestAnimationFrame(draw);
    }
    if(_camFrames[cam])cancelAnimationFrame(_camFrames[cam]);draw();
  });
}

function openCamFull(cam){
  notify(`Connect your RTSP/HLS stream in openCamFull() for ${cam}`, 'info');
}

function notify(msg,type='info'){
  const stack=document.getElementById('toast-stack');
  const icons={ok:'✅',critical:'🚨',high:'⚠️',info:'📡'};
  const el=document.createElement('div');el.className=`toast ${type}`;
  el.innerHTML=`<div class="toast-icon">${icons[type]||'📡'}</div><div><div class="toast-title">${type==='ok'?'Info':'Alert'}</div><div class="toast-body">${msg}</div></div>`;
  stack.prepend(el);el.onclick=()=>el.remove();
  setTimeout(()=>{el.style.opacity='0';setTimeout(()=>el.remove(),300);},5000);
  while(stack.children.length>4)stack.removeChild(stack.lastChild);
}

// Three.js Background
(function(){
  const canvas=document.getElementById('bg-canvas');if(!window.THREE)return;
  const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true}),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(75,innerWidth/innerHeight,.1,2000);
  camera.position.set(0,2,6);renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  scene.fog=new THREE.Fog(0x000000,10,200);
  const light=new THREE.PointLight(0x00ffff,2,200);light.position.set(0,10,10);scene.add(light);
  const roadGeo=new THREE.PlaneGeometry(20,400,100,200);
  const road=new THREE.Mesh(roadGeo,new THREE.MeshBasicMaterial({color:0x1a1a1a,wireframe:true}));road.rotation.x=-Math.PI/2;scene.add(road);
  const streaks=[];for(let i=0;i<140;i++){const geo=new THREE.BoxGeometry(.05,.05,Math.random()*2.5+.8);const mat=new THREE.MeshBasicMaterial({color:Math.random()>.5?0x3b82f6:0x06b6d4});const mesh=new THREE.Mesh(geo,mat);mesh.position.set((Math.random()-.5)*12,.08+Math.random()*.3,-Math.random()*400);scene.add(mesh);streaks.push(mesh);}
  let time=0;
  (function animate(){requestAnimationFrame(animate);time+=.018;const pos=road.geometry.attributes.position;for(let i=0;i<pos.count;i++){pos.setZ(i,Math.sin(pos.getX(i)*.5+time)*.45+Math.cos(pos.getY(i)*.2+time*2)*.28);}pos.needsUpdate=true;streaks.forEach(s=>{s.position.z+=2.2;if(s.position.z>10){s.position.z=-400;s.position.x=(Math.random()-.5)*12;}});camera.position.x=Math.sin(time*.4)*.6;camera.lookAt(0,0,-50);renderer.render(scene,camera);})();
  window.addEventListener('resize',()=>{renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();});
})();

// SVG Icons
const SH_LG=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 100"><path d="M48 4 L88 20 L88 56 Q88 82 48 96 Q8 82 8 56 L8 20 Z" fill="#000" stroke="#3b82f6" stroke-width="2"/><path d="M48 12 L80 24 L80 54 Q80 74 48 86 Q16 74 16 54 L16 24 Z" fill="none" stroke="#3b82f6" stroke-width="0.8" stroke-opacity="0.25"/><path d="M20 50 Q48 28 76 50 Q48 72 20 50 Z" fill="#00061a" stroke="#3b82f6" stroke-width="1.2"/><circle cx="48" cy="50" r="11" fill="#3b82f6"/><circle cx="48" cy="50" r="5.5" fill="#000"/><circle cx="52" cy="46" r="2.5" fill="white" fill-opacity="0.9"/></svg>`;
const SH_SM=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 52"><path d="M24 2 L44 10 L44 28 Q44 41 24 48 Q4 41 4 28 L4 10 Z" fill="#000" stroke="#3b82f6" stroke-width="1.5"/><path d="M10 25 Q24 14 38 25 Q24 36 10 25 Z" fill="#00061a" stroke="#3b82f6" stroke-width="1"/><circle cx="24" cy="25" r="7" fill="#3b82f6"/><circle cx="24" cy="25" r="3.5" fill="#000"/><circle cx="27" cy="22" r="1.5" fill="white" fill-opacity="0.9"/></svg>`;
const SH_XS=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 36"><path d="M16 1.5 L29 6.5 L29 18 Q29 27 16 32 Q3 27 3 18 L3 6.5 Z" fill="#000" stroke="#3b82f6" stroke-width="1.5"/><path d="M5 17 Q16 9 27 17 Q16 25 5 17 Z" fill="#00061a" stroke="#3b82f6" stroke-width="0.9"/><circle cx="16" cy="17" r="5" fill="#3b82f6"/><circle cx="16" cy="17" r="2.5" fill="#000"/><circle cx="18.5" cy="14.5" r="1.2" fill="white" fill-opacity="0.9"/></svg>`;
['eye-loader','eye-login','eye-signup'].forEach(id=>{const el=document.getElementById(id);if(el)el.innerHTML=id==='eye-loader'?SH_SM:SH_LG;});
const tb=document.getElementById('eye-topbar');if(tb)tb.innerHTML=SH_XS;

// Keyboard shortcuts
document.addEventListener('keydown',e=>{
  if(e.key==='Escape')closeModal();
  if(e.key==='Enter'){
    if(document.getElementById('page-login').classList.contains('active'))doLogin();
    if(document.getElementById('page-signup').classList.contains('active'))doSignup();
  }
});
