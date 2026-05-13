// ====================================================================
// Master Dashboard — master.js v5
// Pan-India + Zone-wise + Role-wise + State-wise interactive view
// ====================================================================

(function () {
  'use strict';

  const userJson = sessionStorage.getItem('peUser');
  if (!userJson) { location.href = 'index.html'; return; }
  const user = JSON.parse(userJson);

  // Master gate
  if (user.role !== 'MASTER' && !['MASTER','IDK-MASTER','CENTRAL'].some(k => (user.gid || '').toUpperCase().indexOf(k) !== -1)) {
    alert('Master access only.');
    location.href = 'dashboard.html';
    return;
  }

  let state = {
    master: null,
    charts: {},
    logins: null
  };

  const $ = (id) => document.getElementById(id);
  const fmtINR = (n) => {
    if (!isFinite(n) || n === 0) return '₹0';
    if (n >= 1e7) return '₹' + (n / 1e7).toFixed(2) + ' Cr';
    if (n >= 1e5) return '₹' + (n / 1e5).toFixed(2) + ' L';
    if (n >= 1e3) return '₹' + (n / 1e3).toFixed(1) + 'K';
    return '₹' + Math.round(n).toLocaleString('en-IN');
  };
  const fmtInt = (n) => Number(n || 0).toLocaleString('en-IN');
  const safe = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);

  $('userName').textContent = user.name || user.gid;

  $('btnLogout').addEventListener('click', () => {
    sessionStorage.removeItem('peUser');
    location.href = 'index.html';
  });

  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const id = tab.dataset.tab;
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      $('pane-' + id).classList.add('active');
      if (id === 'india') renderCharts();
      if (id === 'zones') renderZones();
      if (id === 'roles') renderRoles();
      if (id === 'states') renderStates();
      if (id === 'logins') loadLogins();
    });
  });

  function setStatus(msg, kind) {
    const bar = $('statusBar');
    bar.className = 'status-bar ' + (kind || '');
    bar.textContent = msg;
    bar.classList.toggle('hidden', !msg);
  }

  // ---------- load master data ----------
  function loadMaster() {
    setStatus('Loading pan-India data from master sheet…', 'loading');
    fetch(API_URL + '?action=getMaster&gid=' + encodeURIComponent(user.gid))
      .then(r => r.json())
      .then(res => {
        if (!res.success) { setStatus(res.message || 'Failed to load.', 'error'); return; }
        state.master = res;
        renderIndia();
        renderCharts();
        renderZones();
        renderRoles();
        renderStates();
        setStatus('', '');
      })
      .catch(err => setStatus('Connection error: ' + err.message, 'error'));
  }

  // ---------- Pan-India tab ----------
  function renderIndia() {
    const op = state.master.overallProject;
    if (!op) return;
    $('m-totalPartners').textContent = fmtInt(op.totalPartners);
    $('m-active').textContent = fmtInt(op.activePartners);
    $('m-inactive').textContent = fmtInt(op.inactivePartners);
    $('m-business').textContent = fmtINR(op.businessGenerated);
    $('m-mom').textContent = (op.momPct >= 0 ? '+' : '') + op.momPct + '%';
    const momPill = $('m-momPill');
    momPill.classList.remove('pill-green', 'pill-red');
    momPill.classList.add(op.momPct >= 0 ? 'pill-green' : 'pill-red');
    $('m-ach').textContent = op.achievementPct + '%';
    $('m-connected').textContent = fmtInt(op.connectedPartners) + ' / ' + fmtInt(op.totalPartners);
    $('m-conn').textContent = fmtInt(op.connectedPartners);
    $('m-notconn').textContent = fmtInt(op.nonConnectedPartners);
    $('m-maxpot').textContent = fmtINR(op.maxPotential);
    $('m-overallpot').textContent = fmtINR(op.overallPotential);
    $('m-target').textContent = fmtINR(op.target);
    $('m-lmtd').textContent = fmtINR(state.master.overallSummary.prevMonthPremium);
    $('m-calls').textContent = fmtInt(op.calls);
    $('m-visits').textContent = fmtInt(op.visits);
    $('m-growth').textContent = fmtInt(op.growthCount);
    $('m-degrowth').textContent = fmtInt(op.degrowthCount);
  }

  function destroyChart(name) {
    if (state.charts[name]) { state.charts[name].destroy(); state.charts[name] = null; }
  }

  function renderCharts() {
    if (!state.master || !state.master.zoneSummaries) return;
    const zones = state.master.zoneSummaries.filter(z => z.partnerCount > 0).sort((a,b) => b.summary.currentMonthPremium - a.summary.currentMonthPremium);
    const labels = zones.map(z => z.zone);

    destroyChart('zoneMtd');
    state.charts.zoneMtd = new Chart($('chartZoneMtd'), {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'MTD',
          data: zones.map(z => z.summary.currentMonthPremium),
          backgroundColor: '#2563eb',
          borderRadius: 6
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: { y: { ticks: { callback: v => fmtINR(v) } } },
        plugins: { legend: { display: false } }
      }
    });

    destroyChart('zoneActive');
    state.charts.zoneActive = new Chart($('chartZoneActive'), {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          { label: 'Active', data: zones.map(z => z.summary.activeCount), backgroundColor: '#16a34a' },
          { label: 'Inactive', data: zones.map(z => z.summary.inactiveCount), backgroundColor: '#dc2626' }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: { x: { stacked: true }, y: { stacked: true } },
        plugins: { legend: { position: 'bottom' } }
      }
    });

    destroyChart('zoneMaxPot');
    state.charts.zoneMaxPot = new Chart($('chartZoneMaxPot'), {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Max Potential',
          data: zones.map(z => z.summary.totalMaxPotential),
          backgroundColor: '#9333ea',
          borderRadius: 6
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: { y: { ticks: { callback: v => fmtINR(v) } } },
        plugins: { legend: { display: false } }
      }
    });

    destroyChart('zoneMtdLmtd');
    state.charts.zoneMtdLmtd = new Chart($('chartZoneMtdLmtd'), {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          { label: 'MTD (May)', data: zones.map(z => z.summary.currentMonthPremium), backgroundColor: '#2563eb' },
          { label: 'LMTD (Apr)', data: zones.map(z => z.summary.prevMonthPremium), backgroundColor: '#94a3b8' }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: { y: { ticks: { callback: v => fmtINR(v) } } },
        plugins: { legend: { position: 'bottom' } }
      }
    });
  }

  // ---------- Zone tab ----------
  function renderZones() {
    if (!state.master) return;
    const zones = state.master.zoneSummaries.filter(z => z.partnerCount > 0)
      .sort((a,b) => b.summary.currentMonthPremium - a.summary.currentMonthPremium);

    $('zoneGrid').innerHTML = zones.map(z => {
      const s = z.summary;
      return `
        <div class="zone-card" data-zone="${safe(z.zone)}">
          <div class="zone-card-head">
            <div class="zone-name">${safe(z.zone)}</div>
            <div class="zone-count">${fmtInt(z.partnerCount)} partners</div>
          </div>
          <div class="zone-stats">
            <div class="ts"><div class="ts-l">MTD</div><div class="ts-v pos"><b>${fmtINR(s.currentMonthPremium)}</b></div></div>
            <div class="ts"><div class="ts-l">LMTD</div><div class="ts-v">${fmtINR(s.prevMonthPremium)}</div></div>
            <div class="ts"><div class="ts-l">MoM</div><div class="ts-v ${s.momPct >= 0 ? 'pos' : 'neg'}">${s.momPct >= 0 ? '+' : ''}${s.momPct}%</div></div>
            <div class="ts"><div class="ts-l">Target</div><div class="ts-v">${fmtINR(s.totalTarget)}</div></div>
            <div class="ts"><div class="ts-l">Ach.</div><div class="ts-v ${s.achievementPct >= 80 ? 'pos' : s.achievementPct >= 40 ? '' : 'neg'}">${s.achievementPct}%</div></div>
            <div class="ts"><div class="ts-l">Max Pot.</div><div class="ts-v">${fmtINR(s.totalMaxPotential)}</div></div>
            <div class="ts"><div class="ts-l">Overall Pot.</div><div class="ts-v">${fmtINR(s.totalOverallPotential)}</div></div>
            <div class="ts"><div class="ts-l">Active</div><div class="ts-v pos">${fmtInt(s.activeCount)}</div></div>
            <div class="ts"><div class="ts-l">Inactive</div><div class="ts-v neg">${fmtInt(s.inactiveCount)}</div></div>
            <div class="ts"><div class="ts-l">Connected</div><div class="ts-v pos">${fmtInt(s.connectedCount)}</div></div>
            <div class="ts"><div class="ts-l">Calls</div><div class="ts-v pos">${fmtInt(s.totalCalls)}</div></div>
            <div class="ts"><div class="ts-l">Visits</div><div class="ts-v pos">${fmtInt(s.totalVisits)}</div></div>
          </div>
          <button class="btn-primary zone-drill" data-zone="${safe(z.zone)}">View Team Breakdown</button>
        </div>`;
    }).join('');

    document.querySelectorAll('.zone-drill').forEach(b => {
      b.addEventListener('click', () => openZoneDrill(b.dataset.zone));
    });
  }

  function openZoneDrill(zoneName) {
    if (!state.master) return;
    // Build a zone-specific role rollup from all role data
    const allRoles = {
      ZH: state.master.zhPerf || [],
      RH: state.master.rhPerf || [],
      SH: state.master.shPerf || [],
      RM: state.master.rmPerf || [],
      AM: state.master.amPerf || []
    };
    const byRole = {};
    Object.keys(allRoles).forEach(role => {
      byRole[role] = allRoles[role].filter(p => p.zone === zoneName);
    });

    const zoneSummary = (state.master.zoneSummaries || []).find(z => z.zone === zoneName);
    const s = zoneSummary ? zoneSummary.summary : null;

    $('modalBody').innerHTML = `
      <h2>${safe(zoneName)} Zone <span class="role-chip">${fmtInt(zoneSummary ? zoneSummary.partnerCount : 0)} partners</span></h2>
      ${s ? `
      <div class="kpi-row">
        <div class="kpi-mini"><div><div class="kpi-mini-label">MTD</div><div class="kpi-mini-val pos">${fmtINR(s.currentMonthPremium)}</div></div></div>
        <div class="kpi-mini"><div><div class="kpi-mini-label">LMTD</div><div class="kpi-mini-val">${fmtINR(s.prevMonthPremium)}</div></div></div>
        <div class="kpi-mini"><div><div class="kpi-mini-label">MoM</div><div class="kpi-mini-val ${s.momPct >= 0 ? 'pos' : 'neg'}">${s.momPct >= 0 ? '+' : ''}${s.momPct}%</div></div></div>
        <div class="kpi-mini"><div><div class="kpi-mini-label">Target</div><div class="kpi-mini-val">${fmtINR(s.totalTarget)}</div></div></div>
        <div class="kpi-mini"><div><div class="kpi-mini-label">Ach.</div><div class="kpi-mini-val">${s.achievementPct}%</div></div></div>
        <div class="kpi-mini"><div><div class="kpi-mini-label">Max Pot.</div><div class="kpi-mini-val">${fmtINR(s.totalMaxPotential)}</div></div></div>
        <div class="kpi-mini"><div><div class="kpi-mini-label">Overall Pot.</div><div class="kpi-mini-val">${fmtINR(s.totalOverallPotential)}</div></div></div>
        <div class="kpi-mini"><div><div class="kpi-mini-label">Active</div><div class="kpi-mini-val pos">${fmtInt(s.activeCount)}</div></div></div>
        <div class="kpi-mini"><div><div class="kpi-mini-label">Connected</div><div class="kpi-mini-val pos">${fmtInt(s.connectedCount)}</div></div></div>
        <div class="kpi-mini"><div><div class="kpi-mini-label">Calls</div><div class="kpi-mini-val pos">${fmtInt(s.totalCalls)}</div></div></div>
        <div class="kpi-mini"><div><div class="kpi-mini-label">Visits</div><div class="kpi-mini-val pos">${fmtInt(s.totalVisits)}</div></div></div>
      </div>` : ''}

      ${['ZH','RH','SH','RM','AM'].map(role => {
        const list = byRole[role];
        if (!list || list.length === 0) return '';
        return `
          <h3>${role} Performance (${list.length})</h3>
          <div class="table-wrap">
            <table class="ptable">
              <thead><tr>
                <th>Name</th><th>Partners</th>
                <th>Max Pot.</th><th>Overall Pot.</th>
                <th>Target</th><th>MTD</th><th>LMTD</th><th>MoM%</th>
                <th>Ach.%</th><th>Active</th><th>Connected</th><th>Calls</th><th>Visits</th>
              </tr></thead>
              <tbody>
                ${list.map(p => {
                  const ps = p.summary;
                  return `<tr>
                    <td><b>${safe(p.name)}</b></td>
                    <td>${fmtInt(ps.totalPartners)}</td>
                    <td>${fmtINR(ps.totalMaxPotential)}</td>
                    <td>${fmtINR(ps.totalOverallPotential)}</td>
                    <td>${fmtINR(ps.totalTarget)}</td>
                    <td class="pos"><b>${fmtINR(ps.currentMonthPremium)}</b></td>
                    <td>${fmtINR(ps.prevMonthPremium)}</td>
                    <td class="${ps.momPct >= 0 ? 'pos' : 'neg'}">${ps.momPct >= 0 ? '+' : ''}${ps.momPct}%</td>
                    <td class="${ps.achievementPct >= 80 ? 'pos' : ps.achievementPct >= 40 ? '' : 'neg'}">${ps.achievementPct}%</td>
                    <td class="pos">${fmtInt(ps.activeCount)}</td>
                    <td class="pos">${fmtInt(ps.connectedCount)}</td>
                    <td class="pos">${fmtInt(ps.totalCalls)}</td>
                    <td class="pos">${fmtInt(ps.totalVisits)}</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>`;
      }).join('')}
    `;
    $('drillModal').classList.remove('hidden');
  }

  // ---------- Role tab ----------
  function renderRoles() {
    if (!state.master) return;
    const role = $('fRole').value;
    const search = ($('fRoleSearch').value || '').toLowerCase();
    const sort = $('fRoleSort').value || 'mtd';
    const all = state.master[role.toLowerCase() + 'Perf'] || [];
    let list = all.slice();
    if (search) list = list.filter(p => p.name.toLowerCase().indexOf(search) !== -1);
    list.sort((a,b) => {
      if (sort === 'mtd') return b.summary.currentMonthPremium - a.summary.currentMonthPremium;
      if (sort === 'ach') return b.summary.achievementPct - a.summary.achievementPct;
      if (sort === 'partners') return b.summary.totalPartners - a.summary.totalPartners;
      return a.name.localeCompare(b.name);
    });

    if (list.length === 0) {
      $('roleGrid').innerHTML = '<div class="empty">No data for ' + role + '.</div>';
      return;
    }

    $('roleGrid').innerHTML = list.map(p => {
      const s = p.summary;
      return `
        <div class="team-card">
          <div class="team-card-head">
            <div>
              <div class="team-name">${safe(p.name)}</div>
              <div class="team-role">${role} • ${safe(p.zone)} • ${fmtInt(p.partnerCount)} partners</div>
            </div>
          </div>
          <div class="team-stats">
            <div class="ts"><div class="ts-l">MTD</div><div class="ts-v pos"><b>${fmtINR(s.currentMonthPremium)}</b></div></div>
            <div class="ts"><div class="ts-l">LMTD</div><div class="ts-v">${fmtINR(s.prevMonthPremium)}</div></div>
            <div class="ts"><div class="ts-l">MoM</div><div class="ts-v ${s.momPct >= 0 ? 'pos' : 'neg'}">${s.momPct >= 0 ? '+' : ''}${s.momPct}%</div></div>
            <div class="ts"><div class="ts-l">Target</div><div class="ts-v">${fmtINR(s.totalTarget)}</div></div>
            <div class="ts"><div class="ts-l">Ach.</div><div class="ts-v ${s.achievementPct >= 80 ? 'pos' : s.achievementPct >= 40 ? '' : 'neg'}">${s.achievementPct}%</div></div>
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
  ['fRole','fRoleSearch','fRoleSort'].forEach(id => {
    const el = $(id); if (!el) return;
    el.addEventListener(el.tagName === 'INPUT' ? 'input' : 'change', renderRoles);
  });

  // ---------- State tab ----------
  function renderStates() {
    if (!state.master) return;
    const states = (state.master.stateSummaries || []).filter(x => x.partnerCount > 0);
    $('stateTbody').innerHTML = states.map(st => {
      const s = st.summary;
      return `<tr>
        <td><b>${safe(st.state)}</b></td>
        <td>${safe(zoneOfState(st.state))}</td>
        <td>${fmtInt(st.partnerCount)}</td>
        <td>${fmtINR(s.totalMaxPotential)}</td>
        <td>${fmtINR(s.totalOverallPotential)}</td>
        <td>${fmtINR(s.totalTarget)}</td>
        <td class="pos"><b>${fmtINR(s.currentMonthPremium)}</b></td>
        <td>${fmtINR(s.prevMonthPremium)}</td>
        <td class="${s.momPct >= 0 ? 'pos' : 'neg'}">${s.momPct >= 0 ? '+' : ''}${s.momPct}%</td>
        <td class="${s.achievementPct >= 80 ? 'pos' : s.achievementPct >= 40 ? '' : 'neg'}">${s.achievementPct}%</td>
        <td class="pos">${fmtInt(s.activeCount)}</td>
        <td class="pos">${fmtInt(s.connectedCount)}</td>
        <td class="pos">${fmtInt(s.totalCalls)}</td>
        <td class="pos">${fmtInt(s.totalVisits)}</td>
      </tr>`;
    }).join('');
  }

  function zoneOfState(state) {
    const s = (state || '').toLowerCase().trim();
    if (!s) return '—';
    if (['north','north key','ncr','delhi','up1','up2','uk1','uk2','haryana','punjab','chandigarh'].some(z => s.indexOf(z) !== -1)) return 'North';
    if (['gujarat','rajasthan','mp/cg','madhya','mumbai','pune'].some(z => s.indexOf(z) !== -1)) return 'West';
    if (['karnataka','kerala','tamil','telangana','andhra','south'].some(z => s.indexOf(z) !== -1)) return 'South';
    if (['bengal','orissa','north east','bihar','jharkhand','east'].some(z => s.indexOf(z) !== -1)) return 'East';
    if (['ron','rom','tele-rm'].some(z => s.indexOf(z) !== -1)) return 'RON';
    return 'Other';
  }

  // ---------- Logins tab ----------
  function loadLogins() {
    setStatus('Loading login activity…', 'loading');
    fetch(API_URL + '?action=getLoginStats&gid=' + encodeURIComponent(user.gid))
      .then(r => r.json())
      .then(res => {
        if (!res.success) { setStatus(res.message || 'Failed.', 'error'); return; }
        state.logins = res;
        renderLogins();
        setStatus('', '');
      })
      .catch(err => setStatus('Connection error: ' + err.message, 'error'));
  }

  function renderLogins() {
    if (!state.logins) return;
    $('loginTotal').textContent = fmtInt(state.logins.totalLogins);
    $('loginUsers').textContent = fmtInt((state.logins.stats || []).length);
    const search = ($('fLoginSearch').value || '').toLowerCase();
    const list = (state.logins.stats || []).filter(s =>
      !search || (s.name + ' ' + s.gid + ' ' + s.role).toLowerCase().indexOf(search) !== -1
    ).sort((a,b) => b.count - a.count);
    $('loginsTbody').innerHTML = list.map(s => `
      <tr>
        <td><b>${safe(s.name)}</b></td>
        <td>${safe(s.gid)}</td>
        <td>${safe(s.role)}</td>
        <td>${safe(s.zone)}</td>
        <td>${fmtInt(s.count)}</td>
        <td>${safe(s.lastLogin)}</td>
      </tr>`).join('');
  }
  $('fLoginSearch').addEventListener('input', renderLogins);
  $('btnRefreshLogins').addEventListener('click', loadLogins);

  // ---------- Modal ----------
  $('modalClose').addEventListener('click', () => $('drillModal').classList.add('hidden'));
  $('modalBackdrop').addEventListener('click', () => $('drillModal').classList.add('hidden'));

  // ---------- Kickoff ----------
  loadMaster();

})();
