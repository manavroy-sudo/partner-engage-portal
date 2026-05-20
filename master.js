// ====================================================================
// master.js v10 — Master Dashboard Renderer
// NEW: FTD cards, Net Combined Premium, Active Months, Zone from col F
// ====================================================================

var masterCharts = {};

function fmt(n)    { return Number(n||0).toLocaleString('en-IN'); }
function fmtL(n)   { var v=Number(n||0); if(v>=10000000)return (v/10000000).toFixed(2)+'Cr'; if(v>=100000)return (v/100000).toFixed(2)+'L'; return v.toLocaleString('en-IN'); }
function pct(n)    { return (Number(n||0)>0?'+':'')+Number(n||0)+'%'; }
function clr(v,pos){ return Number(v||0)>=0?'kpi-pos':'kpi-neg'; }

// ── CONFIG ─────────────────────────────────────────────────────────
var API_URL = (typeof CONFIG !== 'undefined' && CONFIG.API_URL) ? CONFIG.API_URL : '';

// ========================= BOOTSTRAP ================================

function initMasterDashboard() {
  var gid = sessionStorage.getItem('gid');
  if (!gid) { window.location.href = 'index.html'; return; }

  document.getElementById('logoutBtn') && document.getElementById('logoutBtn').addEventListener('click', function() {
    sessionStorage.clear(); window.location.href = 'index.html';
  });

  showMasterLoader(true);
  fetch(API_URL + '?action=getMaster&gid=' + encodeURIComponent(gid))
    .then(function(r){ return r.json(); })
    .then(function(data) {
      showMasterLoader(false);
      if (!data.success) { alert('Error: ' + data.message); return; }
      renderMasterDashboard(data);
    })
    .catch(function(err) { showMasterLoader(false); alert('Network error: '+err); });
}

function showMasterLoader(show) {
  var el = document.getElementById('masterLoader');
  if (el) el.style.display = show ? 'flex' : 'none';
}

// ========================= MAIN RENDERER ============================

function renderMasterDashboard(data) {
  window._masterData = data;   // cache for zone modal drill-downs
  var o  = data.overallProject || {};
  var s  = data.overallSummary || {};

  // Header
  var hdr = document.getElementById('masterHeader');
  if (hdr) hdr.innerHTML = '<strong>Partner Engage Portal</strong> &mdash; National Command Centre &nbsp;|&nbsp; ' + fmt(data.totalPartners) + ' partners';

  // KPI Strip (top)
  renderKPIStrip(s, o);

  // Tabs
  setupTabs();

  // Tab content
  renderPanIndiaTab(data);
  renderZoneTab(data);
  renderRoleTab(data);
  renderStateTab(data);
  renderConnectTab(data);
  renderLoginTab(data);
}

// ========================= KPI STRIP ================================

function renderKPIStrip(s, o) {
  var el = document.getElementById('masterKpiStrip');
  if (!el) return;
  var mom  = Number(s.momPct || 0);
  var ach  = Number(s.achievementPct || 0);
  el.innerHTML =
    kpiCard('FTD Premium',         fmtL(o.ftd),                  '',               '') +
    kpiCard('MTD Premium',         fmtL(o.businessGenerated),     '',               '') +
    kpiCard('LMTD Premium',        fmtL(o.lmtd),                 '',               '') +
    kpiCard('Net Combined Premium',fmtL(o.netCombinedPremium),   '(Apr\'25→Apr\'26)','kpi-accent') +
    kpiCard('Target (May)',        fmtL(o.target),               '',               '') +
    kpiCard('Achievement',         ach + '%',                    mom > 0 ? 'MoM '+pct(mom) : 'MoM '+pct(mom), mom >= 0 ? 'kpi-pos' : 'kpi-neg') +
    kpiCard('Total Partners',      fmt(o.totalPartners),         '',               '') +
    kpiCard('Active',              fmt(o.activePartners),        s.activePct+'%',  'kpi-pos') +
    kpiCard('Growth',              fmt(o.growthCount),           s.growthPct+'%',  'kpi-pos') +
    kpiCard('Connected',           fmt(o.connectedPartners),     s.engagementPct+'%','kpi-pos') +
    kpiCard('Calls',               fmt(o.calls),                '',               '') +
    kpiCard('Visits',              fmt(o.visits),               '',               '');
}

function kpiCard(label, value, sub, cls) {
  return '<div class="kpi-card"><div class="kpi-label">'+label+'</div><div class="kpi-value '+(cls||'')+'">'+value+'</div>'+(sub?'<div class="kpi-sub">'+sub+'</div>':'')+'</div>';
}

// ========================= TABS =====================================

function setupTabs() {
  document.querySelectorAll('.master-tab-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.master-tab-btn').forEach(function(b){ b.classList.remove('active'); });
      document.querySelectorAll('.master-tab-content').forEach(function(c){ c.style.display='none'; });
      btn.classList.add('active');
      var target = document.getElementById(btn.dataset.tab);
      if (target) target.style.display = 'block';
    });
  });
  // Activate first tab
  var first = document.querySelector('.master-tab-btn');
  if (first) first.click();
}

// ========================= PAN-INDIA TAB ============================

function renderPanIndiaTab(data) {
  var el = document.getElementById('tabPanIndia');
  if (!el) return;
  var o = data.overallProject || {};
  var s = data.overallSummary || {};
  var mom = Number(s.momPct || 0);

  el.innerHTML =
    // Row 1: Premium metrics
    '<div class="m-section-title">Premium Overview</div>' +
    '<div class="m-card-grid">' +
      mCard('🎯 FTD Premium',           fmtL(o.ftd),                '',            '') +
      mCard('📈 MTD Premium',            fmtL(o.businessGenerated), '',             '') +
      mCard('📊 LMTD Premium',           fmtL(o.lmtd),             '',             '') +
      mCard('💰 Net Combined Premium',   fmtL(o.netCombinedPremium),'Apr\'25→Apr\'26','accent') +
    '</div>' +
    '<div class="m-card-grid">' +
      mCard('🏆 Target (May)',           fmtL(o.target),            '',            '') +
      mCard('✅ Achievement',            (o.achievementPct||0)+'%', 'vs target',   o.achievementPct>=80?'pos':'neg') +
      mCard('📉 MoM Change',             pct(mom),                  'vs LMTD',     mom>=0?'pos':'neg') +
      mCard('📦 Overall Potential',      fmtL(o.overallPotential),  'absolute',    '') +
    '</div>' +
    // Row 2: Active months
    '<div class="m-section-title">Active Months Analysis</div>' +
    '<div class="m-card-grid">' +
      mCard('📆 Avg Active Months',      (o.avgActiveMonths||0),    'per partner',  '') +
      mCard('💼 Active Months Business', fmtL(o.activeMonthsBiz),   'cumulative',   '') +
      mCard('🟢 Active Partners',        fmt(o.activePartners),     s.activePct+'%','pos') +
      mCard('🔴 Inactive Partners',      fmt(o.inactivePartners),   '',             'neg') +
    '</div>' +
    // Row 3: Engagement
    '<div class="m-section-title">Partner Engagement</div>' +
    '<div class="m-card-grid">' +
      mCard('📞 Total Calls',            fmt(o.calls),              '',             '') +
      mCard('🏠 Total Visits',           fmt(o.visits),            '',             '') +
      mCard('🤝 Connected',              fmt(o.connectedPartners),  s.engagementPct+'%','pos') +
      mCard('❌ Not Connected',          fmt(o.nonConnectedPartners),'',            'neg') +
    '</div>' +
    '<div class="m-card-grid">' +
      mCard('📈 Growth Partners',        fmt(o.growthCount),        s.growthPct+'%','pos') +
      mCard('📉 Degrowth Partners',      fmt(o.degrowthCount),      '',             'neg') +
      mCard('🎯 Max Pot Achievement',    (o.maxPotAchPct||0)+'%',   'vs max pot',   '') +
      mCard('👥 Total Partners',         fmt(o.totalPartners),      '',             '') +
    '</div>' +
    // Charts
    '<div class="m-section-title">Zone Comparison Charts</div>' +
    '<div class="m-charts-grid">' +
      '<div class="m-chart-box"><canvas id="chartZoneMTD"></canvas></div>' +
      '<div class="m-chart-box"><canvas id="chartZoneFTD"></canvas></div>' +
      '<div class="m-chart-box"><canvas id="chartZoneActive"></canvas></div>' +
      '<div class="m-chart-box"><canvas id="chartZoneNetCombined"></canvas></div>' +
    '</div>';

  setTimeout(function() { renderZoneCharts(data.zoneSummaries || []); }, 100);
}

function mCard(label, value, sub, type) {
  var cls = type === 'pos' ? 'kpi-pos' : type === 'neg' ? 'kpi-neg' : type === 'accent' ? 'kpi-accent' : '';
  return '<div class="m-card"><div class="m-card-label">'+label+'</div><div class="m-card-value '+cls+'">'+value+'</div>'+(sub?'<div class="m-card-sub">'+sub+'</div>':'')+'</div>';
}

// ========================= CHARTS ===================================

function renderZoneCharts(zones) {
  if (!zones || !zones.length) return;
  var labels = zones.map(function(z){ return z.zone; });
  var mtdVals = zones.map(function(z){ return (z.summary||{}).currentMonthPremium||0; });
  var ftdVals = zones.map(function(z){ return (z.overallProject||{}).ftd||0; });
  var actVals = zones.map(function(z){ return (z.summary||{}).activeCount||0; });
  var netVals = zones.map(function(z){ return (z.overallProject||{}).netCombinedPremium||0; });

  buildBarChart('chartZoneMTD',    labels, mtdVals, 'MTD Premium by Zone',    ['#4F8EF7','#3F7AE8','#5F9BFF','#4F8EF7','#6FAEFF','#2F68D8']);
  buildBarChart('chartZoneFTD',    labels, ftdVals, 'FTD Premium by Zone',    ['#22c55e','#16a34a','#4ade80','#22c55e','#86efac','#15803d']);
  buildBarChart('chartZoneActive', labels, actVals, 'Active Partners by Zone',['#f59e0b','#d97706','#fbbf24','#f59e0b','#fcd34d','#b45309']);
  buildBarChart('chartZoneNetCombined', labels, netVals, 'Net Combined Premium by Zone', ['#8b5cf6','#7c3aed','#a78bfa','#8b5cf6','#c4b5fd','#6d28d9']);
}

function buildBarChart(id, labels, data, title, colors) {
  var ctx = document.getElementById(id);
  if (!ctx) return;
  if (masterCharts[id]) { masterCharts[id].destroy(); }
  masterCharts[id] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{ label: title, data: data, backgroundColor: colors || '#4F8EF7', borderRadius: 6 }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false }, title: { display: true, text: title, font: { size: 13, weight: 'bold' } } },
      scales: { y: { ticks: { callback: function(v){ return fmtL(v); } } } }
    }
  });
}

// ========================= ZONE TAB =================================

function renderZoneTab(data) {
  var el = document.getElementById('tabZone');
  if (!el) return;
  var zones = data.zoneSummaries || [];
  var html  = '<div class="m-section-title">Zone Performance — All Zones</div><div class="zone-grid">';

  zones.forEach(function(z) {
    var s  = z.summary || {};
    var o  = z.overallProject || {};
    var mom = Number(s.momPct || 0);
    html +=
      '<div class="zone-card" data-zone="'+z.zone+'">' +
        '<div class="zone-card-header">'+z.zone+' <span class="zone-badge">'+fmt(z.partnerCount)+' partners</span></div>' +
        '<div class="zone-kpi-grid">' +
          zKpi('FTD',               fmtL(o.ftd)) +
          zKpi('MTD',               fmtL(o.businessGenerated)) +
          zKpi('LMTD',              fmtL(o.lmtd)) +
          zKpi('Net Combined',      fmtL(o.netCombinedPremium)) +
          zKpi('Target',            fmtL(o.target)) +
          zKpi('Achievement',       (o.achievementPct||0)+'%') +
          zKpi('MoM',               pct(mom), mom>=0?'pos':'neg') +
          zKpi('Active',            fmt(o.activePartners)+' / '+fmt(z.partnerCount)) +
          zKpi('Growth',            fmt(o.growthCount)) +
          zKpi('Connected',         fmt(o.connectedPartners)) +
          zKpi('Calls',             fmt(o.calls)) +
          zKpi('Visits',            fmt(o.visits)) +
          zKpi('Avg Active Months', o.avgActiveMonths) +
          zKpi('Active Biz',        fmtL(o.activeMonthsBiz)) +
          zKpi('Potential',         fmtL(o.overallPotential)) +
        '</div>' +
        '<button class="zone-expand-btn" onclick="openZoneModal(\''+z.zone+'\')">👥 View Team Breakdown</button>' +
      '</div>';
  });
  html += '</div>';
  el.innerHTML = html;
}

function zKpi(label, value, type) {
  var cls = type === 'pos' ? 'kpi-pos' : type === 'neg' ? 'kpi-neg' : '';
  return '<div class="zone-kpi"><span class="zk-label">'+label+'</span><span class="zk-val '+cls+'">'+value+'</span></div>';
}

// Zone modal (team breakdown)
var _zoneModalData = {};
function openZoneModal(zone) {
  // Reload master data with zone filter — use cached _masterData
  if (!window._masterData) return;
  var zoneEntry = (window._masterData.zoneSummaries||[]).find(function(z){ return z.zone === zone; });
  if (!zoneEntry) return;

  var modal = document.getElementById('zoneModal');
  if (!modal) return;
  document.getElementById('zoneModalTitle').textContent = zone + ' — Team Breakdown';

  // Use role performance filtered to this zone
  var html = '';
  ['zhPerf','rhPerf','shPerf','rmPerf','amPerf'].forEach(function(key) {
    var role = key.replace('Perf','').toUpperCase();
    var perf = (window._masterData[key]||[]).filter(function(p){ return p.zone === zone; });
    if (!perf.length) return;
    html += '<div class="breakdown-role-title">'+role+' Performance ('+zone+')</div>';
    html += '<table class="breakdown-table"><thead><tr><th>Name</th><th>Partners</th><th>FTD</th><th>MTD</th><th>LMTD</th><th>Net Combined</th><th>Target</th><th>Ach%</th><th>MoM%</th><th>Active</th><th>Calls</th><th>Visits</th></tr></thead><tbody>';
    perf.forEach(function(p) {
      var s = p.summary || {}; var o = p.overallProject || {};
      html += '<tr><td>'+p.name+'</td><td>'+p.partnerCount+'</td><td>'+fmtL(o.ftd)+'</td><td>'+fmtL(o.businessGenerated)+'</td><td>'+fmtL(o.lmtd)+'</td><td>'+fmtL(o.netCombinedPremium)+'</td><td>'+fmtL(o.target)+'</td><td class="'+(o.achievementPct>=80?'kpi-pos':'kpi-neg')+'">'+o.achievementPct+'%</td><td class="'+(s.momPct>=0?'kpi-pos':'kpi-neg')+'">'+pct(s.momPct)+'</td><td>'+o.activePartners+'</td><td>'+o.calls+'</td><td>'+o.visits+'</td></tr>';
    });
    html += '</tbody></table>';
  });

  document.getElementById('zoneModalBody').innerHTML = html || '<p>No team data for this zone.</p>';
  modal.style.display = 'flex';
}

// ========================= ROLE TAB =================================

function renderRoleTab(data) {
  var el = document.getElementById('tabRole');
  if (!el) return;

  var roleMap = { ZH: data.zhPerf||[], RH: data.rhPerf||[], SH: data.shPerf||[], RM: data.rmPerf||[], AM: data.amPerf||[] };
  var html = '<div class="role-tab-controls">';
  Object.keys(roleMap).forEach(function(role) {
    html += '<button class="role-select-btn" data-role="'+role+'">'+role+' ('+roleMap[role].length+')</button>';
  });
  html += '</div><div id="roleTableContainer"></div>';
  el.innerHTML = html;

  el.querySelectorAll('.role-select-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      el.querySelectorAll('.role-select-btn').forEach(function(b){ b.classList.remove('active'); });
      btn.classList.add('active');
      renderRoleTable(roleMap[btn.dataset.role], btn.dataset.role);
    });
  });

  // Auto-click ZH
  var firstBtn = el.querySelector('.role-select-btn');
  if (firstBtn) firstBtn.click();
}

function renderRoleTable(perf, role) {
  var cont = document.getElementById('roleTableContainer');
  if (!cont) return;
  if (!perf || !perf.length) { cont.innerHTML = '<p class="no-data">No '+role+' data found.</p>'; return; }
  var html = '<table class="role-perf-table"><thead><tr><th>#</th><th>Name</th><th>Zone</th><th>Partners</th><th>FTD</th><th>MTD</th><th>LMTD</th><th>Net Combined</th><th>Target</th><th>Ach%</th><th>MoM%</th><th>Active</th><th>Calls</th><th>Visits</th><th>Avg Active Months</th></tr></thead><tbody>';
  perf.forEach(function(p, i) {
    var s = p.summary||{}; var o = p.overallProject||{};
    var mom = Number(s.momPct||0);
    html += '<tr>' +
      '<td>'+(i+1)+'</td>' +
      '<td><strong>'+p.name+'</strong></td>' +
      '<td>'+p.zone+'</td>' +
      '<td>'+p.partnerCount+'</td>' +
      '<td>'+fmtL(o.ftd)+'</td>' +
      '<td>'+fmtL(o.businessGenerated)+'</td>' +
      '<td>'+fmtL(o.lmtd)+'</td>' +
      '<td class="kpi-accent">'+fmtL(o.netCombinedPremium)+'</td>' +
      '<td>'+fmtL(o.target)+'</td>' +
      '<td class="'+(o.achievementPct>=80?'kpi-pos':'kpi-neg')+'">'+o.achievementPct+'%</td>' +
      '<td class="'+(mom>=0?'kpi-pos':'kpi-neg')+'">'+pct(mom)+'</td>' +
      '<td>'+o.activePartners+'</td>' +
      '<td>'+o.calls+'</td>' +
      '<td>'+o.visits+'</td>' +
      '<td>'+o.avgActiveMonths+'</td>' +
    '</tr>';
  });
  html += '</tbody></table>';
  cont.innerHTML = html;
}

// ========================= STATE TAB ================================

function renderStateTab(data) {
  var el = document.getElementById('tabState');
  if (!el) return;
  var states = data.stateSummaries || [];
  var html   = '<div class="m-section-title">State-wise Performance</div><table class="state-table"><thead><tr><th>#</th><th>State</th><th>Partners</th><th>FTD</th><th>MTD</th><th>LMTD</th><th>MoM%</th><th>Active</th><th>Net Combined</th></tr></thead><tbody>';
  states.forEach(function(st, i) {
    var s   = st.summary || {};
    var mom = Number(s.momPct || 0);
    html += '<tr><td>'+(i+1)+'</td><td>'+st.state+'</td><td>'+st.partnerCount+'</td><td>'+fmtL(s.ftdTotal)+'</td><td>'+fmtL(s.currentMonthPremium)+'</td><td>'+fmtL(s.prevMonthPremium)+'</td><td class="'+(mom>=0?'kpi-pos':'kpi-neg')+'">'+pct(mom)+'</td><td>'+s.activeCount+'</td><td class="kpi-accent">'+fmtL(s.totalNetCombinedPremium)+'</td></tr>';
  });
  html += '</tbody></table>';
  el.innerHTML = html;
}

// ========================= CONNECT (CALL/VISIT) TAB =================

function renderConnectTab(data) {
  var el = document.getElementById('tabConnect');
  if (!el) return;
  el.innerHTML = '<div class="m-section-title">Call &amp; Visit Tracker</div><div id="connectStatsContainer"><div class="loader-text">Loading call/visit data...</div></div>';

  var gid = sessionStorage.getItem('gid');
  fetch(API_URL + '?action=getCallVisitStats&gid=' + encodeURIComponent(gid))
    .then(function(r){ return r.json(); })
    .then(function(d) {
      if (!d.success) { document.getElementById('connectStatsContainer').innerHTML = '<p class="error-text">'+d.message+'</p>'; return; }
      renderConnectStats(d);
    })
    .catch(function(err) { document.getElementById('connectStatsContainer').innerHTML = '<p class="error-text">Error: '+err+'</p>'; });
}

function renderConnectStats(d) {
  var cont = document.getElementById('connectStatsContainer');
  if (!cont) return;
  var o    = d.overall || {};
  var callPct  = o.total > 0 ? Math.round(o.called  / o.total * 100) : 0;
  var visitPct = o.total > 0 ? Math.round(o.visited / o.total * 100) : 0;

  var html =
    '<div class="m-card-grid">' +
      mCard('👥 Total Partners',   fmt(o.total),       '',                 '') +
      mCard('📞 Called',           fmt(o.called),      callPct+'%',        'pos') +
      mCard('🚫 Not Called',       fmt(o.notCalled),   '',                 'neg') +
      mCard('🏠 Visited',          fmt(o.visited),     visitPct+'%',       'pos') +
      mCard('❌ Not Visited',      fmt(o.notVisited),  '',                 'neg') +
      mCard('📲 Total Calls Made', fmt(o.callsSum),    '',                 '') +
      mCard('🚶 Total Visits Made',fmt(o.visitsSum),   '',                 '') +
    '</div>' +
    '<div class="m-section-title">Zone-wise Activity</div>' +
    '<table class="cv-table"><thead><tr><th>Zone</th><th>Total</th><th>Called</th><th>Call%</th><th>Not Called</th><th>Visited</th><th>Visit%</th><th>Not Visited</th><th>Calls Sum</th><th>Visits Sum</th></tr></thead><tbody>';

  (d.byZone||[]).forEach(function(z) {
    var cp = z.total>0?Math.round(z.called/z.total*100):0;
    var vp = z.total>0?Math.round(z.visited/z.total*100):0;
    html += '<tr><td><strong>'+z.zone+'</strong></td><td>'+z.total+'</td><td class="kpi-pos">'+z.called+'</td><td>'+cp+'%</td><td class="kpi-neg">'+z.notCalled+'</td><td class="kpi-pos">'+z.visited+'</td><td>'+vp+'%</td><td class="kpi-neg">'+z.notVisited+'</td><td>'+z.callsSum+'</td><td>'+z.visitsSum+'</td></tr>';
  });
  html += '</tbody></table>';

  html += '<div class="m-section-title">Owner-wise Activity</div>' +
    '<table class="cv-table"><thead><tr><th>Role</th><th>Name</th><th>Zone</th><th>Total</th><th>Called</th><th>Visited</th><th>Calls Sum</th><th>Visits Sum</th></tr></thead><tbody>';
  (d.byOwner||[]).forEach(function(own) {
    html += '<tr><td>'+own.role+'</td><td>'+own.name+'</td><td>'+own.zone+'</td><td>'+own.total+'</td><td class="kpi-pos">'+own.called+'</td><td class="kpi-pos">'+own.visited+'</td><td>'+own.callsSum+'</td><td>'+own.visitsSum+'</td></tr>';
  });
  html += '</tbody></table>';
  cont.innerHTML = html;
}

// ========================= LOGIN TAB ================================

function renderLoginTab(data) {
  var el = document.getElementById('tabLogin');
  if (!el) return;
  var gid = sessionStorage.getItem('gid');
  el.innerHTML = '<div class="m-section-title">Login Activity</div><div id="loginStatsContent"><div class="loader-text">Loading...</div></div>';

  fetch(API_URL + '?action=getLoginStats&gid=' + encodeURIComponent(gid))
    .then(function(r){ return r.json(); })
    .then(function(d) {
      if (!d.success) { document.getElementById('loginStatsContent').innerHTML = '<p>Error: '+d.message+'</p>'; return; }
      var html = '<p class="login-total">Total logins: <strong>'+d.totalLogins+'</strong></p><table class="login-table"><thead><tr><th>GID</th><th>Name</th><th>Role</th><th>Zone</th><th>Logins</th><th>Last Login</th></tr></thead><tbody>';
      (d.stats||[]).sort(function(a,b){return b.count-a.count;}).forEach(function(s) {
        html += '<tr><td>'+s.gid+'</td><td>'+s.name+'</td><td>'+s.role+'</td><td>'+s.zone+'</td><td>'+s.count+'</td><td>'+new Date(s.lastLogin).toLocaleString('en-IN')+'</td></tr>';
      });
      html += '</tbody></table>';
      document.getElementById('loginStatsContent').innerHTML = html;
    });
}

// ========================= ZONE MODAL CLOSE =========================

document.addEventListener('DOMContentLoaded', function() {
  var closeBtn = document.getElementById('zoneModalClose');
  if (closeBtn) closeBtn.addEventListener('click', function() {
    document.getElementById('zoneModal').style.display = 'none';
  });
  var modal = document.getElementById('zoneModal');
  if (modal) modal.addEventListener('click', function(e) {
    if (e.target === modal) modal.style.display = 'none';
  });

  // Bootstrap
  initMasterDashboard();
});


