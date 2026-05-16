// ====================================================================
// AM and Above Focused Partners — app.js v6
// ====================================================================
(function(){
'use strict';
const userJson=sessionStorage.getItem('peUser');
if(!userJson){location.href='index.html';return;}
const user=JSON.parse(userJson);

const MONTHS=["Apr'25","May'25","Jun'25","Jul'25","Aug'25","Sep'25","Oct'25","Nov'25","Dec'25","Jan'26","Feb'26","Mar'26","Apr'26"];
let state={partners:[],myPartners:[],team:[],amPerf:[],summary:null,overallProject:null,myZones:[],filterOptions:{states:[],cities:[],owners:[]},charts:{},dailyHistory:[],runRate:0,todayMTD:0,yesterdayMTD:0};

const $=id=>document.getElementById(id);
const fmtINR=n=>{if(!isFinite(n)||n===0)return '₹0';if(n>=1e7)return '₹'+(n/1e7).toFixed(2)+' Cr';if(n>=1e5)return '₹'+(n/1e5).toFixed(2)+' L';if(n>=1e3)return '₹'+(n/1e3).toFixed(1)+'K';return '₹'+Math.round(n).toLocaleString('en-IN');};
const fmtInt=n=>Number(n||0).toLocaleString('en-IN');
const safe=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const pct=(a,b)=>b>0?Math.round((a-b)/b*100):0;

$('userName').textContent=user.name||user.gid;
$('userRole').textContent=user.role+(user.zone?' • '+user.zone:'');
$('btnLogout').addEventListener('click',()=>{sessionStorage.removeItem('peUser');location.href='index.html';});

// ── tabs ──
document.querySelectorAll('.tab').forEach(tab=>{
  tab.addEventListener('click',()=>{
    document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
    tab.classList.add('active');
    const id=tab.dataset.tab;
    document.querySelectorAll('.tab-pane').forEach(p=>p.classList.remove('active'));
    $('pane-'+id).classList.add('active');
    if(id==='team')    renderTeam();
    if(id==='mine')    renderMine();
    if(id==='am')      renderAm();
    if(id==='overall') renderCharts();
    if(id==='runrate') renderRunRate();
  });
});

if(user.role==='AM'){
  $('tabMine').style.display='none';
  $('tabAm').style.display='none';
  $('tabTeam').style.display='none';
}

function setStatus(msg,kind){const bar=$('statusBar');bar.className='status-bar '+(kind||'');bar.textContent=msg;bar.classList.toggle('hidden',!msg);}

// ── Load ──
function loadDashboard(){
  setStatus('Loading data from master sheet…','loading');
  fetch(API_URL+'?action=getDashboard&gid='+encodeURIComponent(user.gid))
    .then(r=>r.json()).then(res=>{
      if(!res.success){setStatus(res.message||'Failed.','error');return;}
      state.partners     =res.partners||[];
      state.myPartners   =res.myPartners||[];
      state.team         =res.teamBreakdown||[];
      state.amPerf       =res.amPerformance||[];
      state.summary      =res.summary;
      state.overallProject=res.overallProject;
      state.filterOptions=res.filterOptions||{states:[],cities:[],owners:[]};
      state.myZones      =res.myZones||[];
      state.runRate      =res.dailyRunRate||0;
      state.yesterdayMTD =res.yesterdayMTD||0;
      state.todayMTD     =res.summary?res.summary.currentMonthPremium:0;
      renderZoneChips();
      populateFilterOptions();
      renderOverall();
      renderKpiRow();
      renderTable();
      renderCharts();
      setStatus('','');
      // Load daily tracking separately
      loadDailyTracking();
    }).catch(err=>setStatus('Connection error: '+err.message,'error'));
}

function loadDailyTracking(){
  fetch(API_URL+'?action=getDailyTracking&gid='+encodeURIComponent(user.gid))
    .then(r=>r.json()).then(res=>{
      if(!res.success) return;
      state.dailyHistory =res.history||[];
      state.runRate      =res.runRate||0;
      state.todayMTD     =res.todayMTD||state.todayMTD;
      state.yesterdayMTD =res.yesterdayMTD||0;
      renderRunRateStrip();
    }).catch(()=>{});
}

function renderZoneChips(){
  const c=$('zoneChips');if(!c)return;
  c.innerHTML=state.myZones.length?'Zone: '+state.myZones.map(z=>`<span class="role-chip">${safe(z)}</span>`).join(' '):'';
}

// ── Overview ──
function renderOverall(){
  const op=state.overallProject;if(!op)return;
  $('op-totalPartners').textContent=fmtInt(op.totalPartners);
  $('op-active').textContent=fmtInt(op.activePartners);
  $('op-inactive').textContent=fmtInt(op.inactivePartners);
  $('op-business').textContent=fmtINR(op.businessGenerated);
  const mom=op.momPct;
  $('op-mom').textContent=(mom>=0?'+':'')+mom+'%';
  const pill=$('op-momPill');
  pill.classList.remove('pill-green','pill-red');
  pill.classList.add(mom>=0?'pill-green':'pill-red');
  $('op-ach').textContent=op.achievementPct+'%';
  $('op-connected').textContent=fmtInt(op.connectedPartners)+' / '+fmtInt(op.totalPartners);
  $('op-conn').textContent=fmtInt(op.connectedPartners);
  $('op-notconn').textContent=fmtInt(op.nonConnectedPartners);
  $('op-mtd').textContent=fmtINR(op.businessGenerated);
  $('op-lmtd').textContent=fmtINR(op.lmtd||0);
  $('op-mtdSub').textContent=(mom>=0?'▲ +':'▼ ')+Math.abs(mom)+'% vs last month';
  $('op-mtdSub').className='kpi-sub '+(mom>=0?'pos':'neg');
  $('op-maxpot').textContent=fmtINR(op.maxPotential);
  $('op-overallpot').textContent=fmtINR(op.overallPotential);
  $('op-target').textContent=fmtINR(op.target);
  $('op-maxAch').textContent=op.maxPotAchPct+'%';
  $('op-calls').textContent=fmtInt(op.calls);
  $('op-visits').textContent=fmtInt(op.visits);
  $('op-growth').textContent=fmtInt(op.growthCount);
  $('op-degrowth').textContent=fmtInt(op.degrowthCount);
}

// ── Improved Charts ──
const CHART_COLORS={
  green:'rgba(22,163,74,1)', greenLight:'rgba(22,163,74,0.15)',
  red:'rgba(220,38,38,1)',   redLight:'rgba(220,38,38,0.15)',
  blue:'rgba(37,99,235,1)',  blueLight:'rgba(37,99,235,0.15)',
  amber:'rgba(245,158,11,1)',amberLight:'rgba(245,158,11,0.15)',
  purple:'rgba(147,51,234,1)',purpleLight:'rgba(147,51,234,0.15)'
};

function destroyChart(name){if(state.charts[name]){state.charts[name].destroy();state.charts[name]=null;}}

function makeDoughnut(canvasId, labels, data, colors, name){
  destroyChart(name);
  const canvas=$(canvasId);if(!canvas)return;
  const total=data.reduce((a,b)=>a+b,0);
  state.charts[name]=new Chart(canvas,{
    type:'doughnut',
    data:{labels,datasets:[{data,backgroundColor:colors,borderWidth:0,hoverOffset:8,borderRadius:4}]},
    options:{
      cutout:'72%',responsive:true,maintainAspectRatio:false,
      animation:{animateScale:true,animateRotate:true,duration:600,easing:'easeOutQuart'},
      plugins:{
        legend:{position:'bottom',labels:{boxWidth:10,font:{size:11},padding:12,color:'#64748b'}},
        tooltip:{callbacks:{
          label:ctx=>`${ctx.label}: ${ctx.raw} (${total?Math.round(ctx.raw/total*100):0}%)`
        }},
        // Center text plugin
        beforeDraw:function(chart){
          const{width,height,ctx}=chart;
          ctx.save();
          const centerX=width/2, centerY=height/2-12;
          ctx.textAlign='center';ctx.textBaseline='middle';
          ctx.font=`700 22px Inter,-apple-system,sans-serif`;
          ctx.fillStyle='#1e293b';
          ctx.fillText(total.toLocaleString('en-IN'), centerX, centerY);
          ctx.font=`500 10px Inter,-apple-system,sans-serif`;
          ctx.fillStyle='#94a3b8';
          ctx.fillText('TOTAL', centerX, centerY+18);
          ctx.restore();
        }
      }
    }
  });
}

function renderCharts(){
  const op=state.overallProject;if(!op)return;
  makeDoughnut('chartActivity',['Active','Inactive'],[op.activePartners,op.inactivePartners],[CHART_COLORS.green,CHART_COLORS.red],'activity');
  makeDoughnut('chartConnect',['Connected','Not Connected'],[op.connectedPartners,op.nonConnectedPartners],[CHART_COLORS.blue,CHART_COLORS.amber],'connect');
  makeDoughnut('chartGrowth',['Growth','Degrowth'],[op.growthCount,op.degrowthCount],[CHART_COLORS.green,CHART_COLORS.red],'growth');
}

// ── KPI Mini Row (MTD next to LMTD) ──
function renderKpiRow(){const s=state.summary;if(!s)return;$('kpiRow').innerHTML=renderKpis(s);}

function renderKpis(s){
  const mom=s.momPct;
  return `
  <div class="kpi-mini"><span class="kpi-mini-icon">👥</span><div><div class="kpi-mini-label">Partners</div><div class="kpi-mini-val">${fmtInt(s.totalPartners)}</div></div></div>
  <div class="kpi-mini"><span class="kpi-mini-icon">📈</span><div><div class="kpi-mini-label">Max Potential</div><div class="kpi-mini-val">${fmtINR(s.totalMaxPotential)}</div></div></div>
  <div class="kpi-mini"><span class="kpi-mini-icon">🏦</span><div><div class="kpi-mini-label">Overall Potential</div><div class="kpi-mini-val">${fmtINR(s.totalOverallPotential)}</div></div></div>
  <div class="kpi-mini"><span class="kpi-mini-icon">🎯</span><div><div class="kpi-mini-label">Target (May)</div><div class="kpi-mini-val">${fmtINR(s.totalTarget)}</div></div></div>
  <div class="kpi-mini"><span class="kpi-mini-icon">📅</span><div><div class="kpi-mini-label">MTD (May'26)</div><div class="kpi-mini-val pos">${fmtINR(s.currentMonthPremium)}</div><div class="kpi-mini-foot ${mom>=0?'pos':'neg'}">${mom>=0?'▲ +':'▼ '}${Math.abs(mom)}% MoM</div></div></div>
  <div class="kpi-mini"><span class="kpi-mini-icon">📆</span><div><div class="kpi-mini-label">LMTD (Apr'26)</div><div class="kpi-mini-val">${fmtINR(s.prevMonthPremium)}</div><div class="kpi-mini-foot">Last month</div></div></div>
  <div class="kpi-mini"><span class="kpi-mini-icon">🏆</span><div><div class="kpi-mini-label">Achievement</div><div class="kpi-mini-val ${s.achievementPct>=80?'pos':s.achievementPct>=40?'':'neg'}">${s.achievementPct}%</div></div></div>
  <div class="kpi-mini"><span class="kpi-mini-icon">✅</span><div><div class="kpi-mini-label">Active</div><div class="kpi-mini-val pos">${fmtInt(s.activeCount)}</div><div class="kpi-mini-foot neg">Inactive: ${fmtInt(s.inactiveCount)}</div></div></div>
  <div class="kpi-mini"><span class="kpi-mini-icon">📞</span><div><div class="kpi-mini-label">Connected</div><div class="kpi-mini-val pos">${fmtInt(s.connectedCount)}</div><div class="kpi-mini-foot neg">Not: ${fmtInt(s.notConnectedCount)}</div></div></div>
  <div class="kpi-mini"><span class="kpi-mini-icon">📱</span><div><div class="kpi-mini-label">Calls / Visits</div><div class="kpi-mini-val pos">${fmtInt(s.totalCalls)} / ${fmtInt(s.totalVisits)}</div></div></div>`;
}

function populateFilterOptions(){
  const{states,cities,owners}=state.filterOptions;
  fill($('fState'),states,'All states');fill($('fCity'),cities,'All cities');
  fill($('fOwner'),owners,'All owners');fill($('fStateMine'),states,'All states');
  fill($('fTeamState'),states,'All states');fill($('fAmState'),states,'All states');
}
function fill(sel,arr,ph){if(!sel)return;const cur=sel.value;sel.innerHTML=`<option value="">${ph}</option>`+(arr||[]).map(v=>`<option value="${safe(v)}">${safe(v)}</option>`).join('');sel.value=cur;}

// ── All Partners ──
function getFiltered(){
  const q=$('fSearch').value.trim().toLowerCase(),st=$('fState').value,ct=$('fCity').value;
  const ow=$('fOwner').value,orole=$('fOwnerRole').value,ac=$('fActive').value;
  const gw=$('fGrowth').value,cn=$('fConnect').value,bz=$('fBusiness').value;
  return state.partners.filter(p=>{
    if(q&&(p.name+' '+p.gid+' '+p.city).toLowerCase().indexOf(q)===-1)return false;
    if(st&&p.state!==st)return false;if(ct&&p.city!==ct)return false;
    if(ow&&p.ownerName!==ow)return false;if(orole&&p.ownerRole!==orole)return false;
    if(ac==='active'&&!p.isActive)return false;if(ac==='inactive'&&p.isActive)return false;
    if(gw==='growth'&&!p.isGrowth)return false;if(gw==='degrowth'&&p.isGrowth)return false;
    if(cn==='connected'&&!p.connected)return false;if(cn==='notconnected'&&p.connected)return false;
    if(bz&&!rangeMatch(p.currentMonth,bz))return false;
    return true;
  });
}
function rangeMatch(val,range){if(range==='0')return val===0;const parts=range.split('-');const lo=parts[0]===''?-Infinity:parseFloat(parts[0]);const hi=parts[1]===''||parts[1]===undefined?Infinity:parseFloat(parts[1]);return val>=lo&&val<=hi;}

function renderTable(){
  const list=getFiltered();
  $('filterCount').textContent=list.length+' of '+state.partners.length+' partners';
  const tbody=$('partnerTbody');
  if(!list.length){tbody.innerHTML=`<tr><td colspan="15" class="empty">No partners match filters.</td></tr>`;return;}
  tbody.innerHTML=list.map(p=>rowHtml(p)).join('');
  tbody.querySelectorAll('.openModal').forEach(b=>b.addEventListener('click',()=>openModal(b.dataset.gid)));
}

function rowHtml(p){
  const mom=p.prevMonth>0?Math.round((p.currentMonth-p.prevMonth)/p.prevMonth*100):0;
  return `<tr>
    <td><div class="partner-name">${safe(p.name)}</div><div class="partner-sub">${safe(p.gid)}</div></td>
    <td>${safe(p.city)}<div class="partner-sub">${safe(p.state)}</div></td>
    <td>${safe(p.ownerName)}<div class="partner-sub">${safe(p.ownerRole)}</div></td>
    <td>${fmtINR(p.maxPotential)}</td><td>${fmtINR(p.overallPotential)}</td><td>${fmtINR(p.target)}</td>
    <td style="color:#f59e0b;font-weight:700;">${fmtINR(p.ftd||0)}</td><td class="pos"><b>${fmtINR(p.currentMonth)}</b></td><td>${fmtINR(p.prevMonth)}</td>
    <td class="${mom>=0?'pos':'neg'}">${mom>=0?'+':''}${mom}%</td>
    <td><span class="${p.isGrowth?'trend-pos':'trend-neg'}">${p.isGrowth?'▲ Growth':'▼ Degrowth'}</span></td>
    <td>${p.isActive?'<span class="badge badge-green">Active</span>':'<span class="badge badge-red">Inactive</span>'}</td>
    <td>${p.connected?'<span class="badge badge-blue">Conn.</span>':'<span class="badge badge-amber">Not</span>'}</td>
    <td class="pos"><b>${fmtInt(p.calls)}</b></td><td class="pos"><b>${fmtInt(p.visits)}</b></td>
    <td><button class="btn-link openModal" data-gid="${safe(p.gid)}">View</button></td>
  </tr>`;
}

['fSearch','fState','fCity','fOwner','fOwnerRole','fActive','fGrowth','fConnect','fBusiness'].forEach(id=>{
  const el=$(id);el.addEventListener(el.tagName==='INPUT'?'input':'change',renderTable);
});
$('btnClearFilters').addEventListener('click',()=>{['fSearch','fState','fCity','fOwner','fOwnerRole','fActive','fGrowth','fConnect','fBusiness'].forEach(id=>$(id).value='');renderTable();});
$('btnExportCsv').addEventListener('click',()=>{
  const list=getFiltered();
  const h=['GID','Name','City','State','OwnerRole','OwnerName','MaxPot','OverallPot','Target','MTD','LMTD','MoM%','Active','Growth','Connected','Calls','Visits'];
  const rows=list.map(p=>[p.gid,p.name,p.city,p.state,p.ownerRole,p.ownerName,p.maxPotential,p.overallPotential,p.target,p.currentMonth,p.prevMonth,pct(p.currentMonth,p.prevMonth),p.isActive?'Active':'Inactive',p.isGrowth?'Growth':'Degrowth',p.connected?'Connected':'Not',p.calls,p.visits]);
  const csv=[h,...rows].map(r=>r.map(x=>`"${String(x==null?'':x).replace(/"/g,'""')}"`).join(',')).join('\n');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='partners_'+new Date().toISOString().slice(0,10)+'.csv';a.click();
});

// ── My Partners ──
function renderMine(){
  if(user.role==='AM')return;
  const list=state.myPartners||[];
  if(!list.length){$('kpiRowMine').innerHTML='<div class="empty">No directly assigned partners.</div>';$('mineTbody').innerHTML='';return;}
  $('kpiRowMine').innerHTML=renderKpis(computeSummary(list));
  const q=($('fSearchMine').value||'').toLowerCase(),st=$('fStateMine').value;
  const ac=$('fActiveMine').value,cn=$('fConnectMine').value;
  const filtered=list.filter(p=>{
    if(q&&(p.name+' '+p.gid).toLowerCase().indexOf(q)===-1)return false;
    if(st&&p.state!==st)return false;
    if(ac==='active'&&!p.isActive)return false;if(ac==='inactive'&&p.isActive)return false;
    if(cn==='connected'&&!p.connected)return false;if(cn==='notconnected'&&p.connected)return false;
    return true;
  });
  $('mineTbody').innerHTML=filtered.map(p=>{
    const mom=p.prevMonth>0?Math.round((p.currentMonth-p.prevMonth)/p.prevMonth*100):0;
    return `<tr>
      <td><div class="partner-name">${safe(p.name)}</div><div class="partner-sub">${safe(p.gid)}</div></td>
      <td>${safe(p.city)}<div class="partner-sub">${safe(p.state)}</div></td>
      <td>${fmtINR(p.maxPotential)}</td><td>${fmtINR(p.overallPotential)}</td><td>${fmtINR(p.target)}</td>
      <td style="color:#f59e0b;font-weight:700;">${fmtINR(p.ftd||0)}</td><td class="pos"><b>${fmtINR(p.currentMonth)}</b></td><td>${fmtINR(p.prevMonth)}</td>
      <td class="${mom>=0?'pos':'neg'}">${mom>=0?'+':''}${mom}%</td>
      <td><span class="${p.isGrowth?'trend-pos':'trend-neg'}">${p.isGrowth?'▲ Growth':'▼ Degrowth'}</span></td>
      <td>${p.isActive?'<span class="badge badge-green">Active</span>':'<span class="badge badge-red">Inactive</span>'}</td>
      <td>${p.connected?'<span class="badge badge-blue">Conn.</span>':'<span class="badge badge-amber">Not</span>'}</td>
      <td class="pos"><b>${fmtInt(p.calls)}</b></td><td class="pos"><b>${fmtInt(p.visits)}</b></td>
      <td><button class="btn-link openModal" data-gid="${safe(p.gid)}">View</button></td>
    </tr>`;
  }).join('');
  $('mineTbody').querySelectorAll('.openModal').forEach(b=>b.addEventListener('click',()=>openModal(b.dataset.gid)));
}
['fSearchMine','fStateMine','fActiveMine','fConnectMine'].forEach(id=>{const el=$(id);if(!el)return;el.addEventListener(el.tagName==='INPUT'?'input':'change',renderMine);});
if($('btnClearMine'))$('btnClearMine').addEventListener('click',()=>{['fSearchMine','fStateMine','fActiveMine','fConnectMine'].forEach(id=>$(id).value='');renderMine();});

function computeSummary(list){
  let curr=0,prev=0,mp=0,op=0,tg=0,ac=0,gw=0,cn=0,cl=0,vs=0;
  list.forEach(p=>{curr+=p.currentMonth;prev+=p.prevMonth;mp+=p.maxPotential;op+=p.overallPotential;tg+=p.target;if(p.isActive)ac++;if(p.isGrowth)gw++;if(p.connected)cn++;cl+=p.calls;vs+=p.visits;});
  return{totalPartners:list.length,totalMaxPotential:mp,totalOverallPotential:op,totalTarget:tg,currentMonthPremium:curr,prevMonthPremium:prev,activeCount:ac,inactiveCount:list.length-ac,growthCount:gw,degrowthCount:list.length-gw,connectedCount:cn,notConnectedCount:list.length-cn,totalCalls:cl,totalVisits:vs,achievementPct:tg>0?Math.round(curr/tg*100):0,momPct:prev>0?Math.round((curr-prev)/prev*100):0,maxPotAchPct:mp>0?Math.round(curr/mp*100):0};
}

// ── AM Performance ──
function renderAm(){
  if(user.role==='AM')return;
  let list=state.amPerf.slice();
  const q=($('fAmSearch').value||'').toLowerCase(),st=$('fAmState').value,sort=$('fAmSort').value||'mtd',status=$('fAmStatus').value;
  if(q)list=list.filter(a=>a.name.toLowerCase().indexOf(q)!==-1);
  if(st)list=list.filter(a=>a.states.indexOf(st)!==-1);
  if(status==='active')list=list.filter(a=>a.overallProject.activePartners>0);
  if(status==='inactive')list=list.filter(a=>a.overallProject.inactivePartners>0);
  list.sort((a,b)=>{
    if(sort==='mtd')return b.overallProject.businessGenerated-a.overallProject.businessGenerated;
    if(sort==='ach')return b.overallProject.achievementPct-a.overallProject.achievementPct;
    if(sort==='partners')return b.overallProject.totalPartners-a.overallProject.totalPartners;
    if(sort==='active')return b.overallProject.activePartners-a.overallProject.activePartners;
    return a.name.localeCompare(b.name);
  });
  if(!list.length){$('amGrid').innerHTML='<div class="empty">No AMs match.</div>';return;}
  $('amGrid').innerHTML=list.map(a=>{
    const op=a.overallProject,mom=op.momPct;
    return `<div class="am-card">
      <div class="am-card-head">
        <div><div class="am-name">${safe(a.name)}</div><div class="am-role">${fmtInt(op.totalPartners)} partners • ${a.states.slice(0,2).join(', ')}${a.states.length>2?' +'+(a.states.length-2):''}</div></div>
        <button class="btn-sm openAmDrill" data-name="${safe(a.name)}">Details</button>
      </div>
      <div class="am-stats">
        <div class="as" style="background:linear-gradient(135deg,#0f172a,#1e3a5f);"><div class="as-l" style="color:rgba(255,255,255,.5);">FTD</div><div class="as-v" style="color:#fbbf24;">${fmtINR(op.ftd||a.summary.totalFTD||0)}</div></div>
        <div class="as"><div class="as-l">MTD</div><div class="as-v pos">${fmtINR(op.businessGenerated)}</div></div>
        <div class="as" style="background:#0f172a;"><div class="as-l" style="color:rgba(255,255,255,.5);">FTD</div><div class="as-v" style="color:#fbbf24;">${fmtINR(op.ftd||0)}</div></div>
        <div class="as"><div class="as-l">LMTD</div><div class="as-v">${fmtINR(op.lmtd||a.summary.prevMonthPremium)}</div></div>
        <div class="as"><div class="as-l">MoM</div><div class="as-v ${mom>=0?'pos':'neg'}">${mom>=0?'+':''}${mom}%</div></div>
        <div class="as"><div class="as-l">Ach.</div><div class="as-v ${op.achievementPct>=80?'pos':op.achievementPct>=40?'':'neg'}">${op.achievementPct}%</div></div>
        <div class="as"><div class="as-l">Active</div><div class="as-v pos">${fmtInt(op.activePartners)}</div></div>
        <div class="as"><div class="as-l">Inactive</div><div class="as-v neg">${fmtInt(op.inactivePartners)}</div></div>
        <div class="as"><div class="as-l">Connected</div><div class="as-v pos">${fmtInt(op.connectedPartners)}</div></div>
        <div class="as"><div class="as-l">Calls</div><div class="as-v pos">${fmtInt(op.calls)}</div></div>
        <div class="as"><div class="as-l">Visits</div><div class="as-v pos">${fmtInt(op.visits)}</div></div>
        <div class="as"><div class="as-l">Max Pot.</div><div class="as-v">${fmtINR(op.maxPotential)}</div></div>
      </div>
    </div>`;
  }).join('');
  $('amGrid').querySelectorAll('.openAmDrill').forEach(b=>b.addEventListener('click',()=>openAmDrill(b.dataset.name)));
}
['fAmSearch','fAmState','fAmSort','fAmStatus'].forEach(id=>{const el=$(id);if(!el)return;el.addEventListener(el.tagName==='INPUT'?'input':'change',renderAm);});

function openAmDrill(amName){
  const am=state.amPerf.find(a=>a.name===amName);if(!am)return;
  const op=am.overallProject;
  const rows=am.partners.map(p=>{
    const mom=p.prevMonth>0?Math.round((p.currentMonth-p.prevMonth)/p.prevMonth*100):0;
    return `<tr><td><div class="partner-name">${safe(p.name)}</div><div class="partner-sub">${safe(p.gid)}</div></td><td>${safe(p.city)}<div class="partner-sub">${safe(p.state)}</div></td><td>${fmtINR(p.maxPotential)}</td><td>${fmtINR(p.overallPotential)}</td><td>${fmtINR(p.target)}</td><td class="pos"><b>${fmtINR(p.currentMonth)}</b></td><td>${fmtINR(p.prevMonth)}</td><td class="${mom>=0?'pos':'neg'}">${mom>=0?'+':''}${mom}%</td><td><span class="${p.isGrowth?'trend-pos':'trend-neg'}">${p.isGrowth?'▲ Growth':'▼ Degrowth'}</span></td><td>${p.isActive?'<span class="badge badge-green">Active</span>':'<span class="badge badge-red">Inactive</span>'}</td><td>${p.connected?'<span class="badge badge-blue">Conn.</span>':'<span class="badge badge-amber">Not</span>'}</td><td class="pos">${fmtInt(p.calls)}</td><td class="pos">${fmtInt(p.visits)}</td><td><button class="btn-link openModal" data-gid="${safe(p.gid)}">View</button></td></tr>`;
  }).join('');
  $('modalBody').innerHTML=`<h2>${safe(am.name)} <span class="role-chip">AM</span></h2><div class="modal-sub">${am.states.join(', ')}</div>
  <div class="kpi-row">
    <div class="kpi-mini"><div><div class="kpi-mini-label">Partners</div><div class="kpi-mini-val">${fmtInt(op.totalPartners)}</div></div></div>
    <div class="kpi-mini"><div><div class="kpi-mini-label">MTD</div><div class="kpi-mini-val pos"><b>${fmtINR(op.businessGenerated)}</b></div></div></div>
    <div class="kpi-mini"><div><div class="kpi-mini-label">LMTD</div><div class="kpi-mini-val">${fmtINR(op.lmtd||am.summary.prevMonthPremium)}</div></div></div>
    <div class="kpi-mini"><div><div class="kpi-mini-label">Target</div><div class="kpi-mini-val">${fmtINR(op.target)}</div></div></div>
    <div class="kpi-mini"><div><div class="kpi-mini-label">Ach.</div><div class="kpi-mini-val">${op.achievementPct}%</div></div></div>
    <div class="kpi-mini"><div><div class="kpi-mini-label">Max Pot.</div><div class="kpi-mini-val">${fmtINR(op.maxPotential)}</div></div></div>
    <div class="kpi-mini"><div><div class="kpi-mini-label">Active</div><div class="kpi-mini-val pos">${fmtInt(op.activePartners)}</div></div></div>
    <div class="kpi-mini"><div><div class="kpi-mini-label">Connected</div><div class="kpi-mini-val pos">${fmtInt(op.connectedPartners)}</div></div></div>
    <div class="kpi-mini"><div><div class="kpi-mini-label">Calls / Visits</div><div class="kpi-mini-val pos">${fmtInt(op.calls)} / ${fmtInt(op.visits)}</div></div></div>
  </div>
  <div class="table-wrap"><table class="ptable"><thead><tr><th>Partner</th><th>City/State</th><th>Max Pot.</th><th>Overall Pot.</th><th>Target</th><th>MTD</th><th>LMTD</th><th>MoM%</th><th>Growth</th><th>Status</th><th>Connect</th><th>Calls</th><th>Visits</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  $('partnerModal').classList.remove('hidden');
  $('modalBody').querySelectorAll('.openModal').forEach(b=>b.addEventListener('click',()=>openModal(b.dataset.gid)));
}

// ── Team Performance ──
function renderTeam(){
  if(user.role==='AM')return;
  let team=state.team||[];
  const roleF=$('fTeamRole').value,search=($('fTeamSearch').value||'').toLowerCase(),stateF=$('fTeamState').value;
  if(roleF)team=team.filter(t=>t.role===roleF);
  if(search)team=team.filter(t=>t.name.toLowerCase().indexOf(search)!==-1);
  if(stateF)team=team.filter(t=>t.partners.some(p=>p.state===stateF));
  if(!team.length){$('teamGrid').innerHTML='<div class="empty">No team members match.</div>';return;}
  $('teamGrid').innerHTML=team.map(t=>{
    const op=t.overallProject,mom=op.momPct;
    return `<div class="team-card">
      <div class="team-card-head"><div><div class="team-name">${safe(t.name)}</div><div class="team-role">${safe(t.role)} • ${fmtInt(op.totalPartners)} partners</div></div><button class="btn-link openTeamMember" data-key="${safe(t.role+'|'+t.name)}">Details</button></div>
      <div class="team-stats">
        <div class="ts" style="background:linear-gradient(135deg,#0f172a,#1e3a5f);"><div class="ts-l" style="color:rgba(255,255,255,.5);">FTD</div><div class="ts-v" style="color:#fbbf24;">${fmtINR(op.ftd||t.summary.totalFTD||0)}</div></div>
        <div class="ts"><div class="ts-l">MTD</div><div class="ts-v pos"><b>${fmtINR(op.businessGenerated)}</b></div></div>
        <div class="ts" style="background:#0f172a;"><div class="ts-l" style="color:rgba(255,255,255,.5);">FTD</div><div class="ts-v" style="color:#fbbf24;">${fmtINR(op.ftd||0)}</div></div>
        <div class="ts"><div class="ts-l">LMTD</div><div class="ts-v">${fmtINR(op.lmtd||t.summary.prevMonthPremium)}</div></div>
        <div class="ts"><div class="ts-l">MoM</div><div class="ts-v ${mom>=0?'pos':'neg'}">${mom>=0?'+':''}${mom}%</div></div>
        <div class="ts"><div class="ts-l">Target</div><div class="ts-v">${fmtINR(op.target)}</div></div>
        <div class="ts"><div class="ts-l">Ach.</div><div class="ts-v ${op.achievementPct>=80?'pos':op.achievementPct>=40?'':'neg'}">${op.achievementPct}%</div></div>
        <div class="ts"><div class="ts-l">Max Pot.</div><div class="ts-v">${fmtINR(op.maxPotential)}</div></div>
        <div class="ts"><div class="ts-l">Active</div><div class="ts-v pos">${fmtInt(op.activePartners)}</div></div>
        <div class="ts"><div class="ts-l">Inactive</div><div class="ts-v neg">${fmtInt(op.inactivePartners)}</div></div>
        <div class="ts"><div class="ts-l">Connected</div><div class="ts-v pos">${fmtInt(op.connectedPartners)}</div></div>
        <div class="ts"><div class="ts-l">Calls</div><div class="ts-v pos">${fmtInt(op.calls)}</div></div>
        <div class="ts"><div class="ts-l">Visits</div><div class="ts-v pos">${fmtInt(op.visits)}</div></div>
      </div>
    </div>`;
  }).join('');
  $('teamGrid').querySelectorAll('.openTeamMember').forEach(b=>b.addEventListener('click',()=>openTeamModal(b.dataset.key)));
}
['fTeamRole','fTeamSearch','fTeamState'].forEach(id=>{const el=$(id);if(!el)return;el.addEventListener(el.tagName==='INPUT'?'input':'change',renderTeam);});

function openTeamModal(key){
  const member=(state.team||[]).find(t=>(t.role+'|'+t.name)===key);if(!member)return;
  const op=member.overallProject;
  const rows=member.partners.map(p=>{
    const mom=p.prevMonth>0?Math.round((p.currentMonth-p.prevMonth)/p.prevMonth*100):0;
    return `<tr><td>${safe(p.name)}<div class="partner-sub">${safe(p.gid)}</div></td><td>${safe(p.city)}, ${safe(p.state)}</td><td>${fmtINR(p.maxPotential)}</td><td>${fmtINR(p.overallPotential)}</td><td>${fmtINR(p.target)}</td><td class="pos"><b>${fmtINR(p.currentMonth)}</b></td><td>${fmtINR(p.prevMonth)}</td><td class="${mom>=0?'pos':'neg'}">${mom>=0?'+':''}${mom}%</td><td><span class="${p.isGrowth?'trend-pos':'trend-neg'}">${p.isGrowth?'▲ Growth':'▼ Degrowth'}</span></td><td>${p.isActive?'<span class="badge badge-green">Active</span>':'<span class="badge badge-red">Inactive</span>'}</td><td class="pos">${fmtInt(p.calls)}</td><td class="pos">${fmtInt(p.visits)}</td><td><button class="btn-link openModal" data-gid="${safe(p.gid)}">View</button></td></tr>`;
  }).join('');
  $('modalBody').innerHTML=`<h2>${safe(member.name)} <span class="role-chip">${safe(member.role)}</span></h2>
  <div class="kpi-row">
    <div class="kpi-mini"><div><div class="kpi-mini-label">Partners</div><div class="kpi-mini-val">${fmtInt(op.totalPartners)}</div></div></div>
    <div class="kpi-mini"><div><div class="kpi-mini-label">MTD</div><div class="kpi-mini-val pos">${fmtINR(op.businessGenerated)}</div></div></div>
    <div class="kpi-mini"><div><div class="kpi-mini-label">LMTD</div><div class="kpi-mini-val">${fmtINR(op.lmtd||member.summary.prevMonthPremium)}</div></div></div>
    <div class="kpi-mini"><div><div class="kpi-mini-label">Target</div><div class="kpi-mini-val">${fmtINR(op.target)}</div></div></div>
    <div class="kpi-mini"><div><div class="kpi-mini-label">Ach.</div><div class="kpi-mini-val">${op.achievementPct}%</div></div></div>
    <div class="kpi-mini"><div><div class="kpi-mini-label">Active</div><div class="kpi-mini-val pos">${fmtInt(op.activePartners)}</div></div></div>
    <div class="kpi-mini"><div><div class="kpi-mini-label">Connected</div><div class="kpi-mini-val pos">${fmtInt(op.connectedPartners)}</div></div></div>
    <div class="kpi-mini"><div><div class="kpi-mini-label">Calls / Visits</div><div class="kpi-mini-val pos">${fmtInt(op.calls)} / ${fmtInt(op.visits)}</div></div></div>
  </div>
  <div class="table-wrap"><table class="ptable"><thead><tr><th>Partner</th><th>City, State</th><th>Max Pot.</th><th>Overall Pot.</th><th>Target</th><th>MTD</th><th>LMTD</th><th>MoM%</th><th>Growth</th><th>Status</th><th>Calls</th><th>Visits</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  $('partnerModal').classList.remove('hidden');
  $('modalBody').querySelectorAll('.openModal').forEach(b=>b.addEventListener('click',()=>openModal(b.dataset.gid)));
}

// ── Daily Run Rate Tab ──
function renderRunRateStrip(){
  $('rr-today').textContent=fmtINR(state.runRate);
  $('rr-mtd').textContent=fmtINR(state.todayMTD);
  $('rr-lmtd').textContent=fmtINR(state.yesterdayMTD);
}

function renderRunRate(){
  renderRunRateStrip();
  const hist=state.dailyHistory;
  if(!hist||!hist.length){return;}
  const labels=hist.map(h=>h.date.slice(5)); // MM-DD
  const mtdData=hist.map(h=>h.totalMTD);
  const rrData=hist.map((h,i)=>i===0?0:h.totalMTD-hist[i-1].totalMTD);

  destroyChart('dailyTrend');
  state.charts.dailyTrend=new Chart($('chartDailyTrend'),{
    type:'line',
    data:{labels,datasets:[{label:'Total MTD',data:mtdData,borderColor:CHART_COLORS.blue,backgroundColor:CHART_COLORS.blueLight,fill:true,tension:0.4,pointRadius:4,pointBackgroundColor:CHART_COLORS.blue}]},
    options:{responsive:true,maintainAspectRatio:false,scales:{y:{ticks:{callback:v=>fmtINR(v)}}},plugins:{legend:{position:'bottom'}}}
  });

  destroyChart('runRate');
  state.charts.runRate=new Chart($('chartRunRate'),{
    type:'bar',
    data:{labels:labels.slice(1),datasets:[{label:'Daily Run Rate',data:rrData.slice(1),backgroundColor:rrData.slice(1).map(v=>v>=0?CHART_COLORS.green:CHART_COLORS.red),borderRadius:5}]},
    options:{responsive:true,maintainAspectRatio:false,scales:{y:{ticks:{callback:v=>fmtINR(v)}}},plugins:{legend:{position:'bottom'}}}
  });
}

// ── Partner Modal ──
function openModal(gid){
  const all=[...state.partners,...(state.myPartners||[]),...(state.amPerf||[]).flatMap(a=>a.partners||[]),...(state.team||[]).flatMap(t=>t.partners||[])];
  const p=all.find(x=>x.gid===gid);if(!p)return;
  const maxAch=p.maxPotential>0?Math.round(p.currentMonth/p.maxPotential*100):0;
  const mom=p.prevMonth>0?Math.round((p.currentMonth-p.prevMonth)/p.prevMonth*100):0;
  $('modalBody').innerHTML=`
    <h2>${safe(p.name)} <span class="role-chip">${safe(p.gid)}</span></h2>
    <div class="modal-sub">${safe(p.city)}, ${safe(p.state)} • Owner: ${safe(p.ownerName)} (${safe(p.ownerRole)})</div>
    <div class="kpi-row">
      <div class="kpi-mini"><div><div class="kpi-mini-label">Max Potential</div><div class="kpi-mini-val pos">${fmtINR(p.maxPotential)}</div></div></div>
      <div class="kpi-mini"><div><div class="kpi-mini-label">Overall Potential</div><div class="kpi-mini-val ${p.overallPotential>0?'pos':''}">${fmtINR(p.overallPotential)}</div></div></div>
      <div class="kpi-mini"><div><div class="kpi-mini-label">Target (May)</div><div class="kpi-mini-val">${fmtINR(p.target)}</div></div></div>
      <div class="kpi-mini" style="background:linear-gradient(135deg,#0f172a,#1e3a5f);"><div><div class="kpi-mini-label" style="color:rgba(255,255,255,.5);">FTD (Today)</div><div class="kpi-mini-val" style="color:#fbbf24;"><b>${fmtINR(p.ftd||0)}</b></div></div></div>
      <div class="kpi-mini"><div><div class="kpi-mini-label">FTD</div><div class="kpi-mini-val" style="color:#fbbf24;">${fmtINR(p.ftd||0)}</div></div></div>
      <div class="kpi-mini"><div><div class="kpi-mini-label">MTD (May'26)</div><div class="kpi-mini-val ${p.currentMonth>=p.prevMonth?'pos':'neg'}"><b>${fmtINR(p.currentMonth)}</b></div></div></div>
      <div class="kpi-mini"><div><div class="kpi-mini-label">LMTD (Apr'26)</div><div class="kpi-mini-val">${fmtINR(p.prevMonth)}</div></div></div>
      <div class="kpi-mini"><div><div class="kpi-mini-label">MoM</div><div class="kpi-mini-val ${mom>=0?'pos':'neg'}">${mom>=0?'+':''}${mom}%</div></div></div>
      <div class="kpi-mini"><div><div class="kpi-mini-label">Calls</div><div class="kpi-mini-val ${p.calls>0?'pos':''}"><b>${fmtInt(p.calls)}</b></div></div></div>
      <div class="kpi-mini"><div><div class="kpi-mini-label">Visits</div><div class="kpi-mini-val ${p.visits>0?'pos':''}"><b>${fmtInt(p.visits)}</b></div></div></div>
    </div>
    <div class="potential-box">
      <b>Max-Pot Ach:</b> <span class="${maxAch>=80?'pos':maxAch>=40?'':'neg'}">${maxAch}%</span> &nbsp;|&nbsp;
      <b>Growth:</b> ${p.isGrowth?'<span class="pos">▲ Growth</span>':'<span class="neg">▼ Degrowth</span>'} &nbsp;|&nbsp;
      <b>Status:</b> ${p.isActive?'<span class="pos">Active</span>':'<span class="neg">Inactive</span>'}
    </div>
    <h3>14-Month Trend</h3>
    <canvas id="trendChart" style="max-height:240px;"></canvas>
    <h3>Connect Status — Calls: <span class="pos"><b>${fmtInt(p.calls)}</b></span> &nbsp; Visits: <span class="pos"><b>${fmtInt(p.visits)}</b></span></h3>
    <div class="row-flex">
      <div>${p.isActive?'<span class="badge badge-green">Active</span>':'<span class="badge badge-red">Inactive</span>'}</div>
      <div>${p.connected?'<span class="badge badge-blue">Connected</span>':'<span class="badge badge-amber">Not Connected</span>'}</div>
    </div>
    <h3>Monthly History</h3>
    <div class="table-wrap"><table class="ptable compact"><thead><tr>${MONTHS.map(m=>`<th>${m}</th>`).join('')}<th>May'26</th></tr></thead><tbody><tr>${p.monthlyData.map(v=>`<td>${fmtINR(v)}</td>`).join('')}<td class="pos"><b>${fmtINR(p.currentMonth)}</b></td></tr></tbody></table></div>
    <h3>Remark</h3>
    <textarea id="remarkBox" rows="3">${safe(p.remark||'')}</textarea>
    <button class="btn-primary" id="btnSaveRemark">Save Remark</button>
    <div id="remarkStatus" class="remark-status"></div>`;
  $('partnerModal').classList.remove('hidden');

  const allData=[...p.monthlyData,p.currentMonth];
  const ptColors=allData.map((v,i)=>i===0?'#94a3b8':v>=allData[i-1]?CHART_COLORS.green:CHART_COLORS.red);
  new Chart($('trendChart'),{type:'line',data:{labels:[...MONTHS,"May'26"],datasets:[{label:'Monthly business',data:allData,borderColor:'#2563eb',backgroundColor:CHART_COLORS.blueLight,fill:true,tension:0.3,pointBackgroundColor:ptColors,pointRadius:5,segment:{borderColor:ctx=>allData[ctx.p1DataIndex]>=allData[ctx.p0DataIndex]?CHART_COLORS.green:CHART_COLORS.red}},{label:'May Target',data:new Array(13).fill(null).concat([p.target]),borderColor:'#9333ea',borderDash:[5,5],pointRadius:0,fill:false}]},options:{responsive:true,maintainAspectRatio:false,scales:{y:{ticks:{callback:v=>fmtINR(v)}}},plugins:{legend:{position:'bottom'}}}});

  $('btnSaveRemark').addEventListener('click',()=>{
    const r=$('remarkBox').value;$('remarkStatus').textContent='Saving…';
    fetch(API_URL+'?action=saveRemark&gid='+encodeURIComponent(user.gid)+'&partnerGid='+encodeURIComponent(p.gid)+'&remark='+encodeURIComponent(r))
      .then(r=>r.json()).then(res=>{$('remarkStatus').textContent=res.success?'✓ Saved':'✗ '+(res.message||'Failed');if(res.success)p.remark=r;})
      .catch(err=>$('remarkStatus').textContent='✗ '+err.message);
  });
}

$('modalClose').addEventListener('click',()=>$('partnerModal').classList.add('hidden'));
$('modalBackdrop').addEventListener('click',()=>$('partnerModal').classList.add('hidden'));

loadDashboard();
})();
