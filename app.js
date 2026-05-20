// ====================================================================
// app.js v10 — Individual Dashboard Logic
// NEW: FTD, Net Combined Premium, Active Months, Zone col F
// ====================================================================

var API_URL = (typeof CONFIG !== 'undefined' && CONFIG.API_URL) ? CONFIG.API_URL : '';
var _dashData  = null;
var _allRows   = [];

// ========================= UTILS ====================================
function fmt(n)  { return Number(n||0).toLocaleString('en-IN'); }
function fmtL(n) { var v=Number(n||0); if(v>=10000000)return (v/10000000).toFixed(2)+'Cr'; if(v>=100000)return (v/100000).toFixed(2)+'L'; return v.toLocaleString('en-IN'); }
function pctStr(n){ return (Number(n||0)>=0?'+':'')+Number(n||0)+'%'; }

async function sha256(msg) {
  var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(buf)).map(function(b){ return b.toString(16).padStart(2,'0'); }).join('');
}

// ========================= LOGIN ====================================

document.addEventListener('DOMContentLoaded', function() {
  var loginPage = document.getElementById('loginPage');
  if (loginPage) initLoginPage();

  var dashPage = document.getElementById('dashboardPage');
  if (dashPage) initDashboardPage();
});

function initLoginPage() {
  var gid = sessionStorage.getItem('gid');
  if (gid) { redirectAfterLogin(sessionStorage.getItem('role')); return; }

  var gidInput = document.getElementById('gidInput');
  var pwInput  = document.getElementById('passwordInput');
  var btn      = document.getElementById('loginBtn');
  var errEl    = document.getElementById('loginError');

  if (gidInput) gidInput.addEventListener('keydown', function(e){ if(e.key==='Enter') checkGidAndProceed(); });
  if (btn) btn.addEventListener('click', handleLoginAttempt);
  if (pwInput) pwInput.addEventListener('keydown', function(e){ if(e.key==='Enter') handleLoginAttempt(); });
}

function checkGidAndProceed() {
  var gid = document.getElementById('gidInput').value.trim();
  if (!gid) return;
  fetch(API_URL + '?action=checkPassword&gid=' + encodeURIComponent(gid))
    .then(function(r){ return r.json(); })
    .then(function(d) {
      if (!d.success) { showLoginError(d.message); return; }
      if (!d.hasPassword) { showSetPasswordUI(gid); }
      else { document.getElementById('passwordSection').style.display = 'block'; }
    });
}

async function handleLoginAttempt() {
  var gid  = (document.getElementById('gidInput')  || {}).value || '';
  var pass = (document.getElementById('passwordInput') || {}).value || '';
  if (!gid || !pass) { showLoginError('Enter both User ID and password.'); return; }
  var hash = await sha256(pass);
  setLoginLoading(true);
  fetch(API_URL + '?action=login&gid=' + encodeURIComponent(gid) + '&password=' + encodeURIComponent(hash))
    .then(function(r){ return r.json(); })
    .then(function(d) {
      setLoginLoading(false);
      if (!d.success) { showLoginError(d.message); return; }
      sessionStorage.setItem('gid',  d.user.gid);
      sessionStorage.setItem('name', d.user.name);
      sessionStorage.setItem('role', d.user.role);
      sessionStorage.setItem('zone', d.user.zone);
      redirectAfterLogin(d.user.role);
    })
    .catch(function(){ setLoginLoading(false); showLoginError('Network error. Try again.'); });
}

function redirectAfterLogin(role) {
  if (role === 'MASTER') { window.location.href = 'master.html'; }
  else                   { window.location.href = 'dashboard.html'; }
}

function showLoginError(msg) {
  var el = document.getElementById('loginError');
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}

function setLoginLoading(on) {
  var btn = document.getElementById('loginBtn');
  if (btn) btn.disabled = on;
  var sp  = document.getElementById('loginSpinner');
  if (sp)  sp.style.display = on ? 'inline-block' : 'none';
}

async function showSetPasswordUI(gid) {
  var section = document.getElementById('setPasswordSection');
  if (!section) return;
  section.style.display = 'block';
  var saveBtn = document.getElementById('savePasswordBtn');
  if (saveBtn) saveBtn.addEventListener('click', async function() {
    var np = document.getElementById('newPassword').value;
    var cp = document.getElementById('confirmPassword').value;
    if (!np || np !== cp) { showLoginError('Passwords do not match.'); return; }
    var hash = await sha256(np);
    fetch(API_URL + '?action=setPassword&gid=' + encodeURIComponent(gid) + '&oldPassword=&newPassword=' + encodeURIComponent(hash))
      .then(function(r){ return r.json(); })
      .then(function(d) {
        if (!d.success) { showLoginError(d.message); return; }
        sessionStorage.setItem('gid', gid);
        document.getElementById('passwordInput').value = np;
        handleLoginAttempt();
      });
  });
}

// ========================= DASHBOARD ================================

function initDashboardPage() {
  var gid = sessionStorage.getItem('gid');
  if (!gid) { window.location.href = 'index.html'; return; }

  var nameEl = document.getElementById('userName');
  if (nameEl) nameEl.textContent = sessionStorage.getItem('name') || '';
  var roleEl = document.getElementById('userRole');
  if (roleEl) roleEl.textContent = sessionStorage.getItem('role') || '';

  var logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', function() {
    sessionStorage.clear(); window.location.href = 'index.html';
  });
  var masterBtn = document.getElementById('masterBtn');
  if (masterBtn) {
    if (sessionStorage.getItem('role') === 'MASTER') masterBtn.style.display = 'inline-block';
    masterBtn.addEventListener('click', function(){ window.location.href = 'master.html'; });
  }

  loadDashboard(gid);
}

function loadDashboard(gid) {
  showLoader(true);
  fetch(API_URL + '?action=getDashboard&gid=' + encodeURIComponent(gid))
    .then(function(r){ return r.json(); })
    .then(function(data) {
      showLoader(false);
      if (!data.success) { alert('Error: ' + data.message); return; }
      _dashData = data;
      _allRows  = data.partners || [];
      renderDashboard(data);
    })
    .catch(function(err){ showLoader(false); alert('Network error: '+err); });
}

function showLoader(show) {
  var el = document.getElementById('dashLoader');
  if (el) el.style.display = show ? 'flex' : 'none';
}

// ========================= RENDER DASHBOARD =========================

function renderDashboard(data) {
  var o   = data.overallProject || {};
  var s   = data.summary        || {};
  var user = data.user          || {};

  // KPI Strip
  renderKpiStrip(s, o, user);

  // My Activity card (for non-master)
  renderMyActivity(data);

  // All Partners table
  buildTable(_allRows, 'partnersTable', data.filterOptions);

  // My Partners
  if (data.myPartners && data.myPartners.length) {
    buildTable(data.myPartners, 'myPartnersTable', null);
  }

  // Team Breakdown
  if (data.teamBreakdown) renderTeamBreakdown(data.teamBreakdown, user);

  // AM Performance
  if (data.amPerformance) renderAmPerformance(data.amPerformance);

  // Filters
  setupFilters(data.filterOptions);
}

function renderKpiStrip(s, o, user) {
  var el = document.getElementById('kpiStrip');
  if (!el) return;
  var mom = Number(s.momPct || 0);
  el.innerHTML =
    kpi('FTD',                  fmtL(o.ftd),                 '',                     '') +
    kpi('MTD',                  fmtL(o.businessGenerated),   '',                     '') +
    kpi('LMTD',                 fmtL(o.lmtd),               '',                     '') +
    kpi('Net Combined Premium', fmtL(o.netCombinedPremium),  '(Apr\'25→Apr\'26)',    'kpi-accent') +
    kpi('Target (May)',         fmtL(o.target),               '',                     '') +
    kpi('Achievement',          (o.achievementPct||0)+'%',   'vs target',            o.achievementPct>=80?'kpi-pos':'kpi-neg') +
    kpi('MoM',                  pctStr(mom),                 'vs LMTD',             mom>=0?'kpi-pos':'kpi-neg') +
    kpi('Partners',             fmt(o.totalPartners),         '',                    '') +
    kpi('Active',               fmt(o.activePartners),       s.activePct+'%',        'kpi-pos') +
    kpi('Growth',               fmt(o.growthCount),           s.growthPct+'%',        'kpi-pos') +
    kpi('Connected',            fmt(o.connectedPartners),    s.engagementPct+'%',    'kpi-pos') +
    kpi('Avg Active Months',    o.avgActiveMonths || 0,       'per partner',          '');
}

function kpi(label, value, sub, cls) {
  return '<div class="kpi-card"><div class="kpi-label">'+label+'</div><div class="kpi-value '+(cls||'')+'">'+value+'</div>'+(sub?'<div class="kpi-sub">'+sub+'</div>':'')+'</div>';
}

// ========================= MY ACTIVITY ==============================

function renderMyActivity(data) {
  var el = document.getElementById('myActivityCard');
  if (!el) return;
  var role = (data.user || {}).role;
  if (role === 'MASTER') { el.style.display = 'none'; return; }

  var gid = sessionStorage.getItem('gid');
  el.innerHTML = '<div class="activity-header">My Activity</div><div id="activityInner"><div class="loader-text">Loading...</div></div>';
  el.style.display = 'block';

  fetch(API_URL + '?action=getCallVisitStats&gid=' + encodeURIComponent(gid))
    .then(function(r){ return r.json(); })
    .then(function(d) {
      if (!d.success) { document.getElementById('activityInner').innerHTML = 'Could not load activity.'; return; }
      var o = d.overall || {};
      var callPct  = o.total>0?Math.round(o.called/o.total*100):0;
      var visitPct = o.total>0?Math.round(o.visited/o.total*100):0;
      document.getElementById('activityInner').innerHTML =
        '<div class="act-grid">' +
          actItem('My Partners', fmt(o.total)) +
          actItem('Called', fmt(o.called) + ' ('+callPct+'%)') +
          actItem('Not Called', fmt(o.notCalled)) +
          actItem('Visited', fmt(o.visited) + ' ('+visitPct+'%)') +
          actItem('Not Visited', fmt(o.notVisited)) +
          actItem('Total Calls', fmt(o.callsSum)) +
          actItem('Total Visits', fmt(o.visitsSum)) +
        '</div>';
    })
    .catch(function(){ document.getElementById('activityInner').innerHTML = 'Activity unavailable.'; });
}

function actItem(label, value) {
  return '<div class="act-item"><span class="act-label">'+label+'</span><span class="act-value">'+value+'</span></div>';
}

// ========================= PARTNER TABLE ============================

function buildTable(rows, tableId, filterOptions) {
  var tbody = document.querySelector('#'+tableId+' tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  rows.forEach(function(p, i) {
    var mom = p.currentMonth - p.prevMonth;
    var momPct = p.prevMonth > 0 ? Math.round(mom / p.prevMonth * 100) : (p.currentMonth > 0 ? 100 : 0);
    var ach    = p.target > 0 ? Math.round(p.currentMonth / p.target * 100) : 0;

    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td>'+(i+1)+'</td>' +
      '<td><a href="#" class="partner-link" data-gid="'+p.gid+'">'+p.name+'</a></td>' +
      '<td>'+p.zone+'</td>' +
      '<td>'+p.state+'</td>' +
      '<td>'+p.city+'</td>' +
      '<td>'+p.ownerRole+'</td>' +
      '<td>'+p.ownerName+'</td>' +
      '<td class="'+(p.isActive?'kpi-pos':'kpi-neg')+'">'+(p.isActive?'Active':'Inactive')+'</td>' +
      '<td>'+(p.uniqueStatus||'')+'</td>' +
      '<td class="num">'+fmtL(p.ftd)+'</td>' +
      '<td class="num">'+fmtL(p.currentMonth)+'</td>' +
      '<td class="num">'+fmtL(p.prevMonth)+'</td>' +
      '<td class="num '+(momPct>=0?'kpi-pos':'kpi-neg')+'">'+pctStr(momPct)+'</td>' +
      '<td class="num">'+fmtL(p.netCombinedPremium)+'</td>' +
      '<td class="num">'+fmtL(p.target)+'</td>' +
      '<td class="num '+(ach>=80?'kpi-pos':'kpi-neg')+'">'+ach+'%</td>' +
      '<td class="num">'+p.activeMonthsCount+'</td>' +
      '<td class="num">'+fmtL(p.activeMonthsBiz)+'</td>' +
      '<td class="num">'+p.calls+'</td>' +
      '<td class="num">'+p.visits+'</td>';
    tr.querySelector('.partner-link').addEventListener('click', function(e) {
      e.preventDefault(); openPartnerModal(p);
    });
    tbody.appendChild(tr);
  });
}

// ========================= PARTNER MODAL ============================

function openPartnerModal(p) {
  var modal = document.getElementById('partnerModal');
  if (!modal) return;

  var mom    = p.currentMonth - p.prevMonth;
  var momPct = p.prevMonth > 0 ? Math.round(mom / p.prevMonth * 100) : (p.currentMonth > 0 ? 100 : 0);
  var ach    = p.target > 0 ? Math.round(p.currentMonth / p.target * 100) : 0;
  var maxAch = p.maxPotential > 0 ? Math.round(p.currentMonth / p.maxPotential * 100) : 0;

  document.getElementById('modalPartnerName').textContent = p.name + ' (' + p.gid + ')';

  var kpiEl = document.getElementById('modalKpis');
  if (kpiEl) kpiEl.innerHTML =
    modalKpi('Zone',               p.zone,                                     '') +
    modalKpi('State / City',       p.state + ' / ' + p.city,                   '') +
    modalKpi('Owner',              p.ownerRole + ': ' + p.ownerName,           '') +
    modalKpi('Unique Status',      p.uniqueStatus || '—',                       '') +
    modalKpi('FTD',                fmtL(p.ftd),                                p.ftd > 0 ? 'pos':'') +
    modalKpi('MTD',                fmtL(p.currentMonth),                       p.currentMonth > 0 ? 'pos':'neg') +
    modalKpi('LMTD',               fmtL(p.prevMonth),                          '') +
    modalKpi('MoM Change',         pctStr(momPct),                             momPct >= 0 ? 'pos':'neg') +
    modalKpi('Net Combined Premium',fmtL(p.netCombinedPremium),                'accent') +
    modalKpi('Active Months',      p.activeMonthsCount + ' / 13',              p.activeMonthsCount >= 6 ? 'pos':'neg') +
    modalKpi('Active Months Biz',  fmtL(p.activeMonthsBiz),                    '') +
    modalKpi('Target (May)',        fmtL(p.target),                             '') +
    modalKpi('Achievement',         ach + '%',                                   ach >= 80 ? 'pos':'neg') +
    modalKpi('Max Potential',       fmtL(p.maxPotential),                       '') +
    modalKpi('Max Pot Ach%',        maxAch + '%',                                '') +
    modalKpi('Overall Potential',   fmtL(p.overallPotential),                   '') +
    modalKpi('Active',              p.isActive ? 'Active' : 'Inactive',         p.isActive ? 'pos':'neg') +
    modalKpi('Growth',              p.isGrowth ? 'Growth' : 'Degrowth',         p.isGrowth ? 'pos':'neg') +
    modalKpi('Calls',               p.calls,                                     p.calls > 0 ? 'pos':'') +
    modalKpi('Visits',              p.visits,                                    p.visits > 0 ? 'pos':'');

  // Monthly chart
  renderMonthlyChart(p.monthlyData);

  // Remark
  var remarkEl = document.getElementById('remarkText');
  if (remarkEl) remarkEl.value = p.remark || '';
  var saveBtn  = document.getElementById('saveRemarkBtn');
  if (saveBtn) {
    saveBtn.onclick = function() { saveRemark(p.gid, remarkEl.value); };
  }

  modal.style.display = 'flex';
}

function modalKpi(label, value, type) {
  var cls = type === 'pos' ? 'kpi-pos' : type === 'neg' ? 'kpi-neg' : type === 'accent' ? 'kpi-accent' : '';
  return '<div class="modal-kpi"><span class="mk-label">'+label+'</span><span class="mk-val '+cls+'">'+value+'</span></div>';
}

var _monthChart = null;
function renderMonthlyChart(monthlyData) {
  var ctx = document.getElementById('monthlyChart');
  if (!ctx) return;
  if (_monthChart) _monthChart.destroy();
  var labels = ['Apr\'25','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan\'26','Feb','Mar','Apr\'26'];
  _monthChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{ label: 'Monthly Premium', data: monthlyData || [], backgroundColor: '#4F8EF7', borderRadius: 4 }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { ticks: { callback: function(v){ return fmtL(v); } } } }
    }
  });
}

function saveRemark(partnerGid, remark) {
  var gid = sessionStorage.getItem('gid');
  fetch(API_URL + '?action=saveRemark&gid='+encodeURIComponent(gid)+'&partnerGid='+encodeURIComponent(partnerGid)+'&remark='+encodeURIComponent(remark))
    .then(function(r){ return r.json(); })
    .then(function(d){ alert(d.success ? 'Remark saved!' : 'Error: '+d.message); });
}

// Modal close
document.addEventListener('DOMContentLoaded', function() {
  var modal = document.getElementById('partnerModal');
  var closeBtn = document.getElementById('modalClose');
  if (closeBtn && modal) closeBtn.addEventListener('click', function(){ modal.style.display='none'; });
  if (modal) modal.addEventListener('click', function(e){ if(e.target===modal) modal.style.display='none'; });
});

// ========================= TEAM BREAKDOWN ===========================

function renderTeamBreakdown(breakdown, user) {
  var cont = document.getElementById('teamBreakdownContainer');
  if (!cont || !breakdown || !breakdown.length) return;
  var html = '<table class="team-table"><thead><tr><th>Role</th><th>Name</th><th>Partners</th><th>FTD</th><th>MTD</th><th>LMTD</th><th>Net Combined</th><th>Target</th><th>Ach%</th><th>MoM%</th><th>Active</th><th>Calls</th><th>Visits</th></tr></thead><tbody>';
  breakdown.forEach(function(m) {
    var s = m.summary||{}; var o = m.overallProject||{};
    html += '<tr><td>'+m.role+'</td><td><a href="#" class="member-link" data-role="'+m.role+'" data-name="'+m.name+'">'+m.name+'</a></td><td>'+m.partners.length+'</td><td>'+fmtL(o.ftd)+'</td><td>'+fmtL(o.businessGenerated)+'</td><td>'+fmtL(o.lmtd)+'</td><td class="kpi-accent">'+fmtL(o.netCombinedPremium)+'</td><td>'+fmtL(o.target)+'</td><td class="'+(o.achievementPct>=80?'kpi-pos':'kpi-neg')+'">'+o.achievementPct+'%</td><td class="'+(s.momPct>=0?'kpi-pos':'kpi-neg')+'">'+pctStr(s.momPct)+'</td><td>'+o.activePartners+'</td><td>'+o.calls+'</td><td>'+o.visits+'</td></tr>';
  });
  html += '</tbody></table>';
  cont.innerHTML = html;

  cont.querySelectorAll('.member-link').forEach(function(link) {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      var memberEntry = breakdown.find(function(m){ return m.role===link.dataset.role && m.name===link.dataset.name; });
      if (memberEntry) {
        buildTable(memberEntry.partners, 'memberPartnersTable', null);
        var mTitle = document.getElementById('memberPartnersTitle');
        var mTable = document.getElementById('memberPartnersTable');
        if (mTitle) { mTitle.textContent = link.dataset.name + '\'s Partners'; mTitle.style.display = 'block'; }
        if (mTable) mTable.style.display = 'table';
        mTable && mTable.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
}

// ========================= AM PERFORMANCE ===========================

function renderAmPerformance(amPerf) {
  var cont = document.getElementById('amPerfContainer');
  if (!cont || !amPerf || !amPerf.length) return;
  var html = '<table class="am-table"><thead><tr><th>#</th><th>AM Name</th><th>Zone</th><th>Partners</th><th>FTD</th><th>MTD</th><th>LMTD</th><th>Net Combined</th><th>Target</th><th>Ach%</th><th>Active</th><th>Calls</th><th>Visits</th><th>Avg Active Months</th></tr></thead><tbody>';
  amPerf.forEach(function(am, i) {
    var s = am.summary||{}; var o = am.overallProject||{};
    html += '<tr><td>'+(i+1)+'</td><td>'+am.name+'</td><td>'+am.zone+'</td><td>'+am.partners.length+'</td><td>'+fmtL(o.ftd)+'</td><td>'+fmtL(o.businessGenerated)+'</td><td>'+fmtL(o.lmtd)+'</td><td class="kpi-accent">'+fmtL(o.netCombinedPremium)+'</td><td>'+fmtL(o.target)+'</td><td class="'+(o.achievementPct>=80?'kpi-pos':'kpi-neg')+'">'+o.achievementPct+'%</td><td>'+o.activePartners+'</td><td>'+o.calls+'</td><td>'+o.visits+'</td><td>'+o.avgActiveMonths+'</td></tr>';
  });
  html += '</tbody></table>';
  cont.innerHTML = html;
}

// ========================= FILTERS ==================================

function setupFilters(filterOptions) {
  if (!filterOptions) return;

  var zoneFilter  = document.getElementById('filterZone');
  var stateFilter = document.getElementById('filterState');
  var ownerFilter = document.getElementById('filterOwner');
  var searchInput = document.getElementById('searchInput');

  if (zoneFilter && filterOptions.zones) {
    filterOptions.zones.forEach(function(z) {
      var opt = document.createElement('option'); opt.value = z; opt.textContent = z;
      zoneFilter.appendChild(opt);
    });
  }
  if (stateFilter && filterOptions.states) {
    filterOptions.states.forEach(function(s) {
      var opt = document.createElement('option'); opt.value = s; opt.textContent = s;
      stateFilter.appendChild(opt);
    });
  }
  if (ownerFilter && filterOptions.owners) {
    filterOptions.owners.forEach(function(o) {
      var opt = document.createElement('option'); opt.value = o; opt.textContent = o;
      ownerFilter.appendChild(opt);
    });
  }

  function applyFilters() {
    var zf = zoneFilter  ? zoneFilter.value.toLowerCase()  : '';
    var sf = stateFilter ? stateFilter.value.toLowerCase() : '';
    var of = ownerFilter ? ownerFilter.value.toLowerCase() : '';
    var kw = searchInput ? searchInput.value.toLowerCase() : '';
    var filtered = _allRows.filter(function(p) {
      if (zf && (p.zone||'').toLowerCase()      !== zf) return false;
      if (sf && (p.state||'').toLowerCase()     !== sf) return false;
      if (of && (p.ownerName||'').toLowerCase() !== of) return false;
      if (kw && (p.name||'').toLowerCase().indexOf(kw) === -1 && (p.gid||'').toLowerCase().indexOf(kw) === -1) return false;
      return true;
    });
    buildTable(filtered, 'partnersTable', null);
  }

  [zoneFilter, stateFilter, ownerFilter].forEach(function(el) {
    if (el) el.addEventListener('change', applyFilters);
  });
  if (searchInput) searchInput.addEventListener('input', applyFilters);

  var clearBtn = document.getElementById('clearFiltersBtn');
  if (clearBtn) clearBtn.addEventListener('click', function() {
    if (zoneFilter)  zoneFilter.value  = '';
    if (stateFilter) stateFilter.value = '';
    if (ownerFilter) ownerFilter.value = '';
    if (searchInput) searchInput.value = '';
    buildTable(_allRows, 'partnersTable', null);
  });
}
