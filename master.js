// ====================================================================
// AM and Above Focused Partners — master.js v6
// Zone comparison, rankings, daily run rate, 2700+ data
// ====================================================================
(function(){
'use strict';
const userJson=sessionStorage.getItem('peUser');
if(!userJson){location.href='index.html';return;}
const user=JSON.parse(userJson);

let state={master:null,charts:{},logins:null,dailyHistory:[],runRate:0};

const $=id=>document.getElementById(id);
const fmtINR=n=>{if(!isFinite(n)||n===0)return '₹0';if(n>=1e7)return '₹'+(n/1e7).toFixed(2)+' Cr';if(n>=1e5)return '₹'+(n/1e5).toFixed(2)+' L';if(n>=1e3)return '₹'+(n/1e3).toFixed(1)+'K';return '₹'+Math.round(n).toLocaleString('en-IN');};
const fmtInt=n=>Number(n||0).toLocaleString('en-IN');
const safe=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);

$('userName').textContent=user.name||user.gid;
$('btnLogout').addEventListener('click',()=>{sessionStorage.removeItem('peUser');location.href='index.html';});

document.querySelectorAll('.tab').forEach(tab=>{
  tab.addEventListener('click',()=>{
    document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
    tab.classList.add('active');
    const id=tab.dataset.tab;
    document.querySelectorAll('.tab-pane').forEach(p=>p.classList.remove('active'));
    $('pane-'+id).classList.add('active');
    if(id==='india')   renderIndia();
    if(id==='zones')   renderZoneComparison();
    if(id==='roles')   renderRoles();
    if(id==='states')  renderStates();
    if(id==='runrate') renderMasterRunRate();
    if(id==='logins')  loadLogins();
  });
});

function setStatus(msg,kind){const bar=$('statusBar');bar.className='status-bar '+(kind||'');bar.textContent=msg;bar.classList.toggle('hidden',!msg);}

const CHART_C={
  green:'rgba(22,163,74,1)',greenL:'rgba(22,163,74,0.2)',
  red:'rgba(220,38,38,1)',redL:'rgba(220,38,38,0.2)',
  blue:'rgba(37,99,235,1)',blueL:'rgba(37,99,235,0.2)',
  amber:'rgba(245,158,11,1)',
  purple:'rgba(147,51,234,1)',
  teal:'rgba(20,184,166,1)'
};
const ZONE_COLORS={'North':CHART_C.blue,'South':CHART_C.green,'East':CHART_C.amber,'West':CHART_C.purple,'RON':CHART_C.teal};

function destroyChart(name){if(state.charts[name]){state.charts[name].destroy();state.charts[name]=null;}}

// ── Load master data ──
function loadMaster(){
  setStatus('Loading all zones… (2700+ partners)','loading');
  fetch(API_URL+'?action=getMaster&gid='+encodeURIComponent(user.gid))
    .then(r=>r.json()).then(res=>{
      if(!res.success){setStatus(res.message||'Failed.','error');return;}
      state.master=res;
      state.runRate=res.dailyRunRate||0;
      renderIndia();
      renderZoneComparison();
      renderRoles();
      renderStates();
      setStatus('','');
    }).catch(err=>setStatus('Connection error: '+err.message,'error'));

  // Load daily tracking
  fetch(API_URL+'?action=getDailyTracking&gid='+encodeURIComponent(user.gid))
    .then(r=>r.json()).then(res=>{
      if(!res.success)return;
      state.dailyHistory=res.history||[];
      state.runRate=res.runRate||0;
      renderMasterRunRateStrip(res);
    }).catch(()=>{});
}

// ── Pan-India ──
function renderIndia(){
  const m=state.master;if(!m)return;
  const op=m.overallProject, s=m.overallSummary;
  if(!op)return;
  $('m-totalPartners').textContent=fmtInt(m.totalPartners);
  $('m-active').textContent=fmtInt(op.activePartners);
  $('m-inactive').textContent=fmtInt(op.inactivePartners);
  $('m-business').textContent=fmtINR(op.businessGenerated);
  const mom=op.momPct;
  $('m-mom').textContent=(mom>=0?'+':'')+mom+'%';
  const pill=$('m-momPill');pill.classList.remove('pill-green','pill-red');pill.classList.add(mom>=0?'pill-green':'pill-red');
  $('m-ach').textContent=op.achievementPct+'%';
  $('m-connected').textContent=fmtInt(op.connectedPartners)+' / '+fmtInt(m.totalPartners);
  $('m-conn').textContent=fmtInt(op.connectedPartners);
  $('m-notconn').textContent=fmtInt(op.nonConnectedPartners);
  $('m-mtd').textContent=fmtINR(op.businessGenerated);
  $('m-lmtd').textContent=fmtINR(op.lmtd||s.prevMonthPremium);
  $('m-mtdSub').textContent=(mom>=0?'▲ +':'▼ ')+Math.abs(mom)+'% vs last month';
  $('m-mtdSub').className='kpi-sub '+(mom>=0?'pos':'neg');
  $('m-maxpot').textContent=fmtINR(op.maxPotential);
  $('m-overallpot').textContent=fmtINR(op.overallPotential);
  $('m-target').textContent=fmtINR(op.target);
  $('m-runrate').textContent=fmtINR(state.runRate);
  $('m-calls').textContent=fmtInt(op.calls);
  $('m-visits').textContent=fmtInt(op.visits);
  $('m-growth').textContent=fmtInt(op.growthCount);
  $('m-degrowth').textContent=fmtInt(op.degrowthCount);

  // Charts
  const zones=(m.zoneSummaries||[]).filter(z=>z.partnerCount>0).sort((a,b)=>b.summary.currentMonthPremium-a.summary.currentMonthPremium);
  const zLabels=zones.map(z=>z.zone);
  const zColors=zLabels.map(z=>ZONE_COLORS[z]||CHART_C.blue);

  destroyChart('zoneMtd');
  state.charts.zoneMtd=new Chart($('chartZoneMtd'),{type:'bar',data:{labels:zLabels,datasets:[{label:'MTD',data:zones.map(z=>z.summary.currentMonthPremium),backgroundColor:zColors,borderRadius:6}]},options:{responsive:true,maintainAspectRatio:false,scales:{y:{ticks:{callback:v=>fmtINR(v)}}},plugins:{legend:{display:false}}}});

  destroyChart('zoneMtdLmtd');
  state.charts.zoneMtdLmtd=new Chart($('chartZoneMtdLmtd'),{type:'bar',data:{labels:zLabels,datasets:[{label:"MTD (May'26)",data:zones.map(z=>z.summary.currentMonthPremium),backgroundColor:zColors},{label:"LMTD (Apr'26)",data:zones.map(z=>z.summary.prevMonthPremium),backgroundColor:'rgba(148,163,184,0.5)'}]},options:{responsive:true,maintainAspectRatio:false,scales:{y:{ticks:{callback:v=>fmtINR(v)}}},plugins:{legend:{position:'bottom'}}}});

  function makeDoughnut2(cid,labels,data,colors,name){
    destroyChart(name);
    const total=data.reduce((a,b)=>a+b,0);
    state.charts[name]=new Chart($(cid),{type:'doughnut',data:{labels,datasets:[{data,backgroundColor:colors,borderWidth:0,hoverOffset:6}]},options:{cutout:'70%',responsive:true,maintainAspectRatio:false,animation:{duration:600},plugins:{legend:{position:'bottom',labels:{boxWidth:10,font:{size:11},padding:10}},tooltip:{callbacks:{label:ctx=>`${ctx.label}: ${ctx.raw} (${total?Math.round(ctx.raw/total*100):0}%)`}}}}});
  }
  makeDoughnut2('chartMActivity',['Active','Inactive'],[op.activePartners,op.inactivePartners],[CHART_C.green,CHART_C.red],'mActivity');
  makeDoughnut2('chartMConnect',['Connected','Not Connected'],[op.connectedPartners,op.nonConnectedPartners],[CHART_C.blue,CHART_C.amber],'mConnect');
  makeDoughnut2('chartMGrowth',['Growth','Degrowth'],[op.growthCount,op.degrowthCount],[CHART_C.green,CHART_C.red],'mGrowth');
}

// ── Zone Comparison with Rankings ──
const RANK_EMOJIS=['🥇','🥈','🥉','4️⃣','5️⃣'];
const RANK_LABELS=['Champion','Runner-Up','3rd Place','',''];
const RANK_CLASSES=['rank-1','rank-2','rank-3','',''];

function renderZoneComparison(){
  const m=state.master;if(!m)return;
  const zones=(m.zoneSummaries||[]).filter(z=>z.partnerCount>0)
    .sort((a,b)=>b.summary.currentMonthPremium-a.summary.currentMonthPremium);
  if(!zones.length){$('zoneCompareGrid').innerHTML='<div class="empty">No zone data.</div>';return;}

  const maxMTD=zones[0].summary.currentMonthPremium||1;
  const best=zones[0];

  $('zoneBestBanner').innerHTML=`<div style="background:linear-gradient(135deg,#fef3c7,#fde68a);border:1px solid #f59e0b;border-radius:10px;padding:12px 16px;display:flex;align-items:center;gap:12px;">
    <span style="font-size:28px;">🏆</span>
    <div>
      <div style="font-weight:800;font-size:15px;color:#92400e;">Best Performing Zone: ${safe(best.zone)}</div>
      <div style="font-size:12px;color:#b45309;">MTD: ${fmtINR(best.summary.currentMonthPremium)} | ${fmtInt(best.partnerCount)} partners | ${best.summary.achievementPct}% achievement | ${best.summary.momPct>=0?'▲ +':'▼ '}${Math.abs(best.summary.momPct)}% MoM</div>
    </div>
  </div>`;

  $('zoneCompareGrid').innerHTML=zones.map((z,i)=>{
    const s=z.summary,op=z.overallProject;
    const fillPct=Math.round(s.currentMonthPremium/maxMTD*100);
    const badgeClass=i<3?['badge-gold','badge-silver','badge-bronze'][i]:'badge-normal';
    return `<div class="zone-comp-card ${RANK_CLASSES[i]||''}">
      <div class="zone-comp-head">
        <div>
          <div class="zone-comp-name">${RANK_EMOJIS[i]||''} ${safe(z.zone)}</div>
          <div style="font-size:11px;color:#94a3b8;margin-top:2px;">${fmtInt(z.partnerCount)} partners</div>
        </div>
        ${RANK_LABELS[i]?`<span class="zone-comp-badge ${badgeClass}">${RANK_LABELS[i]}</span>`:''}
      </div>
      <div class="zone-bar-wrap">
        <div style="display:flex;justify-content:space-between;font-size:10px;color:#94a3b8;margin-bottom:4px;"><span>MTD vs Best</span><span>${fillPct}%</span></div>
        <div class="zone-bar"><div class="zone-bar-fill" style="width:${fillPct}%;"></div></div>
      </div>
      <div class="zone-kpis">
        <div class="zk"><div class="zk-l">MTD</div><div class="zk-v pos"><b>${fmtINR(s.currentMonthPremium)}</b></div></div>
        <div class="zk"><div class="zk-l">LMTD</div><div class="zk-v">${fmtINR(s.prevMonthPremium)}</div></div>
        <div class="zk"><div class="zk-l">MoM</div><div class="zk-v ${s.momPct>=0?'pos':'neg'}">${s.momPct>=0?'+':''}${s.momPct}%</div></div>
        <div class="zk"><div class="zk-l">Target Ach.</div><div class="zk-v ${s.achievementPct>=80?'pos':s.achievementPct>=40?'':'neg'}">${s.achievementPct}%</div></div>
        <div class="zk"><div class="zk-l">Max Pot.</div><div class="zk-v">${fmtINR(s.totalMaxPotential)}</div></div>
        <div class="zk"><div class="zk-l">Overall Pot.</div><div class="zk-v">${fmtINR(s.totalOverallPotential)}</div></div>
        <div class="zk"><div class="zk-l">Active</div><div class="zk-v pos">${fmtInt(s.activeCount)}</div></div>
        <div class="zk"><div class="zk-l">Inactive</div><div class="zk-v neg">${fmtInt(s.inactiveCount)}</div></div>
        <div class="zk"><div class="zk-l">Connected</div><div class="zk-v pos">${fmtInt(s.connectedCount)}</div></div>
        <div class="zk"><div class="zk-l">Engagement</div><div class="zk-v">${s.engagementPct||Math.round(s.connectedCount/z.partnerCount*100)}%</div></div>
        <div class="zk"><div class="zk-l">Growth%</div><div class="zk-v">${s.growthPct||Math.round(s.growthCount/z.partnerCount*100)}%</div></div>
        <div class="zk"><div class="zk-l">Calls / Visits</div><div class="zk-v pos">${fmtInt(s.totalCalls)}/${fmtInt(s.totalVisits)}</div></div>
      </div>
      <button class="btn-primary" style="width:100%;margin-top:10px;font-size:12px;padding:7px;" onclick="openZoneDrill('${safe(z.zone)}')">View Team Breakdown</button>
      <div class="zone-comp-rank">${i+1}</div>
    </div>`;
  }).join('');

  // Zone comparison charts
  const zLabels=zones.map(z=>z.zone);
  const zColors=zLabels.map(z=>ZONE_COLORS[z]||CHART_C.blue);

  destroyChart('zoneMaxPot');
  state.charts.zoneMaxPot=new Chart($('chartZoneMaxPot'),{type:'bar',data:{labels:zLabels,datasets:[{label:'Max Potential',data:zones.map(z=>z.summary.totalMaxPotential),backgroundColor:zColors,borderRadius:5}]},options:{responsive:true,maintainAspectRatio:false,scales:{y:{ticks:{callback:v=>fmtINR(v)}}},plugins:{legend:{display:false}}}});

  destroyChart('zoneActive');
  state.charts.zoneActive=new Chart($('chartZoneActive'),{type:'bar',data:{labels:zLabels,datasets:[{label:'Active',data:zones.map(z=>z.summary.activeCount),backgroundColor:CHART_C.green},{label:'Inactive',data:zones.map(z=>z.summary.inactiveCount),backgroundColor:CHART_C.red}]},options:{responsive:true,maintainAspectRatio:false,scales:{x:{stacked:true},y:{stacked:true}},plugins:{legend:{position:'bottom'}}}});
}

window.openZoneDrill=function(zoneName){
  const m=state.master;if(!m)return;
  const zoneData=(m.zoneSummaries||[]).find(z=>z.zone===zoneName);
  const s=zoneData?zoneData.summary:null;
  const allRoles={ZH:m.zhPerf||[],RH:m.rhPerf||[],SH:m.shPerf||[],RM:m.rmPerf||[],AM:m.amPerf||[]};
  const byRole={};
  Object.keys(allRoles).forEach(role=>{byRole[role]=allRoles[role].filter(p=>p.zone===zoneName||(!p.zone&&zoneName));});

  $('modalBody').innerHTML=`<h2>${safe(zoneName)} Zone <span class="role-chip">${fmtInt(zoneData?zoneData.partnerCount:0)} partners</span></h2>
  ${s?`<div class="kpi-row">
    <div class="kpi-mini"><div><div class="kpi-mini-label">MTD</div><div class="kpi-mini-val pos">${fmtINR(s.currentMonthPremium)}</div></div></div>
    <div class="kpi-mini"><div><div class="kpi-mini-label">LMTD</div><div class="kpi-mini-val">${fmtINR(s.prevMonthPremium)}</div></div></div>
    <div class="kpi-mini"><div><div class="kpi-mini-label">MoM</div><div class="kpi-mini-val ${s.momPct>=0?'pos':'neg'}">${s.momPct>=0?'+':''}${s.momPct}%</div></div></div>
    <div class="kpi-mini"><div><div class="kpi-mini-label">Ach.</div><div class="kpi-mini-val">${s.achievementPct}%</div></div></div>
    <div class="kpi-mini"><div><div class="kpi-mini-label">Max Pot.</div><div class="kpi-mini-val">${fmtINR(s.totalMaxPotential)}</div></div></div>
    <div class="kpi-mini"><div><div class="kpi-mini-label">Active</div><div class="kpi-mini-val pos">${fmtInt(s.activeCount)}</div></div></div>
    <div class="kpi-mini"><div><div class="kpi-mini-label">Connected</div><div class="kpi-mini-val pos">${fmtInt(s.connectedCount)}</div></div></div>
    <div class="kpi-mini"><div><div class="kpi-mini-label">Calls / Visits</div><div class="kpi-mini-val pos">${fmtInt(s.totalCalls)} / ${fmtInt(s.totalVisits)}</div></div></div>
  </div>`:''}
  ${['ZH','RH','SH','RM','AM'].map(role=>{
    const list=byRole[role];if(!list||!list.length)return '';
    return `<h3>${role} Performance (${list.length})</h3>
    <div class="table-wrap"><table class="ptable"><thead><tr><th>Name</th><th>Partners</th><th>Max Pot.</th><th>Target</th><th>MTD</th><th>LMTD</th><th>MoM%</th><th>Ach%</th><th>Active</th><th>Connected</th><th>Calls</th><th>Visits</th></tr></thead>
    <tbody>${list.map(p=>{const ps=p.summary;const mom=ps.momPct;return `<tr><td><b>${safe(p.name)}</b></td><td>${fmtInt(ps.totalPartners)}</td><td>${fmtINR(ps.totalMaxPotential)}</td><td>${fmtINR(ps.totalTarget)}</td><td class="pos"><b>${fmtINR(ps.currentMonthPremium)}</b></td><td>${fmtINR(ps.prevMonthPremium)}</td><td class="${mom>=0?'pos':'neg'}">${mom>=0?'+':''}${mom}%</td><td class="${ps.achievementPct>=80?'pos':ps.achievementPct>=40?'':'neg'}">${ps.achievementPct}%</td><td class="pos">${fmtInt(ps.activeCount)}</td><td class="pos">${fmtInt(ps.connectedCount)}</td><td class="pos">${fmtInt(ps.totalCalls)}</td><td class="pos">${fmtInt(ps.totalVisits)}</td></tr>`;}).join('')}</tbody>
    </table></div>`;
  }).join('')}`;
  $('drillModal').classList.remove('hidden');
};

$('modalClose').addEventListener('click',()=>$('drillModal').classList.add('hidden'));
$('modalBackdrop').addEventListener('click',()=>$('drillModal').classList.add('hidden'));

// ── Role Performance ──
function renderRoles(){
  const m=state.master;if(!m)return;
  const role=$('fRole').value,search=($('fRoleSearch').value||'').toLowerCase(),sort=$('fRoleSort').value||'mtd';
  const key=role.toLowerCase()+'Perf';
  let list=(m[key]||[]).slice();
  if(search)list=list.filter(p=>p.name.toLowerCase().indexOf(search)!==-1);
  list.sort((a,b)=>{
    if(sort==='mtd')return b.summary.currentMonthPremium-a.summary.currentMonthPremium;
    if(sort==='ach')return b.summary.achievementPct-a.summary.achievementPct;
    if(sort==='partners')return b.summary.totalPartners-a.summary.totalPartners;
    return a.name.localeCompare(b.name);
  });
  if(!list.length){$('roleGrid').innerHTML='<div class="empty">No data for '+role+'.</div>';return;}
  $('roleGrid').innerHTML=list.map(p=>{
    const s=p.summary,mom=s.momPct;
    return `<div class="team-card">
      <div class="team-card-head"><div><div class="team-name">${safe(p.name)}</div><div class="team-role">${role} • ${safe(p.zone)} • ${fmtInt(s.totalPartners)} partners</div></div></div>
      <div class="team-stats">
        <div class="ts"><div class="ts-l">MTD</div><div class="ts-v pos"><b>${fmtINR(s.currentMonthPremium)}</b></div></div>
        <div class="ts"><div class="ts-l">LMTD</div><div class="ts-v">${fmtINR(s.prevMonthPremium)}</div></div>
        <div class="ts"><div class="ts-l">MoM</div><div class="ts-v ${mom>=0?'pos':'neg'}">${mom>=0?'+':''}${mom}%</div></div>
        <div class="ts"><div class="ts-l">Ach.</div><div class="ts-v ${s.achievementPct>=80?'pos':s.achievementPct>=40?'':'neg'}">${s.achievementPct}%</div></div>
        <div class="ts"><div class="ts-l">Max Pot.</div><div class="ts-v">${fmtINR(s.totalMaxPotential)}</div></div>
        <div class="ts"><div class="ts-l">Active</div><div class="ts-v pos">${fmtInt(s.activeCount)}</div></div>
        <div class="ts"><div class="ts-l">Inactive</div><div class="ts-v neg">${fmtInt(s.inactiveCount)}</div></div>
        <div class="ts"><div class="ts-l">Connected</div><div class="ts-v pos">${fmtInt(s.connectedCount)}</div></div>
        <div class="ts"><div class="ts-l">Calls</div><div class="ts-v pos">${fmtInt(s.totalCalls)}</div></div>
        <div class="ts"><div class="ts-l">Visits</div><div class="ts-v pos">${fmtInt(s.totalVisits)}</div></div>
      </div>
    </div>`;
  }).join('');
}
['fRole','fRoleSearch','fRoleSort'].forEach(id=>{const el=$(id);if(!el)return;el.addEventListener(el.tagName==='INPUT'?'input':'change',renderRoles);});

// ── State Ranking ──
function renderStates(){
  const m=state.master;if(!m)return;
  const states=(m.stateSummaries||[]).filter(x=>x.partnerCount>0);
  $('stateTbody').innerHTML=states.map((st,i)=>{
    const s=st.summary,mom=s.momPct;
    const rank=i+1;
    const rankClass=rank===1?'rank-1':rank===2?'rank-2':rank===3?'rank-3':'';
    return `<tr>
      <td class="rank-cell ${rankClass}">${rank===1?'🥇':rank===2?'🥈':rank===3?'🥉':rank}</td>
      <td><b>${safe(st.state)}</b></td>
      <td>${safe(zoneOfState(st.state))}</td>
      <td>${fmtInt(st.partnerCount)}</td>
      <td>${fmtINR(s.totalMaxPotential)}</td>
      <td>${fmtINR(s.totalOverallPotential)}</td>
      <td>${fmtINR(s.totalTarget)}</td>
      <td class="pos"><b>${fmtINR(s.currentMonthPremium)}</b></td>
      <td>${fmtINR(s.prevMonthPremium)}</td>
      <td class="${mom>=0?'pos':'neg'}">${mom>=0?'+':''}${mom}%</td>
      <td class="${s.achievementPct>=80?'pos':s.achievementPct>=40?'':'neg'}">${s.achievementPct}%</td>
      <td class="pos">${fmtInt(s.activeCount)}</td>
      <td class="pos">${fmtInt(s.connectedCount)}</td>
      <td>${st.partnerCount>0?Math.round(s.connectedCount/st.partnerCount*100):0}%</td>
      <td class="pos">${fmtInt(s.totalCalls)}</td>
      <td class="pos">${fmtInt(s.totalVisits)}</td>
    </tr>`;
  }).join('');
}

function zoneOfState(state){
  const s=(state||'').toLowerCase();
  if(['north','ncr','up1','up2','uk','haryana','punjab','delhi'].some(z=>s.indexOf(z)!==-1))return 'North';
  if(['gujarat','rajasthan','mp','mumbai','pune','west'].some(z=>s.indexOf(z)!==-1))return 'West';
  if(['karnataka','kerala','tamil','telangana','andhra','south'].some(z=>s.indexOf(z)!==-1))return 'South';
  if(['bengal','orissa','bihar','jharkhand','east','assam'].some(z=>s.indexOf(z)!==-1))return 'East';
  if(['ron','rom'].some(z=>s.indexOf(z)!==-1))return 'RON';
  return '—';
}

// ── Daily Run Rate ──
function renderMasterRunRateStrip(res){
  if($('m-rr-today'))$('m-rr-today').textContent=fmtINR(res.runRate||0);
  if($('m-rr-mtd'))$('m-rr-mtd').textContent=fmtINR(res.todayMTD||0);
  if($('m-rr-lmtd'))$('m-rr-lmtd').textContent=fmtINR(res.yesterdayMTD||0);
}

function renderMasterRunRate(){
  const hist=state.dailyHistory;
  if(!hist||!hist.length){return;}
  const labels=hist.map(h=>h.date.slice(5));
  const mtdData=hist.map(h=>h.totalMTD);
  const rrData=hist.map((h,i)=>i===0?0:h.totalMTD-hist[i-1].totalMTD);

  destroyChart('mDailyTrend');
  state.charts.mDailyTrend=new Chart($('mChartDailyTrend'),{type:'line',data:{labels,datasets:[{label:'Total MTD',data:mtdData,borderColor:'#2563eb',backgroundColor:'rgba(37,99,235,0.1)',fill:true,tension:0.4,pointRadius:4}]},options:{responsive:true,maintainAspectRatio:false,scales:{y:{ticks:{callback:v=>fmtINR(v)}}},plugins:{legend:{position:'bottom'}}}});

  destroyChart('mRunRate');
  state.charts.mRunRate=new Chart($('mChartRunRate'),{type:'bar',data:{labels:labels.slice(1),datasets:[{label:'Daily Run Rate',data:rrData.slice(1),backgroundColor:rrData.slice(1).map(v=>v>=0?'rgba(22,163,74,0.8)':'rgba(220,38,38,0.8)'),borderRadius:5}]},options:{responsive:true,maintainAspectRatio:false,scales:{y:{ticks:{callback:v=>fmtINR(v)}}},plugins:{legend:{position:'bottom'}}}});

  // Zone-wise trend
  const zones=['North','South','East','West','RON'];
  const zoneKeys=['northMTD','southMTD','eastMTD','westMTD','ronMTD'];
  destroyChart('mZoneTrend');
  state.charts.mZoneTrend=new Chart($('mChartZoneTrend'),{type:'line',data:{labels,datasets:zones.map((z,i)=>({label:z,data:hist.map(h=>h[zoneKeys[i]]||0),borderColor:Object.values(ZONE_COLORS)[i],backgroundColor:'transparent',tension:0.3,pointRadius:3}))},options:{responsive:true,maintainAspectRatio:false,scales:{y:{ticks:{callback:v=>fmtINR(v)}}},plugins:{legend:{position:'bottom'}}}});
}

// ── Logins ──
function loadLogins(){
  setStatus('Loading login activity…','loading');
  fetch(API_URL+'?action=getLoginStats&gid='+encodeURIComponent(user.gid))
    .then(r=>r.json()).then(res=>{
      if(!res.success){setStatus(res.message||'Failed.','error');return;}
      state.logins=res;renderLogins();setStatus('','');
    }).catch(err=>setStatus('Error: '+err.message,'error'));
}
function renderLogins(){
  if(!state.logins)return;
  $('loginTotal').textContent=fmtInt(state.logins.totalLogins);
  $('loginUsers').textContent=fmtInt((state.logins.stats||[]).length);
  const search=($('fLoginSearch').value||'').toLowerCase();
  const list=(state.logins.stats||[]).filter(s=>!search||(s.name+' '+s.gid+' '+s.role).toLowerCase().indexOf(search)!==-1).sort((a,b)=>b.count-a.count);
  $('loginsTbody').innerHTML=list.map(s=>`<tr><td><b>${safe(s.name)}</b></td><td>${safe(s.gid)}</td><td>${safe(s.role)}</td><td>${safe(s.zone)}</td><td>${fmtInt(s.count)}</td><td>${safe(String(s.lastLogin).slice(0,10))}</td></tr>`).join('');
}
$('fLoginSearch').addEventListener('input',renderLogins);
$('btnRefreshLogins').addEventListener('click',loadLogins);

loadMaster();
})();
