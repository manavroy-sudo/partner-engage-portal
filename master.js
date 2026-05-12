// =============================================
// Partner Engage — Master Dashboard
// master.js
// =============================================

let masterData = null;
let zoneChartInst = null;

function parseNum(v) {
  if (!v && v !== 0) return 0;
  return parseFloat(String(v).replace(/[₹,%\s,]/g,'')) || 0;
}
function fmtINR(n) {
  n = Math.round(parseNum(n));
  if (n >= 10000000) return '₹' + (n/10000000).toFixed(2) + 'Cr';
  if (n >= 100000)   return '₹' + (n/100000).toFixed(2) + 'L';
  if (n >= 1000)     return '₹' + (n/1000).toFixed(1) + 'K';
  return '₹' + n.toLocaleString('en-IN');
}
function fmtFull(n) { return '₹' + Math.round(parseNum(n)).toLocaleString('en-IN'); }
function pctColor(p) { return p>=75?'green':p>=40?'amber':'red'; }
function initials(name) { return (name||'--').trim().split(/\s+/).map(w=>w[0]).join('').toUpperCase().slice(0,2); }
function logout() { sessionStorage.removeItem('pe_user'); window.location.href='index.html'; }

async function callAPI(params) {
  const url = new URL(API_URL);
  Object.entries(params).forEach(([k,v]) => url.searchParams.append(k,v));
  const res = await fetch(url.toString());
  return res.json();
}

async function initMaster() {
  const raw = sessionStorage.getItem('pe_user');
  if (!raw) { window.location.href='index.html'; return; }
  const user = JSON.parse(raw);
  document.getElementById('userAvatar').textContent = initials(user.name);
  document.getElementById('userName').textContent   = user.name;

  try {
    const data = await callAPI({ action:'getMaster', gid:user.gid });
    if (!data.success) {
      document.querySelector('.main-content').innerHTML =
        `<div style="padding:40px;text-align:center;color:var(--red)">Access denied: ${data.message}</div>`;
      return;
    }
    masterData = data;
    renderOverview(data);
    renderZoneGrid(data.zoneSummaries||[]);
    renderStates(data.stateSummaries||[]);
    buildZoneFilterForHeads(data.zoneSummaries||[]);
  } catch(e) {
    document.querySelector('.main-content').innerHTML =
      `<div style="padding:40px;text-align:center;color:var(--red)">Error loading master data: ${e.message}</div>`;
  }
}

function switchMasterTab(tab) {
  ['overview','zones','heads','states','logins'].forEach(t => {
    const el = document.getElementById('mPanel'+t.charAt(0).toUpperCase()+t.slice(1));
    if (el) el.style.display = t===tab?'block':'none';
  });
  document.querySelectorAll('.tab-btn').forEach((b,i) => {
    b.classList.toggle('active', ['overview','zones','heads','states','logins'][i]===tab);
  });
  if (tab==='logins') loadLoginStats();
  if (tab==='heads')  renderHeadsTab();
}

// ─── OVERVIEW ────────────────────────────────────────────────
function renderOverview(d) {
  const s = d.overallSummary||{};
  const curr = s.currentMonthPremium||0, prev = s.prevMonthPremium||0;
  const mom = prev>0?((curr-prev)/prev*100).toFixed(1):null;
  const momB = mom!==null?`<div class="sc-badge ${parseFloat(mom)>=0?'up':'down'}">${parseFloat(mom)>=0?'▲':'▼'} ${Math.abs(mom)}% MoM</div>`:'';
  const achPct = s.totalTarget>0?Math.round(curr/s.totalTarget*100):0;

  const cards = [
    { label:'👥 Total Partners',  val: d.totalPartners,            cls:'' },
    { label:'💰 Total Potential', val: fmtINR(s.totalPotential),   cls:'' },
    { label:'🎯 May Target',      val: fmtINR(s.totalTarget),      cls:'' },
    { label:'📅 MTD May\'26',     val: fmtINR(curr),               cls:'', badge:momB },
    { label:'📅 LMTD Apr\'26',    val: fmtINR(prev),               cls:'' },
    { label:'🏆 Target Ach.',     val: achPct+'%',                 cls:pctColor(achPct) },
    { label:'✅ Active',          val: s.activeCount||0,           cls:'green' },
    { label:'📈 Growth',          val: s.growthCount||0,           cls:'green' },
  ];

  document.getElementById('mOverallCards').innerHTML = cards.map(c=>`
    <div class="summary-card">
      <div class="sc-label">${c.label}</div>
      <div class="sc-value ${c.cls}">${c.val}</div>
      ${c.badge||''}
    </div>`).join('');

  // Zone bar chart
  const zones = d.zoneSummaries||[];
  if (zoneChartInst) { zoneChartInst.destroy(); zoneChartInst=null; }
  const ctx = document.getElementById('zoneChart').getContext('2d');
  zoneChartInst = new Chart(ctx, {
    type:'bar',
    data:{
      labels: zones.map(z=>z.zone),
      datasets:[
        { label:'MTD (May\'26)', data:zones.map(z=>z.summary.currentMonthPremium||0), backgroundColor:'rgba(224,90,43,0.8)', borderRadius:4 },
        { label:'Target',        data:zones.map(z=>z.summary.totalTarget||0),         backgroundColor:'rgba(59,130,246,0.3)', borderRadius:4 }
      ]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:true} },
      scales:{
        x:{grid:{display:false}, ticks:{font:{size:11}}},
        y:{ticks:{callback:v=>fmtINR(v),font:{size:10}}}
      }
    }
  });
}

// ─── ZONE GRID ───────────────────────────────────────────────
function renderZoneGrid(zones) {
  document.getElementById('zoneGrid').innerHTML = zones.map(z => {
    const s = z.summary;
    const curr = s.currentMonthPremium||0, tgt = s.totalTarget||0;
    const achPct = tgt>0?Math.min(Math.round(curr/tgt*100),999):0;
    const achCls = pctColor(achPct);
    const prev = s.prevMonthPremium||0;
    const mom = prev>0?((curr-prev)/prev*100).toFixed(1):null;
    const momStr = mom!==null?`<span style="font-size:11px;font-weight:600;color:${parseFloat(mom)>=0?'var(--green)':'var(--red)'}">${parseFloat(mom)>=0?'▲ +':'▼ '}${mom}%</span>`:'';

    return `<div class="zone-card">
      <div class="zone-card-title">${z.zone}</div>
      <div class="zone-card-sub">${z.partnerCount} partners ${momStr}</div>
      <div class="zone-stats">
        <div class="team-stat"><div class="zone-stat-val">${fmtINR(curr)}</div><div class="zone-stat-lbl">MTD</div></div>
        <div class="team-stat"><div class="zone-stat-val">${tgt>0?fmtINR(tgt):'—'}</div><div class="zone-stat-lbl">Target</div></div>
        <div class="team-stat"><div class="zone-stat-val ${achCls}">${achPct}%</div><div class="zone-stat-lbl">Achievement</div></div>
        <div class="team-stat"><div class="zone-stat-val green">${s.activeCount||0}</div><div class="zone-stat-lbl">Active</div></div>
        <div class="team-stat"><div class="zone-stat-val green">${s.growthCount||0}</div><div class="zone-stat-lbl">Growth</div></div>
        <div class="team-stat"><div class="zone-stat-val red">${s.inactiveCount||0}</div><div class="zone-stat-lbl">Inactive</div></div>
      </div>
      <div class="team-progress-wrap">
        <div class="team-progress-label"><span>Target Achievement</span><span style="font-weight:600">${achPct}%</span></div>
        <div class="team-progress-bar">
          <div class="team-progress-fill" style="width:${Math.min(achPct,100)}%;background:${achCls==='green'?'var(--green)':achCls==='amber'?'#d97706':'var(--red)'}"></div>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ─── HEADS TAB ───────────────────────────────────────────────
function buildZoneFilterForHeads(zones) {
  const sel = document.getElementById('zoneFilterHeads');
  const zoneNames = [...new Set(zones.map(z=>z.zone))].sort();
  sel.innerHTML = '<option value="">All zones</option>' + zoneNames.map(z=>`<option>${z}</option>`).join('');
}

function renderHeadsTab() {
  if (!masterData) return;
  const role      = document.getElementById('roleFilter').value;
  const zoneFilter= document.getElementById('zoneFilterHeads').value;
  const dataMap   = { ZH:'zhPerf', RH:'rhPerf', SH:'shPerf', RM:'rmPerf', AM:'amPerf' };
  let rows        = masterData[dataMap[role]] || [];
  if (zoneFilter) rows = rows.filter(r=>r.zone===zoneFilter);

  document.getElementById('headsBody').innerHTML = rows.length===0
    ? `<tr><td colspan="11" class="loading-row">No data.</td></tr>`
    : rows.map(r => {
        const s    = r.summary;
        const curr = s.currentMonthPremium||0, tgt = s.totalTarget||0, prev = s.prevMonthPremium||0;
        const achPct = tgt>0?Math.min(Math.round(curr/tgt*100),999):0;
        const achCls = pctColor(achPct);
        const mom  = prev>0?((curr-prev)/prev*100).toFixed(1):null;
        const momS = mom!==null?`<span class="${parseFloat(mom)>=0?'mom-up':'mom-down'}">${parseFloat(mom)>=0?'▲ +':'▼ '}${mom}%</span>`:'—';
        return `<tr>
          <td><strong>${r.name}</strong></td>
          <td><span class="role-badge">${r.role}</span></td>
          <td>${r.zone||'—'}</td>
          <td>${r.partnerCount}</td>
          <td>${fmtINR(s.totalPotential||0)}</td>
          <td>${tgt>0?fmtINR(tgt):'—'}</td>
          <td><strong>${fmtINR(curr)}</strong></td>
          <td>${fmtINR(prev)}</td>
          <td>${momS}</td>
          <td>
            <div class="progress-wrap">
              <div class="progress-bar"><div class="progress-fill ${achCls}" style="width:${Math.min(achPct,100)}%"></div></div>
              <span class="pct-label ${achCls}">${achPct}%</span>
            </div>
          </td>
          <td>${s.activeCount||0} / ${r.partnerCount}</td>
        </tr>`;
      }).join('');
}

// ─── STATES ──────────────────────────────────────────────────
function renderStates(states) {
  document.getElementById('statesBody').innerHTML = states.map(st => {
    const s = st.summary;
    const curr = s.currentMonthPremium||0, tgt = s.totalTarget||0, prev = s.prevMonthPremium||0;
    const achPct = tgt>0?Math.min(Math.round(curr/tgt*100),999):0;
    const achCls = pctColor(achPct);
    const mom = prev>0?((curr-prev)/prev*100).toFixed(1):null;
    const momS = mom!==null?`<span class="${parseFloat(mom)>=0?'mom-up':'mom-down'}">${parseFloat(mom)>=0?'▲ +':'▼ '}${mom}%</span>`:'—';

    // Guess zone from state name
    const zoneGuess = guessZone(st.state);

    return `<tr>
      <td><strong>${st.state}</strong></td>
      <td><span style="font-size:11px;color:var(--gray-500)">${zoneGuess}</span></td>
      <td>${st.partnerCount}</td>
      <td>${fmtINR(s.totalPotential||0)}</td>
      <td>${tgt>0?fmtINR(tgt):'—'}</td>
      <td><strong>${fmtINR(curr)}</strong></td>
      <td>${fmtINR(prev)}</td>
      <td>${momS}</td>
      <td>
        <div class="progress-wrap">
          <div class="progress-bar"><div class="progress-fill ${achCls}" style="width:${Math.min(achPct,100)}%"></div></div>
          <span class="pct-label ${achCls}">${achPct}%</span>
        </div>
      </td>
      <td>${s.activeCount||0}</td>
    </tr>`;
  }).join('');
}

function guessZone(state) {
  const s=(state||'').toLowerCase();
  if(['north key','ncr','up','uk','delhi','north'].some(z=>s.includes(z))) return 'North';
  if(['gujarat','rajasthan','mp','cg'].some(z=>s.includes(z))) return 'West';
  if(['karnataka','kerala','tamil','telangana','andhra'].some(z=>s.includes(z))) return 'South';
  if(['bengal','orissa','north east','bihar','jharkhand'].some(z=>s.includes(z))) return 'East';
  if(['mumbai','pune'].some(z=>s.includes(z))) return 'West';
  if(['haryana','punjab','chandigarh','himachal','j&k','rom'].some(z=>s.includes(z))) return 'RON';
  return '—';
}

// ─── LOGIN STATS ─────────────────────────────────────────────
async function loadLoginStats() {
  const raw = sessionStorage.getItem('pe_user');
  if (!raw) return;
  const user = JSON.parse(raw);
  const el = document.getElementById('loginStats');
  el.innerHTML = '<div class="card-skel" style="height:40px"></div>';
  try {
    const data = await callAPI({ action:'getLoginStats', gid:user.gid });
    if (!data.success) { el.innerHTML='<p style="color:var(--red)">'+data.message+'</p>'; return; }
    const stats = data.stats||[];
    el.innerHTML = `
      <div style="margin-bottom:12px">
        <span class="login-badge">🟢 ${stats.length} unique users have logged in (${data.totalLogins} total sessions)</span>
      </div>
      <div class="table-wrap">
        <table class="head-table">
          <thead><tr><th>GID</th><th>Name</th><th>Role</th><th>Zone</th><th>Login Count</th><th>Last Login</th></tr></thead>
          <tbody>${stats.length===0?'<tr><td colspan="6" class="loading-row">No login data yet.</td></tr>':
            stats.sort((a,b)=>b.count-a.count).map(s=>`
            <tr>
              <td>${s.gid}</td>
              <td><strong>${s.name}</strong></td>
              <td><span class="role-badge">${s.role}</span></td>
              <td>${s.zone}</td>
              <td><strong>${s.count}</strong></td>
              <td style="font-size:11px;color:var(--gray-400)">${new Date(s.lastLogin).toLocaleString('en-IN')}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  } catch(e) { el.innerHTML='<p style="color:var(--red)">Error loading login data.</p>'; }
}

document.addEventListener('DOMContentLoaded', initMaster);
