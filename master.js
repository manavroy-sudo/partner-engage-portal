// ====================================================================
// master.js — v9   (National Head Dashboard)
// NEW IN v9: Call & Visit Tracker tab (renderCallVisitTab)
// ====================================================================

// ── Auth guard ──────────────────────────────────────────────────────
const masterToken = localStorage.getItem('partnerToken');
const masterUser  = JSON.parse(localStorage.getItem('partnerUser') || '{}');
if (!masterToken) { window.location.href = 'index.html'; }

// ── Tab routing ─────────────────────────────────────────────────────
let cvData       = null;   // cached call/visit payload
let cvChartCalled  = null;
let cvChartVisited = null;
let activeOwnerRole = 'AM';

document.querySelectorAll('.tab-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    var tab = btn.dataset.tab;
    document.getElementById('tab-' + tab).classList.add('active');

    if (tab === 'pan-india')   loadPanIndia();
    if (tab === 'zone-perf')   loadZonePerf();
    if (tab === 'callvisit')   loadCallVisit();
    if (tab === 'role-perf')   loadRolePerf();
    if (tab === 'state-perf')  loadStatePerf();
    if (tab === 'login-log')   loadLoginLog();
  });
});

// ── Helpers ─────────────────────────────────────────────────────────
function fmt(n)    { return (n || 0).toLocaleString('en-IN'); }
function fmtCr(n)  { return '₹' + ((n||0)/1e7).toFixed(2) + ' Cr'; }
function pct(a, b) { return b ? Math.round((a/b)*100) : 0; }
function pctBadge(p) {
  var cls = p >= 70 ? 'high' : p >= 40 ? 'medium' : 'low';
  return `<span class="pct-badge ${cls}">${p}%</span>`;
}
function rankBadge(i) {
  if (i === 0) return '<span class="rank r1">1</span>';
  if (i === 1) return '<span class="rank r2">2</span>';
  if (i === 2) return '<span class="rank r3">3</span>';
  return `<span class="rank rn">${i+1}</span>`;
}

async function apiFetch(action, extra) {
  var params = Object.assign({ action, token: masterToken }, extra || {});
  var qs = Object.keys(params).map(k => k + '=' + encodeURIComponent(params[k])).join('&');
  var res = await fetch(API_URL + '?' + qs);
  return res.json();
}

function logout() {
  localStorage.clear();
  window.location.href = 'index.html';
}

// ════════════════════════════════════════════════════════════════════
// PAN-INDIA OVERVIEW
// ════════════════════════════════════════════════════════════════════
let panLoaded = false;
async function loadPanIndia() {
  if (panLoaded) return;
  panLoaded = true;
  try {
    var d = await apiFetch('getMasterDashboard');
    if (!d.success) { document.getElementById('pan-kpis').innerHTML = `<p style="color:red">Error: ${d.error}</p>`; return; }
    var p = d.data || d;

    document.getElementById('pan-kpis').innerHTML = `
      <div class="kpi-card"><div class="kpi-label">Total Partners</div><div class="kpi-value">${fmt(p.totalPartners)}</div></div>
      <div class="kpi-card blue"><div class="kpi-label">MTD Business</div><div class="kpi-value">${fmtCr(p.mtd)}</div></div>
      <div class="kpi-card"><div class="kpi-label">LMTD</div><div class="kpi-value">${fmtCr(p.lmtd)}</div></div>
      <div class="kpi-card"><div class="kpi-label">Max Potential</div><div class="kpi-value">${fmtCr(p.maxPotential)}</div></div>
      <div class="kpi-card"><div class="kpi-label">Overall Potential</div><div class="kpi-value">${fmtCr(p.overallPotential)}</div></div>
      <div class="kpi-card green"><div class="kpi-label">Active Partners</div><div class="kpi-value">${fmt(p.active)}</div></div>
      <div class="kpi-card red"><div class="kpi-label">Inactive Partners</div><div class="kpi-value">${fmt(p.inactive)}</div></div>
      <div class="kpi-card blue"><div class="kpi-label">Total Calls</div><div class="kpi-value">${fmt(p.totalCalls)}</div></div>
      <div class="kpi-card green"><div class="kpi-label">Total Visits</div><div class="kpi-value">${fmt(p.totalVisits)}</div></div>
    `;

    // Charts
    var zones = p.zones || [];
    var labels = zones.map(z => z.zone);
    drawBar('chartZoneMtd',    labels, zones.map(z=>z.mtd),        'MTD (₹)',        '#2563eb');
    drawBar('chartZoneActive', labels, zones.map(z=>z.active),     'Active Partners','#16a34a');
    drawBar('chartZonePot',    labels, zones.map(z=>z.maxPotential),'Max Potential', '#9333ea');
    drawGroupedBar('chartMtdLmtd', labels, zones.map(z=>z.mtd), zones.map(z=>z.lmtd));
  } catch(e) {
    document.getElementById('pan-kpis').innerHTML = `<p style="color:red">Failed to load: ${e.message}</p>`;
  }
}

function drawBar(id, labels, data, label, color) {
  var ctx = document.getElementById(id);
  if (!ctx) return;
  if (ctx._chart) ctx._chart.destroy();
  ctx._chart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ label, data, backgroundColor: color+'99', borderColor: color, borderWidth:1 }] },
    options: { responsive:true, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true}} }
  });
}
function drawGroupedBar(id, labels, mtd, lmtd) {
  var ctx = document.getElementById(id);
  if (!ctx) return;
  if (ctx._chart) ctx._chart.destroy();
  ctx._chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label:'MTD',  data:mtd,  backgroundColor:'#2563eb99', borderColor:'#2563eb', borderWidth:1 },
        { label:'LMTD', data:lmtd, backgroundColor:'#94a3b899', borderColor:'#94a3b8', borderWidth:1 }
      ]
    },
    options: { responsive:true, scales:{y:{beginAtZero:true}} }
  });
}

// ════════════════════════════════════════════════════════════════════
// ZONE PERFORMANCE
// ════════════════════════════════════════════════════════════════════
let zoneLoaded = false;
async function loadZonePerf() {
  if (zoneLoaded) return; zoneLoaded = true;
  try {
    var d = await apiFetch('getMasterDashboard');
    var zones = (d.data || d).zones || [];
    var colors = { North:'north', South:'south', 'East & Central':'east', West:'west', RON:'ron', TELE_RM:'tele' };
    var html = '<div class="zone-cards">';
    zones.forEach(function(z) {
      var cls = colors[z.zone] || '';
      html += `
        <div class="zone-card ${cls}">
          <h3>📍 ${z.zone} Zone</h3>
          <div class="zh-tag">ZH: ${z.zhName || '—'}</div>
          <div class="zone-stat-row"><span class="zsr-label">Total Partners</span><span class="zsr-val">${fmt(z.totalPartners)}</span></div>
          <div class="zone-stat-row"><span class="zsr-label">MTD</span><span class="zsr-val">${fmtCr(z.mtd)}</span></div>
          <div class="zone-stat-row"><span class="zsr-label">Max Potential</span><span class="zsr-val">${fmtCr(z.maxPotential)}</span></div>
          <div class="zone-stat-row"><span class="zsr-label">Active / Inactive</span><span class="zsr-val">${fmt(z.active)} / ${fmt(z.inactive)}</span></div>
          <div class="zone-stat-row"><span class="zsr-label">Calls / Visits</span><span class="zsr-val">${fmt(z.totalCalls)} / ${fmt(z.totalVisits)}</span></div>
          <div class="zone-stat-row"><span class="zsr-label">Achievement</span><span class="zsr-val">${pct(z.mtd,z.target)}%</span></div>
        </div>`;
    });
    html += '</div>';
    document.getElementById('zone-perf-content').innerHTML = html;
  } catch(e) { document.getElementById('zone-perf-content').innerHTML = `<p style="color:red">${e.message}</p>`; }
}

// ════════════════════════════════════════════════════════════════════
// CALL & VISIT TRACKER  ★ NEW IN v9 ★
// ════════════════════════════════════════════════════════════════════
let cvLoaded = false;
async function loadCallVisit() {
  if (cvLoaded && cvData) { renderCallVisitFull(cvData); return; }
  document.getElementById('cv-kpi-row').innerHTML = '<div class="tab-loader"><div class="spinner"></div> Loading call & visit data…</div>';

  try {
    var d = await apiFetch('getCallVisitStats');
    if (!d.success) throw new Error(d.error || 'API error');
    cvData   = d;
    cvLoaded = true;
    renderCallVisitFull(d);
  } catch(e) {
    document.getElementById('cv-kpi-row').innerHTML = `<p style="color:red;padding:20px">Failed to load: ${e.message}</p>`;
  }
}

function renderCallVisitFull(d) {
  var ov = d.overall || {};
  var calledPct  = pct(ov.called,  ov.total);
  var visitedPct = pct(ov.visited, ov.total);

  // ── KPI Cards ───────────────────────────────────────────────────
  document.getElementById('cv-kpi-row').innerHTML = `
    <div class="kpi-card"><div class="kpi-label">Total Partners</div><div class="kpi-value">${fmt(ov.total)}</div><div class="kpi-sub">Across all zones</div></div>
    <div class="kpi-card blue"><div class="kpi-label">Partners Called</div><div class="kpi-value">${fmt(ov.called)}</div><div class="kpi-sub">${calledPct}% coverage</div></div>
    <div class="kpi-card red"><div class="kpi-label">Not Called</div><div class="kpi-value">${fmt(ov.notCalled)}</div><div class="kpi-sub">${100-calledPct}% pending</div></div>
    <div class="kpi-card green"><div class="kpi-label">Partners Visited</div><div class="kpi-value">${fmt(ov.visited)}</div><div class="kpi-sub">${visitedPct}% coverage</div></div>
    <div class="kpi-card amber"><div class="kpi-label">Not Visited</div><div class="kpi-value">${fmt(ov.notVisited)}</div><div class="kpi-sub">${100-visitedPct}% pending</div></div>
    <div class="kpi-card blue"><div class="kpi-label">Total Calls Made</div><div class="kpi-value">${fmt(ov.callsSum)}</div><div class="kpi-sub">Sum of all call counts</div></div>
    <div class="kpi-card green"><div class="kpi-label">Total Visits Made</div><div class="kpi-value">${fmt(ov.visitsSum)}</div><div class="kpi-sub">Sum of all visit counts</div></div>
  `;

  // ── Charts ───────────────────────────────────────────────────────
  document.getElementById('cv-chart-row').style.display = '';
  var zones = d.byZone || [];
  var zLabels = zones.map(z => z.zone);
  drawCvStackedBar('chartCvCalled',  zLabels, zones.map(z=>z.called),  zones.map(z=>z.notCalled),  'Called','Not Called','#2563eb','#fca5a5');
  drawCvStackedBar('chartCvVisited', zLabels, zones.map(z=>z.visited), zones.map(z=>z.notVisited), 'Visited','Not Visited','#16a34a','#fcd34d');

  // ── Zone table ───────────────────────────────────────────────────
  document.getElementById('cv-zone-title').style.display = '';
  document.getElementById('cv-zone-table-wrap').style.display = '';
  var zoneHtml = `
    <table class="data-table">
      <thead><tr>
        <th>Zone</th><th>Total</th>
        <th>Called</th><th>% Called</th><th>Not Called</th>
        <th>Visited</th><th>% Visited</th><th>Not Visited</th>
        <th>Total Calls</th><th>Total Visits</th>
      </tr></thead><tbody>`;
  zones.forEach(function(z) {
    var cp = pct(z.called,  z.total);
    var vp = pct(z.visited, z.total);
    zoneHtml += `<tr>
      <td><strong>${z.zone}</strong></td>
      <td>${fmt(z.total)}</td>
      <td>${fmt(z.called)}</td>
      <td>${pctBadge(cp)}<br><div class="prog-wrap"><div class="prog-fill called" style="width:${cp}%"></div></div></td>
      <td>${fmt(z.notCalled)}</td>
      <td>${fmt(z.visited)}</td>
      <td>${pctBadge(vp)}<br><div class="prog-wrap"><div class="prog-fill visited" style="width:${vp}%"></div></div></td>
      <td>${fmt(z.notVisited)}</td>
      <td>${fmt(z.callsSum)}</td>
      <td>${fmt(z.visitsSum)}</td>
    </tr>`;
  });
  zoneHtml += '</tbody></table>';
  document.getElementById('cv-zone-table-wrap').innerHTML = zoneHtml;

  // ── ZH table ─────────────────────────────────────────────────────
  document.getElementById('cv-zh-title').style.display = '';
  document.getElementById('cv-zh-table-wrap').style.display = '';
  var zhArr = (d.byZH || []).sort(function(a,b){ return b.callsSum-a.callsSum; });
  var zhHtml = `
    <table class="data-table">
      <thead><tr>
        <th>#</th><th>Zone Head (ZH)</th><th>Zone</th>
        <th>Total Partners</th><th>Called</th><th>% Called</th>
        <th>Visited</th><th>% Visited</th>
        <th>Total Calls</th><th>Total Visits</th>
      </tr></thead><tbody>`;
  zhArr.forEach(function(z, i) {
    var cp = pct(z.called,  z.total);
    var vp = pct(z.visited, z.total);
    zhHtml += `<tr>
      <td>${rankBadge(i)}</td>
      <td><strong>${z.zhName}</strong></td>
      <td>${z.zone}</td>
      <td>${fmt(z.total)}</td>
      <td>${fmt(z.called)}</td>
      <td>${pctBadge(cp)}</td>
      <td>${fmt(z.visited)}</td>
      <td>${pctBadge(vp)}</td>
      <td><strong>${fmt(z.callsSum)}</strong></td>
      <td><strong>${fmt(z.visitsSum)}</strong></td>
    </tr>`;
  });
  zhHtml += '</tbody></table>';
  document.getElementById('cv-zh-table-wrap').innerHTML = zhHtml;

  // ── Owner role tabs ───────────────────────────────────────────────
  document.getElementById('cv-owner-title').style.display = '';
  document.getElementById('cv-role-tabs').style.display   = '';
  document.getElementById('cv-owner-table-wrap').style.display = '';
  renderOwnerTable(activeOwnerRole, d.byOwnerRole || {});

  // Role tab click
  document.querySelectorAll('#cv-role-tabs .role-tab-btn').forEach(function(btn) {
    btn.onclick = function() {
      document.querySelectorAll('#cv-role-tabs .role-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeOwnerRole = btn.dataset.role;
      renderOwnerTable(activeOwnerRole, d.byOwnerRole || {});
    };
  });
}

function renderOwnerTable(role, byOwnerRole) {
  var arr = byOwnerRole[role] || [];
  if (!arr.length) {
    document.getElementById('cv-owner-table-wrap').innerHTML =
      `<p style="padding:20px;color:#64748b">No data found for role: ${role}</p>`;
    return;
  }
  var html = `
    <table class="data-table">
      <thead><tr>
        <th>#</th><th>${role} Name</th><th>Zone</th>
        <th>Partners</th>
        <th>Called</th><th>% Called</th>
        <th>Visited</th><th>% Visited</th>
        <th>Total Calls</th><th>Total Visits</th>
        <th>Call Rate</th>
      </tr></thead><tbody>`;
  arr.forEach(function(o, i) {
    var cp = pct(o.called,  o.total);
    var vp = pct(o.visited, o.total);
    var callRate = o.total ? (o.callsSum / o.total).toFixed(1) : '0';
    html += `<tr>
      <td>${rankBadge(i)}</td>
      <td><strong>${o.name}</strong></td>
      <td>${o.zone}</td>
      <td>${fmt(o.total)}</td>
      <td>${fmt(o.called)}</td>
      <td>${pctBadge(cp)}<br><div class="prog-wrap"><div class="prog-fill called" style="width:${cp}%"></div></div></td>
      <td>${fmt(o.visited)}</td>
      <td>${pctBadge(vp)}<br><div class="prog-wrap"><div class="prog-fill visited" style="width:${vp}%"></div></div></td>
      <td><strong>${fmt(o.callsSum)}</strong></td>
      <td><strong>${fmt(o.visitsSum)}</strong></td>
      <td>${callRate}x avg</td>
    </tr>`;
  });
  html += '</tbody></table>';
  document.getElementById('cv-owner-table-wrap').innerHTML = html;
}

function drawCvStackedBar(id, labels, yes, no, yesLabel, noLabel, yesColor, noColor) {
  var ctx = document.getElementById(id);
  if (!ctx) return;
  if (ctx._chart) ctx._chart.destroy();
  ctx._chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: yesLabel, data: yes, backgroundColor: yesColor + 'cc' },
        { label: noLabel,  data: no,  backgroundColor: noColor  + 'cc' }
      ]
    },
    options: {
      responsive: true,
      scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } },
      plugins: { legend: { position: 'bottom' } }
    }
  });
}

// ════════════════════════════════════════════════════════════════════
// ROLE PERFORMANCE
// ════════════════════════════════════════════════════════════════════
let roleLoaded = false;
async function loadRolePerf() {
  if (roleLoaded) return; roleLoaded = true;
  try {
    var d = await apiFetch('getMasterDashboard');
    var roles = (d.data || d).rolePerf || [];
    var html = `<div class="data-table-wrap"><table class="data-table">
      <thead><tr>
        <th>Name</th><th>Role</th><th>Zone</th>
        <th>Partners</th><th>MTD</th><th>LMTD</th><th>MoM</th>
        <th>Active</th><th>Calls</th><th>Visits</th>
      </tr></thead><tbody>`;
    roles.forEach(function(r) {
      var mom = r.lmtd ? (((r.mtd-r.lmtd)/r.lmtd)*100).toFixed(1) : '—';
      var momColor = parseFloat(mom) >= 0 ? '#16a34a' : '#dc2626';
      html += `<tr>
        <td><strong>${r.name}</strong></td>
        <td>${r.role}</td><td>${r.zone||'—'}</td>
        <td>${fmt(r.partners)}</td>
        <td>${fmtCr(r.mtd)}</td><td>${fmtCr(r.lmtd)}</td>
        <td style="color:${momColor};font-weight:700">${mom}%</td>
        <td>${fmt(r.active)}</td>
        <td>${fmt(r.calls)}</td><td>${fmt(r.visits)}</td>
      </tr>`;
    });
    html += '</tbody></table></div>';
    document.getElementById('role-perf-content').innerHTML = html;
  } catch(e) { document.getElementById('role-perf-content').innerHTML = `<p style="color:red">${e.message}</p>`; }
}

// ════════════════════════════════════════════════════════════════════
// STATE PERFORMANCE
// ════════════════════════════════════════════════════════════════════
let stateLoaded = false;
async function loadStatePerf() {
  if (stateLoaded) return; stateLoaded = true;
  try {
    var d = await apiFetch('getMasterDashboard');
    var states = (d.data || d).statePerf || [];
    states.sort((a,b) => b.mtd - a.mtd);
    var html = `<div class="data-table-wrap"><table class="data-table">
      <thead><tr><th>#</th><th>State</th><th>Zone</th><th>Partners</th>
      <th>MTD</th><th>LMTD</th><th>Active</th><th>Calls</th><th>Visits</th></tr></thead><tbody>`;
    states.forEach(function(s, i) {
      html += `<tr><td>${rankBadge(i)}</td><td><strong>${s.state}</strong></td>
        <td>${s.zone||'—'}</td><td>${fmt(s.partners)}</td>
        <td>${fmtCr(s.mtd)}</td><td>${fmtCr(s.lmtd)}</td>
        <td>${fmt(s.active)}</td><td>${fmt(s.calls)}</td><td>${fmt(s.visits)}</td></tr>`;
    });
    html += '</tbody></table></div>';
    document.getElementById('state-perf-content').innerHTML = html;
  } catch(e) { document.getElementById('state-perf-content').innerHTML = `<p style="color:red">${e.message}</p>`; }
}

// ════════════════════════════════════════════════════════════════════
// LOGIN ACTIVITY
// ════════════════════════════════════════════════════════════════════
let loginLoaded = false;
async function loadLoginLog() {
  if (loginLoaded) return; loginLoaded = true;
  try {
    var d = await apiFetch('getLoginLog');
    var logs = d.logs || [];
    var html = `<div class="data-table-wrap"><table class="data-table">
      <thead><tr><th>Name</th><th>Role</th><th>Zone</th><th>Last Login</th><th>Login Count</th></tr></thead><tbody>`;
    logs.forEach(function(l) {
      html += `<tr><td><strong>${l.name}</strong></td><td>${l.role}</td>
        <td>${l.zone||'—'}</td><td>${l.lastLogin}</td><td>${l.count}</td></tr>`;
    });
    html += '</tbody></table></div>';
    document.getElementById('login-log-content').innerHTML = html;
  } catch(e) { document.getElementById('login-log-content').innerHTML = `<p style="color:red">${e.message}</p>`; }
}

// ── Boot: load pan-india on page load ────────────────────────────────
window.addEventListener('DOMContentLoaded', loadPanIndia);
