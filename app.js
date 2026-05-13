// ====================================================================
// Partner Engage Portal — app.js v5
// Changes: Colored values in partner modal, Calls/Visits in tables
// ====================================================================

(function () {
  'use strict';

  const userJson = sessionStorage.getItem('peUser');
  if (!userJson) { location.href = 'index.html'; return; }
  const user = JSON.parse(userJson);

  let state = {
    user: user,
    partners: [],
    myPartners: [],
    team: [],
    amPerf: [],
    summary: null,
    overallProject: null,
    myZones: [],
    filterOptions: { states: [], cities: [], owners: [] },
    chartActivity: null,
    chartConnect: null
  };

  const MONTHS = ["Apr'25","May'25","Jun'25","Jul'25","Aug'25","Sep'25",
                  "Oct'25","Nov'25","Dec'25","Jan'26","Feb'26","Mar'26","Apr'26"];

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
  $('userRole').textContent = user.role + (user.zone ? ' • ' + user.zone : '');

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
      if (id === 'team') renderTeam();
      if (id === 'mine') renderMine();
      if (id === 'am') renderAm();
      if (id === 'overall') renderOverallCharts();
    });
  });

  if (user.role === 'AM') {
    $('tabMine').style.display = 'none';
    $('tabAm').style.display = 'none';
    $('tabTeam').style.display = 'none';
  }

  function setStatus(msg, kind) {
    const bar = $('statusBar');
    bar.className = 'status-bar ' + (kind || '');
    bar.textContent = msg;
    bar.classList.toggle('hidden', !msg);
  }

  function loadDashboard() {
    setStatus('Loading data from master sheet…', 'loading');
    const url = API_URL + '?action=getDashboard&gid=' + encodeURIComponent(user.gid);
    fetch(url)
      .then(r => r.json())
      .then(res => {
        if (!res.success) { setStatus(res.message || 'Failed to load.', 'error'); return; }
        state.partners = res.partners || [];
        state.myPartners = res.myPartners || [];
        state.team = res.teamBreakdown || [];
        state.amPerf = res.amPerformance || [];
        state.summary = res.summary;
        state.overallProject = res.overallProject;
        state.filterOptions = res.filterOptions || { states: [], cities: [], owners: [] };
        state.myZones = res.myZones || [];

        renderZoneChips();
        populateFilterOptions();
        renderOverall();
        renderKpiRow();
        renderTable();
        renderOverallCharts();
        setStatus('', '');
      })
      .catch(err => setStatus('Connection error: ' + err.message, 'error'));
  }

  function renderZoneChips() {
    const c = $('zoneChips');
    if (!c) return;
    if (state.myZones.length === 0) { c.innerHTML = ''; return; }
    c.innerHTML = ' Your zone access: ' + state.myZones.map(z =>
      `<span class="role-chip">${safe(z)}</span>`).join(' ');
  }

  function renderOverall() {
    const op = state.overallProject;
    if (!op) return;
    $('op-totalPartners').textContent = fmtInt(op.totalPartners);
    $('op-active').textContent = fmtInt(op.activePartners);
    $('op-inactive').textContent = fmtInt(op.inactivePartners);
    $('op-business').textContent = fmtINR(op.businessGenerated);
    $('op-mom').textContent = (op.momPct >= 0 ? '+' : '') + op.momPct + '%';
    const momPill = $('op-momPill');
    momPill.classList.remove('pill-green', 'pill-red');
    momPill.classList.add(op.momPct >= 0 ? 'pill-green' : 'pill-red');
    $('op-ach').textContent = op.achievementPct + '%';
    $('op-connected').textContent = fmtInt(op.connectedPartners) + ' / ' + fmtInt(op.totalPartners);
    $('op-conn').textContent = fmtInt(op.connectedPartners);
    $('op-notconn').textContent = fmtInt(op.nonConnectedPartners);
    $('op-maxpot').textContent = fmtINR(op.maxPotential);
    $('op-overallpot').textContent = fmtINR(op.overallPotential);
    $('op-target').textContent = fmtINR(op.target);
    $('op-maxAch').textContent = op.maxPotAchPct + '%';
    $('op-calls').textContent = fmtInt(op.calls);
    $('op-visits').textContent = fmtInt(op.visits);
    $('op-growth').textContent = fmtInt(op.growthCount);
    $('op-degrowth').textContent = fmtInt(op.degrowthCount);
  }

  function renderOverallCharts() {
    if (!state.overallProject) return;
    const op = state.overallProject;
    if (state.chartActivity) state.chartActivity.destroy();
    if (state.chartConnect) state.chartConnect.destroy();
    const cAct = $('chartActivity');
    if (cAct) {
      state.chartActivity = new Chart(cAct, {
        type: 'doughnut',
        data: { labels: ['Active', 'Inactive'], datasets: [{ data: [op.activePartners, op.inactivePartners], backgroundColor: ['#16a34a', '#dc2626'] }] },
        options: { plugins: { legend: { position: 'bottom' } } }
      });
    }
    const cConn = $('chartConnect');
    if (cConn) {
      state.chartConnect = new Chart(cConn, {
        type: 'doughnut',
        data: { labels: ['Connected', 'Not Connected'], datasets: [{ data: [op.connectedPartners, op.nonConnectedPartners], backgroundColor: ['#2563eb', '#f59e0b'] }] },
        options: { plugins: { legend: { position: 'bottom' } } }
      });
    }
  }

  function renderKpiRow() {
    const s = state.summary;
    if (!s) return;
    $('kpiRow').innerHTML = renderKpis(s);
  }

  function renderKpis(s) {
    return `
      <div class="kpi-mini"><span class="kpi-mini-icon">👥</span><div><div class="kpi-mini-label">Partners</div><div class="kpi-mini-val">${fmtInt(s.totalPartners)}</div></div></div>
      <div class="kpi-mini"><span class="kpi-mini-icon">📈</span><div><div class="kpi-mini-label">Max Potential</div><div class="kpi-mini-val">${fmtINR(s.totalMaxPotential)}</div></div></div>
      <div class="kpi-mini"><span class="kpi-mini-icon">🏦</span><div><div class="kpi-mini-label">Overall Potential</div><div class="kpi-mini-val">${fmtINR(s.totalOverallPotential)}</div></div></div>
      <div class="kpi-mini"><span class="kpi-mini-icon">🎯</span><div><div class="kpi-mini-label">Target (May)</div><div class="kpi-mini-val">${fmtINR(s.totalTarget)}</div></div></div>
      <div class="kpi-mini"><span class="kpi-mini-icon">📅</span><div><div class="kpi-mini-label">MTD (May'26)</div><div class="kpi-mini-val pos">${fmtINR(s.currentMonthPremium)}</div><div class="kpi-mini-foot ${s.momPct >= 0 ? 'pos' : 'neg'}">${(s.momPct >= 0 ? '▲ ' : '▼ ') + Math.abs(s.momPct)}% MoM</div></div></div>
      <div class="kpi-mini"><span class="kpi-mini-icon">📆</span><div><div class="kpi-mini-label">LMTD (Apr'26)</div><div class="kpi-mini-val">${fmtINR(s.prevMonthPremium)}</div></div></div>
      <div class="kpi-mini"><span class="kpi-mini-icon">🏆</span><div><div class="kpi-mini-label">Target Ach.</div><div class="kpi-mini-val ${s.achievementPct >= 80 ? 'pos' : s.achievementPct >= 40 ? '' : 'neg'}">${s.achievementPct}%</div></div></div>
      <div class="kpi-mini"><span class="kpi-mini-icon">✅</span><div><div class="kpi-mini-label">Active</div><div class="kpi-mini-val pos">${fmtInt(s.activeCount)}</div><div class="kpi-mini-foot neg">Inactive: ${fmtInt(s.inactiveCount)}</div></div></div>
      <div class="kpi-mini"><span class="kpi-mini-icon">📞</span><div><div class="kpi-mini-label">Connected</div><div class="kpi-mini-val pos">${fmtInt(s.connectedCount)}</div><div class="kpi-mini-foot neg">Not Conn: ${fmtInt(s.notConnectedCount)}</div></div></div>
      <div class="kpi-mini"><span class="kpi-mini-icon">📱</span><div><div class="kpi-mini-label">Calls / Visits</div><div class="kpi-mini-val pos">${fmtInt(s.totalCalls)} / ${fmtInt(s.totalVisits)}</div></div></div>
    `;
  }

  function populateFilterOptions() {
    const { states, cities, owners } = state.filterOptions;
    fill($('fState'),    states, 'All states');
    fill($('fCity'),     cities, 'All cities');
    fill($('fOwner'),    owners, 'All owners');
    fill($('fStateMine'),states, 'All states');
    fill($('fTeamState'),states, 'All states');
    fill($('fAmState'),  states, 'All states');
  }
  function fill(sel, arr, ph) {
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = '<option value="">' + ph + '</option>' +
      (arr || []).map(v => `<option value="${safe(v)}">${safe(v)}</option>`).join('');
    sel.value = cur;
  }

  // ---------- All Partners tab ----------
  function getFiltered() {
    const q = $('fSearch').value.trim().toLowerCase();
    const st = $('fState').value;
    const ct = $('fCity').value;
    const ow = $('fOwner').value;
    const orole = $('fOwnerRole').value;
    const ac = $('fActive').value;
    const gw = $('fGrowth').value;
    const cn = $('fConnect').value;
    const bz = $('fBusiness').value;
    const mp = $('fMaxPot').value;

    return state.partners.filter(p => {
      if (q) {
        const hay = (p.name + ' ' + p.gid + ' ' + p.city + ' ' + p.empId).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      if (st && p.state !== st) return false;
      if (ct && p.city !== ct) return false;
      if (ow && p.ownerName !== ow) return false;
      if (orole && p.ownerRole !== orole) return false;
      if (ac === 'active' && !p.isActive) return false;
      if (ac === 'inactive' && p.isActive) return false;
      if (gw === 'growth' && !p.isGrowth) return false;
      if (gw === 'degrowth' && p.isGrowth) return false;
      if (cn === 'connected' && !p.connected) return false;
      if (cn === 'notconnected' && p.connected) return false;
      if (bz && !rangeMatch(p.currentMonth, bz)) return false;
      if (mp && !rangeMatch(p.maxPotential, mp)) return false;
      return true;
    });
  }

  function rangeMatch(val, range) {
    if (range === '0') return val === 0;
    const parts = range.split('-');
    const lo = parts[0] === '' ? -Infinity : parseFloat(parts[0]);
    const hi = parts[1] === '' || parts[1] === undefined ? Infinity : parseFloat(parts[1]);
    return val >= lo && val <= hi;
  }

  function renderTable() {
    const list = getFiltered();
    $('filterCount').textContent = list.length + ' of ' + state.partners.length + ' partners';
    const tbody = $('partnerTbody');
    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="15" class="empty">No partners match these filters.</td></tr>`;
      return;
    }
    tbody.innerHTML = list.map(p => rowHtml(p)).join('');
    tbody.querySelectorAll('.openModal').forEach(b => {
      b.addEventListener('click', () => openModal(b.dataset.gid));
    });
  }

  function rowHtml(p) {
    const mom = p.prevMonth > 0 ? Math.round((p.currentMonth - p.prevMonth) / p.prevMonth * 100) : 0;
    const trend = p.isGrowth ? 'pos' : 'neg';
    return `
      <tr data-gid="${safe(p.gid)}">
        <td><div class="partner-name">${safe(p.name)}</div><div class="partner-sub">${safe(p.gid)}</div></td>
        <td><div>${safe(p.city)}</div><div class="partner-sub">${safe(p.state)}</div></td>
        <td><div>${safe(p.ownerName)}</div><div class="partner-sub">${safe(p.ownerRole)}</div></td>
        <td>${fmtINR(p.maxPotential)}</td>
        <td>${fmtINR(p.overallPotential)}</td>
        <td>${fmtINR(p.target)}</td>
        <td class="pos"><b>${fmtINR(p.currentMonth)}</b></td>
        <td>${fmtINR(p.prevMonth)}</td>
        <td class="${mom >= 0 ? 'pos' : 'neg'}">${mom >= 0 ? '+' : ''}${mom}%</td>
        <td><span class="trend-${trend}">${p.isGrowth ? '▲ Growth' : '▼ Degrowth'}</span></td>
        <td>${p.isActive ? '<span class="badge badge-green">Active</span>' : '<span class="badge badge-red">Inactive</span>'}</td>
        <td>${p.connected ? '<span class="badge badge-blue">Connected</span>' : '<span class="badge badge-amber">Not Conn.</span>'}</td>
        <td class="pos"><b>${fmtInt(p.calls)}</b></td>
        <td class="pos"><b>${fmtInt(p.visits)}</b></td>
        <td><button class="btn-link openModal" data-gid="${safe(p.gid)}">View</button></td>
      </tr>`;
  }

  ['fSearch','fState','fCity','fOwner','fOwnerRole','fActive','fGrowth','fConnect','fBusiness','fMaxPot'].forEach(id => {
    const el = $(id);
    el.addEventListener(el.tagName === 'INPUT' ? 'input' : 'change', renderTable);
  });
  $('btnClearFilters').addEventListener('click', () => {
    ['fSearch','fState','fCity','fOwner','fOwnerRole','fActive','fGrowth','fConnect','fBusiness','fMaxPot'].forEach(id => $(id).value = '');
    renderTable();
  });
  $('btnExportCsv').addEventListener('click', exportCsv);

  function exportCsv() {
    const list = getFiltered();
    const headers = ['GID','Name','City','State','OwnerRole','OwnerName','MaxPotential','OverallPotential','Target','MTD','LMTD','MoM%','Active','Growth','Connected','Calls','Visits'];
    const rows = list.map(p => [
      p.gid, p.name, p.city, p.state, p.ownerRole, p.ownerName,
      p.maxPotential, p.overallPotential, p.target, p.currentMonth, p.prevMonth,
      p.prevMonth > 0 ? Math.round((p.currentMonth - p.prevMonth) / p.prevMonth * 100) : 0,
      p.isActive ? 'Active' : 'Inactive',
      p.isGrowth ? 'Growth' : 'Degrowth',
      p.connected ? 'Connected' : 'Not Connected',
      p.calls, p.visits
    ]);
    const csv = [headers, ...rows].map(r => r.map(x =>
      `"${String(x == null ? '' : x).replace(/"/g, '""')}"`
    ).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'partners_' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
  }

  // ---------- My Partners tab ----------
  function renderMine() {
    if (user.role === 'AM') return;
    const list = state.myPartners || [];
    if (list.length === 0) {
      $('kpiRowMine').innerHTML = '<div class="empty">No partners are directly assigned to you.</div>';
      $('mineTbody').innerHTML = '';
      return;
    }
    const s = computeSummary(list);
    $('kpiRowMine').innerHTML = renderKpis(s);

    const q = ($('fSearchMine').value || '').toLowerCase();
    const st = $('fStateMine').value;
    const ac = $('fActiveMine').value;
    const cn = $('fConnectMine').value;

    const filtered = list.filter(p => {
      if (q && (p.name + ' ' + p.gid + ' ' + p.city).toLowerCase().indexOf(q) === -1) return false;
      if (st && p.state !== st) return false;
      if (ac === 'active' && !p.isActive) return false;
      if (ac === 'inactive' && p.isActive) return false;
      if (cn === 'connected' && !p.connected) return false;
      if (cn === 'notconnected' && p.connected) return false;
      return true;
    });

    $('mineTbody').innerHTML = filtered.map(p => {
      const mom = p.prevMonth > 0 ? Math.round((p.currentMonth - p.prevMonth) / p.prevMonth * 100) : 0;
      const trend = p.isGrowth ? 'pos' : 'neg';
      return `
        <tr>
          <td><div class="partner-name">${safe(p.name)}</div><div class="partner-sub">${safe(p.gid)}</div></td>
          <td>${safe(p.city)}<div class="partner-sub">${safe(p.state)}</div></td>
          <td>${fmtINR(p.maxPotential)}</td>
          <td>${fmtINR(p.overallPotential)}</td>
          <td>${fmtINR(p.target)}</td>
          <td class="pos"><b>${fmtINR(p.currentMonth)}</b></td>
          <td>${fmtINR(p.prevMonth)}</td>
          <td class="${mom >= 0 ? 'pos' : 'neg'}">${mom >= 0 ? '+' : ''}${mom}%</td>
          <td><span class="trend-${trend}">${p.isGrowth ? '▲ Growth' : '▼ Degrowth'}</span></td>
          <td>${p.isActive ? '<span class="badge badge-green">Active</span>' : '<span class="badge badge-red">Inactive</span>'}</td>
          <td>${p.connected ? '<span class="badge badge-blue">Connected</span>' : '<span class="badge badge-amber">Not Conn.</span>'}</td>
          <td class="pos"><b>${fmtInt(p.calls)}</b></td>
          <td class="pos"><b>${fmtInt(p.visits)}</b></td>
          <td><button class="btn-link openModal" data-gid="${safe(p.gid)}">View</button></td>
        </tr>`;
    }).join('');
    $('mineTbody').querySelectorAll('.openModal').forEach(b => {
      b.addEventListener('click', () => openModal(b.dataset.gid));
    });
  }
  ['fSearchMine','fStateMine','fActiveMine','fConnectMine'].forEach(id => {
    const el = $(id); if (!el) return;
    el.addEventListener(el.tagName === 'INPUT' ? 'input' : 'change', renderMine);
  });
  if ($('btnClearMine')) $('btnClearMine').addEventListener('click', () => {
    ['fSearchMine','fStateMine','fActiveMine','fConnectMine'].forEach(id => $(id).value = '');
    renderMine();
  });

  function computeSummary(list) {
    let curr=0, prev=0, mp=0, op=0, tg=0, ac=0, gw=0, cn=0, cl=0, vs=0;
    list.forEach(p => {
      curr += p.currentMonth; prev += p.prevMonth;
      mp += p.maxPotential; op += p.overallPotential; tg += p.target;
      if (p.isActive) ac++; if (p.isGrowth) gw++; if (p.connected) cn++;
      cl += p.calls; vs += p.visits;
    });
    return {
      totalPartners: list.length,
      totalMaxPotential: mp, totalOverallPotential: op, totalTarget: tg,
      currentMonthPremium: curr, prevMonthPremium: prev,
      activeCount: ac, inactiveCount: list.length - ac,
      growthCount: gw, degrowthCount: list.length - gw,
      connectedCount: cn, notConnectedCount: list.length - cn,
      totalCalls: cl, totalVisits: vs,
      achievementPct: tg > 0 ? Math.round(curr / tg * 100) : 0,
      momPct: prev > 0 ? Math.round((curr - prev) / prev * 100) : 0
    };
  }

  // ---------- AM Performance tab ----------
  function renderAm() {
    if (user.role === 'AM') return;
    let list = state.amPerf.slice();
    const q = ($('fAmSearch').value || '').toLowerCase();
    const st = $('fAmState').value;
    const sort = $('fAmSort').value || 'mtd';
    const status = $('fAmStatus').value;

    if (q) list = list.filter(a => a.name.toLowerCase().indexOf(q) !== -1);
    if (st) list = list.filter(a => a.states.indexOf(st) !== -1);
    if (status === 'active') list = list.filter(a => a.overallProject.activePartners > 0);
    if (status === 'inactive') list = list.filter(a => a.overallProject.inactivePartners > 0);

    list.sort((a, b) => {
      if (sort === 'mtd')      return b.summary.currentMonthPremium - a.summary.currentMonthPremium;
      if (sort === 'ach')      return b.summary.achievementPct - a.summary.achievementPct;
      if (sort === 'partners') return b.summary.totalPartners - a.summary.totalPartners;
      if (sort === 'active')   return b.overallProject.activePartners - a.overallProject.activePartners;
      if (sort === 'name')     return a.name.localeCompare(b.name);
      return 0;
    });

    if (list.length === 0) {
      $('amGrid').innerHTML = '<div class="empty">No AMs match these filters.</div>';
      return;
    }

    $('amGrid').innerHTML = list.map(a => {
      const op = a.overallProject;
      return `
        <div class="team-card am-card">
          <div class="team-card-head">
            <div>
              <div class="team-name">${safe(a.name)}</div>
              <div class="team-role">AM • ${fmtInt(op.totalPartners)} partners • ${a.states.join(', ')}</div>
            </div>
            <button class="btn-primary openAmDrill" data-name="${safe(a.name)}">Details</button>
          </div>
          <div class="team-stats">
            <div class="ts"><div class="ts-l">MTD</div><div class="ts-v pos"><b>${fmtINR(op.businessGenerated)}</b></div></div>
            <div class="ts"><div class="ts-l">LMTD</div><div class="ts-v">${fmtINR(a.summary.prevMonthPremium)}</div></div>
            <div class="ts"><div class="ts-l">MoM</div><div class="ts-v ${op.momPct >= 0 ? 'pos' : 'neg'}">${op.momPct >= 0 ? '+' : ''}${op.momPct}%</div></div>
            <div class="ts"><div class="ts-l">Target</div><div class="ts-v">${fmtINR(op.target)}</div></div>
            <div class="ts"><div class="ts-l">Ach.</div><div class="ts-v ${op.achievementPct >= 80 ? 'pos' : op.achievementPct >= 40 ? '' : 'neg'}">${op.achievementPct}%</div></div>
            <div class="ts"><div class="ts-l">Max Pot.</div><div class="ts-v">${fmtINR(op.maxPotential)}</div></div>
            <div class="ts"><div class="ts-l">Overall Pot.</div><div class="ts-v">${fmtINR(op.overallPotential)}</div></div>
            <div class="ts"><div class="ts-l">Active</div><div class="ts-v pos">${fmtInt(op.activePartners)}</div></div>
            <div class="ts"><div class="ts-l">Inactive</div><div class="ts-v neg">${fmtInt(op.inactivePartners)}</div></div>
            <div class="ts"><div class="ts-l">Connected</div><div class="ts-v pos">${fmtInt(op.connectedPartners)}</div></div>
            <div class="ts"><div class="ts-l">Calls</div><div class="ts-v pos"><b>${fmtInt(op.calls)}</b></div></div>
            <div class="ts"><div class="ts-l">Visits</div><div class="ts-v pos"><b>${fmtInt(op.visits)}</b></div></div>
          </div>
        </div>`;
    }).join('');

    $('amGrid').querySelectorAll('.openAmDrill').forEach(b => {
      b.addEventListener('click', () => openAmDrill(b.dataset.name));
    });
  }
  ['fAmSearch','fAmState','fAmSort','fAmStatus'].forEach(id => {
    const el = $(id); if (!el) return;
    el.addEventListener(el.tagName === 'INPUT' ? 'input' : 'change', renderAm);
  });

  function openAmDrill(amName) {
    const am = state.amPerf.find(a => a.name === amName);
    if (!am) return;
    const op = am.overallProject;
    const rows = am.partners.map(p => {
      const mom = p.prevMonth > 0 ? Math.round((p.currentMonth - p.prevMonth) / p.prevMonth * 100) : 0;
      const trend = p.isGrowth ? 'pos' : 'neg';
      return `<tr>
        <td><div class="partner-name">${safe(p.name)}</div><div class="partner-sub">${safe(p.gid)}</div></td>
        <td>${safe(p.city)}<div class="partner-sub">${safe(p.state)}</div></td>
        <td>${fmtINR(p.maxPotential)}</td>
        <td>${fmtINR(p.overallPotential)}</td>
        <td>${fmtINR(p.target)}</td>
        <td class="pos"><b>${fmtINR(p.currentMonth)}</b></td>
        <td>${fmtINR(p.prevMonth)}</td>
        <td class="${mom >= 0 ? 'pos' : 'neg'}">${mom >= 0 ? '+' : ''}${mom}%</td>
        <td><span class="trend-${trend}">${p.isGrowth ? '▲ Growth' : '▼ Degrowth'}</span></td>
        <td>${p.isActive ? '<span class="badge badge-green">Active</span>' : '<span class="badge badge-red">Inactive</span>'}</td>
        <td>${p.connected ? '<span class="badge badge-blue">Conn.</span>' : '<span class="badge badge-amber">Not</span>'}</td>
        <td class="pos"><b>${fmtInt(p.calls)}</b></td>
        <td class="pos"><b>${fmtInt(p.visits)}</b></td>
        <td><button class="btn-link openModal" data-gid="${safe(p.gid)}">View</button></td>
      </tr>`;
    }).join('');

    $('modalBody').innerHTML = `
      <h2>${safe(am.name)} <span class="role-chip">AM</span></h2>
      <div class="modal-sub">${am.states.join(', ')}${am.cities.length ? ' • ' + am.cities.slice(0, 5).join(', ') : ''}${am.cities.length > 5 ? ' …' : ''}</div>
      <div class="kpi-row">
        <div class="kpi-mini"><div><div class="kpi-mini-label">Partners</div><div class="kpi-mini-val">${fmtInt(op.totalPartners)}</div></div></div>
        <div class="kpi-mini"><div><div class="kpi-mini-label">Active / Inactive</div><div class="kpi-mini-val"><span class="pos">${fmtInt(op.activePartners)}</span> / <span class="neg">${fmtInt(op.inactivePartners)}</span></div></div></div>
        <div class="kpi-mini"><div><div class="kpi-mini-label">Max Potential</div><div class="kpi-mini-val">${fmtINR(op.maxPotential)}</div></div></div>
        <div class="kpi-mini"><div><div class="kpi-mini-label">Overall Potential</div><div class="kpi-mini-val">${fmtINR(op.overallPotential)}</div></div></div>
        <div class="kpi-mini"><div><div class="kpi-mini-label">Target</div><div class="kpi-mini-val">${fmtINR(op.target)}</div></div></div>
        <div class="kpi-mini"><div><div class="kpi-mini-label">MTD</div><div class="kpi-mini-val pos"><b>${fmtINR(op.businessGenerated)}</b></div></div></div>
        <div class="kpi-mini"><div><div class="kpi-mini-label">Achievement</div><div class="kpi-mini-val">${op.achievementPct}%</div></div></div>
        <div class="kpi-mini"><div><div class="kpi-mini-label">Connected</div><div class="kpi-mini-val pos">${fmtInt(op.connectedPartners)}</div></div></div>
        <div class="kpi-mini"><div><div class="kpi-mini-label">Calls / Visits</div><div class="kpi-mini-val pos">${fmtInt(op.calls)} / ${fmtInt(op.visits)}</div></div></div>
      </div>
      <h3>Partners under ${safe(am.name)}</h3>
      <div class="table-wrap">
        <table class="ptable">
          <thead><tr>
            <th>Partner</th><th>City / State</th><th>Max Pot.</th><th>Overall Pot.</th>
            <th>Target</th><th>MTD</th><th>LMTD</th><th>MoM%</th><th>Growth/Degrowth</th>
            <th>Status</th><th>Connect</th><th>Calls</th><th>Visits</th><th>Action</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
    $('partnerModal').classList.remove('hidden');
    $('modalBody').querySelectorAll('.openModal').forEach(b => {
      b.addEventListener('click', () => openModal(b.dataset.gid));
    });
  }

  // ---------- Team Performance tab ----------
  function renderTeam() {
    if (user.role === 'AM') return;
    let team = state.team || [];
    const roleF = $('fTeamRole').value;
    const search = ($('fTeamSearch').value || '').toLowerCase();
    const stateF = $('fTeamState').value;
    if (roleF) team = team.filter(t => t.role === roleF);
    if (search) team = team.filter(t => t.name.toLowerCase().indexOf(search) !== -1);
    if (stateF) team = team.filter(t => t.partners.some(p => p.state === stateF));
    if (team.length === 0) {
      $('teamGrid').innerHTML = '<div class="empty">No team members match.</div>';
      return;
    }
    $('teamGrid').innerHTML = team.map(t => {
      const op = t.overallProject;
      return `
        <div class="team-card">
          <div class="team-card-head">
            <div>
              <div class="team-name">${safe(t.name)}</div>
              <div class="team-role">${safe(t.role)} • ${fmtInt(op.totalPartners)} partners</div>
            </div>
            <button class="btn-link openTeamMember" data-key="${safe(t.role + '|' + t.name)}">Details</button>
          </div>
          <div class="team-stats">
            <div class="ts"><div class="ts-l">MTD</div><div class="ts-v pos"><b>${fmtINR(op.businessGenerated)}</b></div></div>
            <div class="ts"><div class="ts-l">LMTD</div><div class="ts-v">${fmtINR(t.summary.prevMonthPremium)}</div></div>
            <div class="ts"><div class="ts-l">Target</div><div class="ts-v">${fmtINR(op.target)}</div></div>
            <div class="ts"><div class="ts-l">Ach.</div><div class="ts-v ${op.achievementPct >= 80 ? 'pos' : op.achievementPct >= 40 ? '' : 'neg'}">${op.achievementPct}%</div></div>
            <div class="ts"><div class="ts-l">Max Pot.</div><div class="ts-v">${fmtINR(op.maxPotential)}</div></div>
            <div class="ts"><div class="ts-l">Active</div><div class="ts-v pos">${fmtInt(op.activePartners)}</div></div>
            <div class="ts"><div class="ts-l">Inactive</div><div class="ts-v neg">${fmtInt(op.inactivePartners)}</div></div>
            <div class="ts"><div class="ts-l">Connected</div><div class="ts-v pos">${fmtInt(op.connectedPartners)}</div></div>
            <div class="ts"><div class="ts-l">Calls</div><div class="ts-v pos"><b>${fmtInt(op.calls)}</b></div></div>
            <div class="ts"><div class="ts-l">Visits</div><div class="ts-v pos"><b>${fmtInt(op.visits)}</b></div></div>
          </div>
        </div>`;
    }).join('');
    $('teamGrid').querySelectorAll('.openTeamMember').forEach(b => {
      b.addEventListener('click', () => openTeamModal(b.dataset.key));
    });
  }
  ['fTeamRole','fTeamSearch','fTeamState'].forEach(id => {
    const el = $(id); if (!el) return;
    el.addEventListener(el.tagName === 'INPUT' ? 'input' : 'change', renderTeam);
  });

  function openTeamModal(key) {
    const member = (state.team || []).find(t => (t.role + '|' + t.name) === key);
    if (!member) return;
    const op = member.overallProject;
    const rows = member.partners.map(p => {
      const mom = p.prevMonth > 0 ? Math.round((p.currentMonth - p.prevMonth) / p.prevMonth * 100) : 0;
      const trend = p.isGrowth ? 'pos' : 'neg';
      return `<tr>
        <td>${safe(p.name)}<div class="partner-sub">${safe(p.gid)}</div></td>
        <td>${safe(p.city)}, ${safe(p.state)}</td>
        <td>${fmtINR(p.maxPotential)}</td>
        <td>${fmtINR(p.overallPotential)}</td>
        <td>${fmtINR(p.target)}</td>
        <td class="pos"><b>${fmtINR(p.currentMonth)}</b></td>
        <td>${fmtINR(p.prevMonth)}</td>
        <td class="${mom >= 0 ? 'pos' : 'neg'}">${mom >= 0 ? '+' : ''}${mom}%</td>
        <td><span class="trend-${trend}">${p.isGrowth ? '▲ Growth' : '▼ Degrowth'}</span></td>
        <td>${p.isActive ? '<span class="badge badge-green">Active</span>' : '<span class="badge badge-red">Inactive</span>'}</td>
        <td class="pos"><b>${fmtInt(p.calls)}</b></td>
        <td class="pos"><b>${fmtInt(p.visits)}</b></td>
      </tr>`;
    }).join('');
    $('modalBody').innerHTML = `
      <h2>${safe(member.name)} <span class="role-chip">${safe(member.role)}</span></h2>
      <div class="kpi-row">
        <div class="kpi-mini"><div><div class="kpi-mini-label">Partners</div><div class="kpi-mini-val">${fmtInt(op.totalPartners)}</div></div></div>
        <div class="kpi-mini"><div><div class="kpi-mini-label">MTD</div><div class="kpi-mini-val pos">${fmtINR(op.businessGenerated)}</div></div></div>
        <div class="kpi-mini"><div><div class="kpi-mini-label">Target</div><div class="kpi-mini-val">${fmtINR(op.target)}</div></div></div>
        <div class="kpi-mini"><div><div class="kpi-mini-label">Ach.</div><div class="kpi-mini-val">${op.achievementPct}%</div></div></div>
        <div class="kpi-mini"><div><div class="kpi-mini-label">Active</div><div class="kpi-mini-val pos">${fmtInt(op.activePartners)}</div></div></div>
        <div class="kpi-mini"><div><div class="kpi-mini-label">Inactive</div><div class="kpi-mini-val neg">${fmtInt(op.inactivePartners)}</div></div></div>
        <div class="kpi-mini"><div><div class="kpi-mini-label">Connected</div><div class="kpi-mini-val pos">${fmtInt(op.connectedPartners)}</div></div></div>
        <div class="kpi-mini"><div><div class="kpi-mini-label">Calls / Visits</div><div class="kpi-mini-val pos">${fmtInt(op.calls)} / ${fmtInt(op.visits)}</div></div></div>
      </div>
      <div class="table-wrap">
        <table class="ptable">
          <thead><tr>
            <th>Partner</th><th>City, State</th><th>Max Pot.</th><th>Overall Pot.</th>
            <th>Target</th><th>MTD</th><th>LMTD</th><th>MoM%</th><th>Growth/Degrowth</th><th>Status</th>
            <th>Calls</th><th>Visits</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
    $('partnerModal').classList.remove('hidden');
  }

  // ---------- Partner Modal — KEY CHANGES: colored values + Calls/Visits in headings ----------
  function openModal(gid) {
    const p = state.partners.find(x => x.gid === gid);
    if (!p) return;
    const maxAch = p.maxPotential > 0 ? Math.round(p.currentMonth / p.maxPotential * 100) : 0;
    const mom = p.prevMonth > 0 ? Math.round((p.currentMonth - p.prevMonth) / p.prevMonth * 100) : 0;

    // Determine colors:
    // - MTD: green if > LMTD (growth), red if < (degrowth)
    // - LMTD: neutral
    // - Max Pot / Overall Pot: green if > 0
    // - Target: amber/neutral
    const mtdClass = p.currentMonth >= p.prevMonth ? 'pos' : 'neg';
    const maxPotClass = p.maxPotential > 0 ? 'pos' : '';
    const overallPotClass = p.overallPotential > 0 ? 'pos' : '';
    const callsClass = p.calls > 0 ? 'pos' : '';
    const visitsClass = p.visits > 0 ? 'pos' : '';

    $('modalBody').innerHTML = `
      <h2>${safe(p.name)} <span class="role-chip">${safe(p.gid)}</span></h2>
      <div class="modal-sub">${safe(p.city)}, ${safe(p.state)} • Owner: ${safe(p.ownerName)} (${safe(p.ownerRole)})</div>
      <div class="kpi-row">
        <div class="kpi-mini"><div><div class="kpi-mini-label">Max Potential</div><div class="kpi-mini-val ${maxPotClass}">${fmtINR(p.maxPotential)}</div></div></div>
        <div class="kpi-mini"><div><div class="kpi-mini-label">Overall Potential</div><div class="kpi-mini-val ${overallPotClass}">${fmtINR(p.overallPotential)}</div></div></div>
        <div class="kpi-mini"><div><div class="kpi-mini-label">Target (May)</div><div class="kpi-mini-val">${fmtINR(p.target)}</div></div></div>
        <div class="kpi-mini"><div><div class="kpi-mini-label">MTD (May'26)</div><div class="kpi-mini-val ${mtdClass}"><b>${fmtINR(p.currentMonth)}</b></div></div></div>
        <div class="kpi-mini"><div><div class="kpi-mini-label">LMTD (Apr'26)</div><div class="kpi-mini-val">${fmtINR(p.prevMonth)}</div></div></div>
        <div class="kpi-mini"><div><div class="kpi-mini-label">MoM</div><div class="kpi-mini-val ${mom >= 0 ? 'pos' : 'neg'}">${mom >= 0 ? '+' : ''}${mom}%</div></div></div>
        <div class="kpi-mini"><div><div class="kpi-mini-label">Calls</div><div class="kpi-mini-val ${callsClass}"><b>${fmtInt(p.calls)}</b></div></div></div>
        <div class="kpi-mini"><div><div class="kpi-mini-label">Visits</div><div class="kpi-mini-val ${visitsClass}"><b>${fmtInt(p.visits)}</b></div></div></div>
      </div>
      <div class="potential-box">
        <div><b>Max-Pot Achievement:</b> <span class="${maxAch >= 80 ? 'pos' : maxAch >= 40 ? '' : 'neg'}">${maxAch}%</span> &nbsp; | &nbsp;
        <b>Growth Status:</b> ${p.isGrowth ? '<span class="pos">▲ Growth</span>' : '<span class="neg">▼ Degrowth</span>'}</div>
      </div>
      <h3>14-Month Trend</h3>
      <canvas id="trendChart" height="300" style="max-height:300px;"></canvas>
      <h3>Month-by-month history</h3>
      <div class="table-wrap">
        <table class="ptable compact">
          <thead><tr>${MONTHS.map(m => `<th>${m}</th>`).join('')}<th>May'26</th></tr></thead>
          <tbody><tr>${p.monthlyData.map(v => `<td>${fmtINR(v)}</td>`).join('')}<td class="highlight pos"><b>${fmtINR(p.currentMonth)}</b></td></tr></tbody>
        </table>
      </div>
      <h3>Connect Status — Calls: <span class="pos">${fmtInt(p.calls)}</span> &nbsp; Visits: <span class="pos">${fmtInt(p.visits)}</span></h3>
      <div class="row-flex">
        <div>Status: ${p.isActive ? '<span class="badge badge-green">Active</span>' : '<span class="badge badge-red">Inactive</span>'}</div>
        <div>${p.connected ? '<span class="badge badge-blue">Connected</span>' : '<span class="badge badge-amber">Not Connected</span>'}</div>
      </div>
      <h3>Remark</h3>
      <textarea id="remarkBox" rows="3" placeholder="Type a remark and click Save…">${safe(p.remark || '')}</textarea>
      <button class="btn-primary" id="btnSaveRemark">Save remark</button>
      <div id="remarkStatus" class="remark-status"></div>
    `;
    $('partnerModal').classList.remove('hidden');

    const ctx = $('trendChart');
    const allData = [...p.monthlyData, p.currentMonth];
    const pointColors = allData.map((val, idx) => {
      if (idx === 0) return '#888';
      return val >= allData[idx - 1] ? '#16a34a' : '#dc2626';
    });

    new Chart(ctx, {
      type: 'line',
      data: {
        labels: [...MONTHS, "May'26"],
        datasets: [
          {
            label: 'Monthly business', data: allData,
            borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,0.08)', fill: true,
            tension: 0.3, pointBackgroundColor: pointColors, pointRadius: 5, pointBorderWidth: 2,
            pointBorderColor: pointColors,
            segment: { borderColor: ctx => allData[ctx.p1DataIndex] >= allData[ctx.p0DataIndex] ? '#16a34a' : '#dc2626' }
          },
          { label: 'May target', data: new Array(13).fill(null).concat([p.target]),
            borderColor: '#9333ea', borderDash: [5, 5], pointRadius: 0, fill: false }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: { y: { ticks: { callback: v => fmtINR(v) } } },
        plugins: { legend: { position: 'bottom' } }
      }
    });

    $('btnSaveRemark').addEventListener('click', () => {
      const r = $('remarkBox').value;
      $('remarkStatus').textContent = 'Saving…';
      const url = API_URL + '?action=saveRemark&gid=' + encodeURIComponent(user.gid)
        + '&partnerGid=' + encodeURIComponent(p.gid)
        + '&remark=' + encodeURIComponent(r);
      fetch(url).then(r => r.json()).then(res => {
        $('remarkStatus').textContent = res.success ? '✓ Saved' : '✗ ' + (res.message || 'Failed');
        if (res.success) p.remark = r;
      }).catch(err => $('remarkStatus').textContent = '✗ ' + err.message);
    });
  }

  $('modalClose').addEventListener('click', () => $('partnerModal').classList.add('hidden'));
  $('modalBackdrop').addEventListener('click', () => $('partnerModal').classList.add('hidden'));

  loadDashboard();

})();
