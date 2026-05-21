// ====================================================================
// master.js v10 — Master Dashboard Logic
// ====================================================================

(function () {
  'use strict';

  // ── Session check ────────────────────────────────────────────────
  const peUser = JSON.parse(sessionStorage.getItem('peUser') || 'null');
  if (!peUser || peUser.role !== 'MASTER') {
    location.href = 'index.html';
    return;
  }

  // ── Helpers ──────────────────────────────────────────────────────
  const $ = id => document.getElementById(id);
  const fmtINR = n => {
    n = Number(n) || 0;
    if (n >= 1e7) return '₹' + (n / 1e7).toFixed(2) + ' Cr';
    if (n >= 1e5) return '₹' + (n / 1e5).toFixed(2) + ' L';
    if (n >= 1e3) return '₹' + (n / 1e3).toFixed(1) + 'K';
    return '₹' + Math.round(n).toLocaleString('en-IN');
  };
  const fmtN = n => Number(n || 0).toLocaleString('en-IN');
  const safe = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const statusBadge = s => {
    const m = {'Active':'green','Inactive':'red','New':'blue','Dormant':'yellow'};
    return `<span class="badge badge-${m[s]||'gray'}">${safe(s)}</span>`;
  };
  const achColor = v => v >= 100 ? '#16a34a' : v >= 75 ? '#f59e0b' : '#ef4444';
  const achClass = v => v >= 100 ? 'ach-color' : v >= 75 ? 'ach-mid' : 'ach-low';

  // ── Header ───────────────────────────────────────────────────────
  $('headerName').textContent = peUser.name || peUser.gid;
  $('btnLogout').addEventListener('click', () => {
    sessionStorage.removeItem('peUser');
    location.href = 'index.html';
  });

  // ── Status ───────────────────────────────────────────────────────
  function setStatus(msg, kind) {
    const bar = $('statusBar');
    bar.textContent = msg || '';
    bar.className = 'status-bar' + (kind ? ' ' + kind : '') + (!msg ? ' hidden' : '');
  }

  // ── Tabs ─────────────────────────────────────────────────────────
  document.querySelectorAll('.master-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.master-tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.master-content').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      $('mc-' + btn.dataset.tab).classList.add('active');
    });
  });

  // ── Data ─────────────────────────────────────────────────────────
  let allPartners = [];
  let masterFiltered = [];
  let charts = {};

  // ── Load ─────────────────────────────────────────────────────────
  function load() {
    setStatus('Loading master data…', 'loading');
    fetch(API_URL + '?action=getMaster&gid=' + encodeURIComponent(peUser.gid))
      .then(r => r.json())
      .then(res => {
        $('loader').style.display = 'none';
        if (!res.success) { setStatus(res.message || 'Failed to load.', 'error'); return; }
        setStatus('', '');
        allPartners = res.partners || [];
        renderOverall();
        renderZones();
        buildMasterFilters();
        applyMasterFilter();
        renderAM();
        renderTeam();
        renderTracker();
        renderCharts();
      })
      .catch(e => {
        $('loader').style.display = 'none';
        setStatus('Connection error: ' + e.message, 'error');
      });
  }

  // ── Overall Banner ────────────────────────────────────────────────
  function renderOverall() {
    const total = allPartners.length;
    const active = allPartners.filter(p => (p.status || '').toLowerCase() === 'active').length;
    const ftd = allPartners.reduce((s, p) => s + (Number(p.ftd||0) || 0), 0);
    const mtd = allPartners.reduce((s, p) => s + (Number(p.currentMonth||p.mtd||0) || 0), 0);
    const lmtd = allPartners.reduce((s, p) => s + (Number(p.prevMonth||p.lmtd||0) || 0), 0);
    const target = allPartners.reduce((s, p) => s + (Number(p.target||0) || 0), 0);
    const calls = allPartners.reduce((s, p) => s + (Number(p.calls||0) || 0), 0);
    const visits = allPartners.reduce((s, p) => s + (Number(p.visits||0) || 0), 0);
    const ach = target > 0 ? (mtd / target * 100).toFixed(1) : '0.0';
    const mom = lmtd > 0 ? ((mtd - lmtd) / lmtd * 100).toFixed(1) : '0.0';

    $('bTotal').textContent = fmtN(total);
    $('bActive').textContent = fmtN(active);
    $('bFtd').textContent = fmtINR(ftd);
    $('bMtd').textContent = fmtINR(mtd);
    $('bLmtd').textContent = fmtINR(lmtd);
    $('bTarget').textContent = fmtINR(target);
    $('bAch').textContent = ach + '%';
    $('bMom').textContent = (Number(mom) >= 0 ? '+' : '') + mom + '%';
    $('bCalls').textContent = fmtN(calls);
    $('bVisits').textContent = fmtN(visits);
  }

  // ── Zone Overview ─────────────────────────────────────────────────
  function renderZones() {
    const byZone = {};
    allPartners.forEach(p => {
      const z = p.zone || 'Unknown';
      if (!byZone[z]) byZone[z] = { zone: z, total: 0, active: 0, ftd: 0, mtd: 0, lmtd: 0, target: 0, calls: 0, visits: 0, partners: [] };
      byZone[z].total++;
      if ((p.status || '').toLowerCase() === 'active') byZone[z].active++;
      byZone[z].ftd += Number(p.ftd||0) || 0;
      byZone[z].mtd += Number(p.currentMonth||p.mtd||0) || 0;
      byZone[z].lmtd += Number(p.prevMonth||p.lmtd||0) || 0;
      byZone[z].target += Number(p.target||0) || 0;
      byZone[z].calls += Number(p.calls||0) || 0;
      byZone[z].visits += Number(p.visits||0) || 0;
      byZone[z].partners.push(p);
    });

    const zones = Object.values(byZone).sort((a, b) => b.mtd - a.mtd);
    if (!zones.length) {
      $('zoneGrid').innerHTML = '<div class="empty-state"><div class="empty-state-icon">📍</div><div class="empty-state-msg">No zone data</div></div>';
      return;
    }

    $('zoneGrid').innerHTML = zones.map(z => {
      const ach = z.target > 0 ? (z.mtd / z.target * 100).toFixed(1) : 0;
      const mom = z.lmtd > 0 ? ((z.mtd - z.lmtd) / z.lmtd * 100).toFixed(1) : 0;
      const barW = Math.min(Number(ach), 100);
      const col = achColor(Number(ach));
      return `
        <div class="z-card" data-zone="${safe(z.zone)}">
          <div class="z-row">
            <div class="z-name">${safe(z.zone)}</div>
            <div class="z-ach ${achClass(Number(ach))}">${ach}%</div>
          </div>
          <div class="z-row">
            <span style="font-size:12px;color:#64748b">MTD: <strong>${fmtINR(z.mtd)}</strong></span>
            <span style="font-size:12px;color:#64748b">Target: <strong>${fmtINR(z.target)}</strong></span>
          </div>
          <div class="z-bar"><div class="z-bar-fill" style="width:${barW}%;background:${col}"></div></div>
          <div class="z-stats">
            <div><div class="z-stat-label">Partners</div><div class="z-stat-val">${z.total}</div></div>
            <div><div class="z-stat-label">Active</div><div class="z-stat-val kpi-pos">${z.active}</div></div>
            <div><div class="z-stat-label">FTD</div><div class="z-stat-val">${fmtINR(z.ftd)}</div></div>
            <div><div class="z-stat-label">LMTD</div><div class="z-stat-val">${fmtINR(z.lmtd)}</div></div>
            <div><div class="z-stat-label">MoM%</div><div class="z-stat-val ${Number(mom) >= 0 ? 'kpi-pos' : 'kpi-neg'}">${mom}%</div></div>
            <div><div class="z-stat-label">Calls/Visits</div><div class="z-stat-val">${fmtN(z.calls)}/${fmtN(z.visits)}</div></div>
          </div>
        </div>`;
    }).join('');

    document.querySelectorAll('.z-card').forEach(card => {
      card.addEventListener('click', () => openZoneModal(byZone[card.dataset.zone]));
    });
  }

  // ── Zone Modal ────────────────────────────────────────────────────
  function openZoneModal(z) {
    $('zoneModalTitle').textContent = z.zone + ' — Zone Details';
    const rows = z.partners.sort((a, b) => (Number(b.mtd) || 0) - (Number(a.mtd) || 0));
    const ach = z.target > 0 ? (z.mtd / z.target * 100).toFixed(1) : '0.0';
    $('zoneModalBody').innerHTML = `
      <div class="modal-kpi-grid" style="margin-bottom:18px">
        <div class="modal-kpi"><div class="modal-kpi-label">Total Partners</div><div class="modal-kpi-val">${z.total}</div></div>
        <div class="modal-kpi"><div class="modal-kpi-label">Active</div><div class="modal-kpi-val kpi-pos">${z.active}</div></div>
        <div class="modal-kpi"><div class="modal-kpi-label">MTD</div><div class="modal-kpi-val">${fmtINR(z.mtd)}</div></div>
        <div class="modal-kpi"><div class="modal-kpi-label">Target</div><div class="modal-kpi-val">${fmtINR(z.target)}</div></div>
        <div class="modal-kpi"><div class="modal-kpi-label">Achievement</div><div class="modal-kpi-val ${achClass(Number(ach))}">${ach}%</div></div>
        <div class="modal-kpi"><div class="modal-kpi-label">Calls / Visits</div><div class="modal-kpi-val">${fmtN(z.calls)} / ${fmtN(z.visits)}</div></div>
      </div>
      <div class="table-wrap">
        <table class="data-table" style="min-width:700px">
          <thead><tr><th>#</th><th>Partner</th><th>State</th><th>Owner</th><th>Status</th><th class="num-col">MTD</th><th class="num-col">Target</th><th class="num-col">Ach%</th></tr></thead>
          <tbody>${rows.map((p, i) => {
            const pa = Number(p.target||0) > 0 ? (Number(p.currentMonth||p.mtd||0) / Number(p.target||0) * 100).toFixed(1) : '0.0';
            return `<tr>
              <td>${i + 1}</td><td><strong>${safe(p.name)}</strong></td><td>${safe(p.state)}</td>
              <td>${safe(p.ownerName)}</td><td>${statusBadge(p.status)}</td>
              <td class="num-col">${fmtINR(p.mtd)}</td><td class="num-col">${fmtINR(p.target)}</td>
              <td class="num-col ${achClass(Number(pa))}">${pa}%</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>`;
    $('zoneModal').style.display = 'flex';
  }
  $('zoneModalClose').addEventListener('click', () => $('zoneModal').style.display = 'none');
  $('zoneModal').addEventListener('click', e => { if (e.target === $('zoneModal')) $('zoneModal').style.display = 'none'; });

  // ── All Partners (Master) ─────────────────────────────────────────
  function buildMasterFilters() {
    const zones = [...new Set(allPartners.map(p => p.zone).filter(Boolean))].sort();
    const states = [...new Set(allPartners.map(p => p.state).filter(Boolean))].sort();
    const roles = [...new Set(allPartners.map(p => p.ownerRole).filter(Boolean))].sort();
    populateSel($('mZone'), zones, 'All Zones');
    populateSel($('mState'), states, 'All States');
    populateSel($('mRole'), roles, 'All Roles');
  }
  function populateSel(sel, vals, label) {
    sel.innerHTML = `<option value="">${label}</option>` + vals.map(v => `<option value="${safe(v)}">${safe(v)}</option>`).join('');
  }
  ['mSearch','mZone','mState','mRole'].forEach(id => {
    $(id).addEventListener('input', applyMasterFilter);
    $(id).addEventListener('change', applyMasterFilter);
  });
  $('mClear').addEventListener('click', () => {
    $('mSearch').value = ''; $('mZone').value = ''; $('mState').value = ''; $('mRole').value = '';
    applyMasterFilter();
  });

  function applyMasterFilter() {
    const q = ($('mSearch').value || '').toLowerCase();
    const zone = $('mZone').value;
    const state = $('mState').value;
    const role = $('mRole').value;
    masterFiltered = allPartners.filter(p => {
      if (q && !(p.name || '').toLowerCase().includes(q)) return false;
      if (zone && p.zone !== zone) return false;
      if (state && p.state !== state) return false;
      if (role && p.ownerRole !== role) return false;
      return true;
    });
    renderMasterTable();
  }

  function renderMasterTable() {
    $('mCount').textContent = `Showing ${masterFiltered.length} of ${allPartners.length} partners`;
    $('masterBody').innerHTML = masterFiltered.map((p, i) => {
      const ach = Number(p.target||0) > 0 ? (Number(p.currentMonth||p.mtd||0) / Number(p.target||0) * 100).toFixed(1) : '0.0';
      const mom = Number(p.prevMonth||p.lmtd||0) > 0 ? ((Number(p.currentMonth||p.mtd||0) - Number(p.prevMonth||p.lmtd||0)) / Number(p.prevMonth||p.lmtd||0) * 100).toFixed(1) : '0.0';
      return `<tr>
        <td>${i + 1}</td>
        <td><strong>${safe(p.name)}</strong></td>
        <td>${safe(p.zone)}</td><td>${safe(p.state)}</td><td>${safe(p.city)}</td>
        <td><span class="badge badge-gray">${safe(p.ownerRole)}</span></td>
        <td>${safe(p.ownerName)}</td>
        <td>${statusBadge(p.status)}</td>
        <td>${statusBadge(p.uniqueStatus)}</td>
        <td class="num-col">${fmtINR(p.ftd)}</td>
        <td class="num-col">${fmtINR(p.mtd)}</td>
        <td class="num-col">${fmtINR(p.lmtd)}</td>
        <td class="num-col ${Number(mom) >= 0 ? 'kpi-pos' : 'kpi-neg'}">${mom}%</td>
        <td class="num-col">${fmtINR(p.netCombined)}</td>
        <td class="num-col">${fmtINR(p.target)}</td>
        <td class="num-col ${achClass(Number(ach))}">${ach}%</td>
        <td class="num-col">${fmtN(p.activeMonths)}</td>
        <td class="num-col">${fmtN(p.calls)}</td>
        <td class="num-col">${fmtN(p.visits)}</td>
      </tr>`;
    }).join('');
  }

  // ── AM Performance ────────────────────────────────────────────────
  function renderAM() {
    const byAM = {};
    allPartners.forEach(p => {
      const name = p.ownerName || 'Unknown';
      const role = p.ownerRole || '';
      if (!byAM[name]) byAM[name] = { name, role, zone: p.zone || '', count: 0, active: 0, mtd: 0, lmtd: 0, target: 0, calls: 0, visits: 0 };
      byAM[name].count++;
      if ((p.status || '').toLowerCase() === 'active') byAM[name].active++;
      byAM[name].mtd += Number(p.currentMonth||p.mtd||0) || 0;
      byAM[name].lmtd += Number(p.prevMonth||p.lmtd||0) || 0;
      byAM[name].target += Number(p.target||0) || 0;
      byAM[name].calls += Number(p.calls||0) || 0;
      byAM[name].visits += Number(p.visits||0) || 0;
    });

    const rows = Object.values(byAM).sort((a, b) => b.mtd - a.mtd);
    $('amContent').innerHTML = `
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>#</th><th>Name</th><th>Role</th><th>Zone</th><th class="num-col">Partners</th><th class="num-col">Active</th><th class="num-col">MTD</th><th class="num-col">LMTD</th><th class="num-col">MoM%</th><th class="num-col">Target</th><th class="num-col">Ach%</th><th class="num-col">Calls</th><th class="num-col">Visits</th></tr></thead>
          <tbody>${rows.map((r, i) => {
            const mom = r.lmtd > 0 ? ((r.mtd - r.lmtd) / r.lmtd * 100).toFixed(1) : '0.0';
            const ach = r.target > 0 ? (r.mtd / r.target * 100).toFixed(1) : '0.0';
            return `<tr>
              <td>${i + 1}</td><td><strong>${safe(r.name)}</strong></td>
              <td><span class="badge badge-gray">${safe(r.role)}</span></td>
              <td>${safe(r.zone)}</td>
              <td class="num-col">${r.count}</td><td class="num-col kpi-pos">${r.active}</td>
              <td class="num-col">${fmtINR(r.mtd)}</td><td class="num-col">${fmtINR(r.lmtd)}</td>
              <td class="num-col ${Number(mom) >= 0 ? 'kpi-pos' : 'kpi-neg'}">${mom}%</td>
              <td class="num-col">${fmtINR(r.target)}</td>
              <td class="num-col ${achClass(Number(ach))}">${ach}%</td>
              <td class="num-col">${fmtN(r.calls)}</td><td class="num-col">${fmtN(r.visits)}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>`;
  }

  // ── Team Breakdown ────────────────────────────────────────────────
  function renderTeam() {
    const byZoneRole = {};
    allPartners.forEach(p => {
      const key = (p.zone || 'Unknown') + '||' + (p.ownerRole || 'Unknown');
      if (!byZoneRole[key]) byZoneRole[key] = { zone: p.zone || 'Unknown', role: p.ownerRole || 'Unknown', count: 0, mtd: 0, target: 0 };
      byZoneRole[key].count++;
      byZoneRole[key].mtd += Number(p.currentMonth||p.mtd||0) || 0;
      byZoneRole[key].target += Number(p.target||0) || 0;
    });

    const rows = Object.values(byZoneRole).sort((a, b) => a.zone.localeCompare(b.zone) || b.mtd - a.mtd);
    $('teamContent').innerHTML = `
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Zone</th><th>Owner Role</th><th class="num-col">Partners</th><th class="num-col">MTD</th><th class="num-col">Target</th><th class="num-col">Achievement</th></tr></thead>
          <tbody>${rows.map(r => {
            const ach = r.target > 0 ? (r.mtd / r.target * 100).toFixed(1) : '0.0';
            return `<tr>
              <td>${safe(r.zone)}</td><td><span class="badge badge-gray">${safe(r.role)}</span></td>
              <td class="num-col">${r.count}</td>
              <td class="num-col">${fmtINR(r.mtd)}</td><td class="num-col">${fmtINR(r.target)}</td>
              <td class="num-col ${achClass(Number(ach))}">${ach}%</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>`;
  }

  // ── Call & Visit Tracker ──────────────────────────────────────────
  function renderTracker() {
    const totalCalls = allPartners.reduce((s, p) => s + (Number(p.calls||0) || 0), 0);
    const totalVisits = allPartners.reduce((s, p) => s + (Number(p.visits||0) || 0), 0);
    $('trackerGrid').innerHTML = `
      <div class="tracker-card"><div class="tracker-label">Total Calls</div><div class="tracker-val">${fmtN(totalCalls)}</div></div>
      <div class="tracker-card"><div class="tracker-label">Total Visits</div><div class="tracker-val">${fmtN(totalVisits)}</div></div>
      <div class="tracker-card"><div class="tracker-label">Avg Calls/Partner</div><div class="tracker-val">${allPartners.length ? (totalCalls / allPartners.length).toFixed(1) : 0}</div></div>
      <div class="tracker-card"><div class="tracker-label">Avg Visits/Partner</div><div class="tracker-val">${allPartners.length ? (totalVisits / allPartners.length).toFixed(1) : 0}</div></div>
    `;

    const byOwner = {};
    allPartners.forEach(p => {
      const name = p.ownerName || 'Unknown';
      if (!byOwner[name]) byOwner[name] = { name, role: p.ownerRole || '', zone: p.zone || '', count: 0, calls: 0, visits: 0 };
      byOwner[name].count++;
      byOwner[name].calls += Number(p.calls||0) || 0;
      byOwner[name].visits += Number(p.visits||0) || 0;
    });

    const rows = Object.values(byOwner).sort((a, b) => b.calls - a.calls);
    $('trackerBody').innerHTML = rows.map((r, i) => `
      <tr>
        <td>${i + 1}</td><td><strong>${safe(r.name)}</strong></td>
        <td><span class="badge badge-gray">${safe(r.role)}</span></td>
        <td>${safe(r.zone)}</td>
        <td class="num-col">${r.count}</td>
        <td class="num-col">${fmtN(r.calls)}</td>
        <td class="num-col">${fmtN(r.visits)}</td>
        <td class="num-col">${r.count > 0 ? (r.calls / r.count).toFixed(1) : '0.0'}</td>
      </tr>`).join('');
  }

  // ── Charts ────────────────────────────────────────────────────────
  function renderCharts() {
    const byZone = {};
    allPartners.forEach(p => {
      const z = p.zone || 'Unknown';
      if (!byZone[z]) byZone[z] = { mtd: 0, target: 0 };
      byZone[z].mtd += Number(p.currentMonth||p.mtd||0) || 0;
      byZone[z].target += Number(p.target||0) || 0;
    });
    const zoneLabels = Object.keys(byZone).sort();
    const zoneMtd = zoneLabels.map(z => byZone[z].mtd);
    const zoneAch = zoneLabels.map(z => byZone[z].target > 0 ? +(byZone[z].mtd / byZone[z].target * 100).toFixed(1) : 0);

    const statusCount = {};
    allPartners.forEach(p => { const s = p.status || 'Unknown'; statusCount[s] = (statusCount[s] || 0) + 1; });

    const byAM = {};
    allPartners.forEach(p => {
      if (p.ownerRole !== 'AM') return;
      const n = p.ownerName || 'Unknown';
      if (!byAM[n]) byAM[n] = 0;
      byAM[n] += Number(p.currentMonth||p.mtd||0) || 0;
    });
    const topAMs = Object.entries(byAM).sort((a, b) => b[1] - a[1]).slice(0, 10);

    drawBar('chartZone', zoneLabels, zoneMtd, 'MTD Business', '#3b82f6');
    drawBar('chartAch', zoneLabels, zoneAch, 'Achievement %', '#16a34a');
    drawDoughnut('chartStatus', Object.keys(statusCount), Object.values(statusCount));
    drawBar('chartAM', topAMs.map(a => a[0]), topAMs.map(a => a[1]), 'MTD', '#f97316');
  }

  function drawBar(id, labels, data, label, color) {
    const ctx = $(id);
    if (!ctx) return;
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets: [{ label, data, backgroundColor: color + 'cc', borderColor: color, borderWidth: 1, borderRadius: 6 }] },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: '#f1f5f9' } }, x: { grid: { display: false } } } }
    });
  }

  function drawDoughnut(id, labels, data) {
    const ctx = $(id);
    if (!ctx) return;
    if (charts[id]) charts[id].destroy();
    const colors = ['#16a34a','#ef4444','#3b82f6','#f59e0b','#94a3b8'];
    charts[id] = new Chart(ctx, {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 2, borderColor: '#fff' }] },
      options: { responsive: true, plugins: { legend: { position: 'right' } } }
    });
  }

  // ── Start ────────────────────────────────────────────────────────
  load();

})();
