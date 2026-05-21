// ====================================================================
// app.js v10 — Partner Engage Dashboard Logic
// ====================================================================

(function () {
  'use strict';

  // ── Session check ────────────────────────────────────────────────
  const peUser = JSON.parse(sessionStorage.getItem('peUser') || 'null');
  if (!peUser) { location.href = 'index.html'; return; }

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
    const cls = m[s] || 'gray';
    return `<span class="badge badge-${cls}">${safe(s)}</span>`;
  };

  // ── Header ───────────────────────────────────────────────────────
  $('headerName').textContent = peUser.name || peUser.gid;
  $('headerRole').textContent = peUser.role || '';
  $('btnLogout').addEventListener('click', () => {
    sessionStorage.removeItem('peUser');
    location.href = 'index.html';
  });

  // ── Status bar ───────────────────────────────────────────────────
  function setStatus(msg, kind) {
    const bar = $('statusBar');
    bar.textContent = msg || '';
    bar.className = 'status-bar' + (kind ? ' ' + kind : '') + (!msg ? ' hidden' : '');
  }

  // ── Tabs ─────────────────────────────────────────────────────────
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      $('tab-' + btn.dataset.tab).classList.add('active');
    });
  });

  // ── Data state ───────────────────────────────────────────────────
  let allPartners = [];
  let filtered = [];

  // ── Load data ────────────────────────────────────────────────────
  function load() {
    setStatus('Loading data…', 'loading');
    fetch(API_URL + '?action=getPartners&gid=' + encodeURIComponent(peUser.gid))
      .then(r => r.json())
      .then(res => {
        $('loader').style.display = 'none';
        if (!res.success) { setStatus(res.message || 'Failed to load data.', 'error'); return; }
        setStatus('', '');
        allPartners = res.partners || [];
        buildFilters();
        applyFilters();
        renderKPIs(allPartners, 'kpiGrid');
        renderMyPartners();
        renderTeam();
        renderAM();
      })
      .catch(e => {
        $('loader').style.display = 'none';
        setStatus('Connection error: ' + e.message, 'error');
      });
  }

  // ── Build filter dropdowns ────────────────────────────────────────
  function buildFilters() {
    const zones = [...new Set(allPartners.map(p => p.zone).filter(Boolean))].sort();
    const states = [...new Set(allPartners.map(p => p.state).filter(Boolean))].sort();
    const owners = [...new Set(allPartners.map(p => p.ownerName).filter(Boolean))].sort();

    populateSelect($('filterZone'), zones, 'All Zones');
    populateSelect($('filterState'), states, 'All States');
    populateSelect($('filterOwner'), owners, 'All Owners');
  }
  function populateSelect(sel, vals, allLabel) {
    sel.innerHTML = `<option value="">${allLabel}</option>` + vals.map(v => `<option value="${safe(v)}">${safe(v)}</option>`).join('');
  }

  // ── Filter listeners ──────────────────────────────────────────────
  ['searchInput','filterZone','filterState','filterOwner'].forEach(id => {
    $(id).addEventListener('input', applyFilters);
    $(id).addEventListener('change', applyFilters);
  });
  $('btnClear').addEventListener('click', () => {
    $('searchInput').value = '';
    $('filterZone').value = '';
    $('filterState').value = '';
    $('filterOwner').value = '';
    applyFilters();
  });

  function applyFilters() {
    const q = ($('searchInput').value || '').toLowerCase();
    const zone = $('filterZone').value;
    const state = $('filterState').value;
    const owner = $('filterOwner').value;

    filtered = allPartners.filter(p => {
      if (q && !((p.name || '').toLowerCase().includes(q) || (p.gcd || '').toLowerCase().includes(q))) return false;
      if (zone && p.zone !== zone) return false;
      if (state && p.state !== state) return false;
      if (owner && p.ownerName !== owner) return false;
      return true;
    });

    renderTable(filtered);
    renderKPIs(filtered, 'kpiGrid');
  }

  // ── Render table ──────────────────────────────────────────────────
  function renderTable(rows) {
    const tbody = $('partnerBody');
    if (!rows.length) {
      tbody.innerHTML = '';
      $('tableEmpty').style.display = 'block';
      $('tableCount').textContent = '';
      return;
    }
    $('tableEmpty').style.display = 'none';
    $('tableCount').textContent = `Showing ${rows.length} of ${allPartners.length} partners`;

    tbody.innerHTML = rows.map((p, i) => `
      <tr style="cursor:pointer" data-idx="${allPartners.indexOf(p)}">
        <td>${i + 1}</td>
        <td><strong>${safe(p.name)}</strong>${p.gcd ? `<br><small style="color:#94a3b8">${safe(p.gcd)}</small>` : ''}</td>
        <td>${safe(p.zone)}</td>
        <td>${safe(p.state)}</td>
        <td>${safe(p.city)}</td>
        <td><span class="badge badge-gray">${safe(p.ownerRole)}</span></td>
        <td>${safe(p.ownerName)}</td>
        <td>${statusBadge(p.status)}</td>
        <td>${statusBadge(p.uniqueStatus)}</td>
        <td class="num-col">${fmtINR(p.ftd)}</td>
        <td class="num-col">${fmtINR(p.mtd)}</td>
        <td class="num-col">${fmtINR(p.lmtd)}</td>
        <td class="num-col ${Number(p.mom) >= 0 ? 'kpi-pos' : 'kpi-neg'}">${Number(p.mom || 0).toFixed(1)}%</td>
        <td class="num-col">${fmtINR(p.netCombined)}</td>
        <td class="num-col">${fmtINR(p.target)}</td>
        <td class="num-col ${Number(p.ach) >= 100 ? 'kpi-pos' : ''}">${Number(p.ach || 0).toFixed(1)}%</td>
        <td class="num-col">${fmtN(p.activeMonths)}</td>
        <td class="num-col">${fmtINR(p.activeBiz)}</td>
        <td class="num-col">${fmtN(p.calls)}</td>
        <td class="num-col">${fmtN(p.visits)}</td>
      </tr>
    `).join('');

    tbody.querySelectorAll('tr').forEach(tr => {
      tr.addEventListener('click', () => openModal(allPartners[+tr.dataset.idx]));
    });
  }

  // ── KPI cards ─────────────────────────────────────────────────────
  function renderKPIs(rows, gridId) {
    const total = rows.length;
    const active = rows.filter(p => (p.status || '').toLowerCase() === 'active').length;
    const ftd = rows.reduce((s, p) => s + (Number(p.ftd) || 0), 0);
    const mtd = rows.reduce((s, p) => s + (Number(p.mtd) || 0), 0);
    const lmtd = rows.reduce((s, p) => s + (Number(p.lmtd) || 0), 0);
    const target = rows.reduce((s, p) => s + (Number(p.target) || 0), 0);
    const ach = target > 0 ? (mtd / target * 100).toFixed(1) : '0.0';
    const mom = lmtd > 0 ? ((mtd - lmtd) / lmtd * 100).toFixed(1) : '0.0';

    $(gridId).innerHTML = `
      <div class="kpi-card"><div class="kpi-label">Total Partners</div><div class="kpi-value">${total}</div></div>
      <div class="kpi-card"><div class="kpi-label">Active</div><div class="kpi-value kpi-pos">${active}</div></div>
      <div class="kpi-card"><div class="kpi-label">FTD Business</div><div class="kpi-value">${fmtINR(ftd)}</div></div>
      <div class="kpi-card"><div class="kpi-label">MTD Business</div><div class="kpi-value">${fmtINR(mtd)}</div></div>
      <div class="kpi-card"><div class="kpi-label">LMTD Business</div><div class="kpi-value">${fmtINR(lmtd)}</div></div>
      <div class="kpi-card"><div class="kpi-label">Target (May)</div><div class="kpi-value">${fmtINR(target)}</div></div>
      <div class="kpi-card"><div class="kpi-label">Achievement</div><div class="kpi-value ${Number(ach) >= 100 ? 'kpi-pos' : ''}">${ach}%</div></div>
      <div class="kpi-card"><div class="kpi-label">MoM%</div><div class="kpi-value ${Number(mom) >= 0 ? 'kpi-pos' : 'kpi-neg'}">${mom}%</div></div>
    `;
  }

  // ── My Partners tab ───────────────────────────────────────────────
  function renderMyPartners() {
    const mine = allPartners.filter(p =>
      (p.ownerName || '').toLowerCase().includes((peUser.name || '').toLowerCase()) ||
      (p.ownerGid || '') === peUser.gid
    );

    renderKPIs(mine, 'myKpiGrid');

    const tbody = $('myBody');
    if (!mine.length) {
      tbody.innerHTML = `<tr><td colspan="13"><div class="empty-state"><div class="empty-state-icon">📋</div><div class="empty-state-msg">No partners assigned to you</div></div></td></tr>`;
      return;
    }
    tbody.innerHTML = mine.map((p, i) => `
      <tr>
        <td>${i + 1}</td>
        <td><strong>${safe(p.name)}</strong></td>
        <td>${safe(p.zone)}</td>
        <td>${safe(p.state)}</td>
        <td>${safe(p.city)}</td>
        <td class="num-col">${fmtINR(p.ftd)}</td>
        <td class="num-col">${fmtINR(p.mtd)}</td>
        <td class="num-col">${fmtINR(p.lmtd)}</td>
        <td class="num-col ${Number(p.mom) >= 0 ? 'kpi-pos' : 'kpi-neg'}">${Number(p.mom || 0).toFixed(1)}%</td>
        <td class="num-col">${fmtINR(p.target)}</td>
        <td class="num-col">${Number(p.ach || 0).toFixed(1)}%</td>
        <td class="num-col">${fmtN(p.calls)}</td>
        <td class="num-col">${fmtN(p.visits)}</td>
      </tr>
    `).join('');
  }

  // ── Team Breakdown tab ────────────────────────────────────────────
  function renderTeam() {
    const byRole = {};
    allPartners.forEach(p => {
      const r = p.ownerRole || 'Unknown';
      if (!byRole[r]) byRole[r] = { role: r, count: 0, mtd: 0, target: 0 };
      byRole[r].count++;
      byRole[r].mtd += Number(p.mtd) || 0;
      byRole[r].target += Number(p.target) || 0;
    });
    const rows = Object.values(byRole).sort((a, b) => b.mtd - a.mtd);

    $('teamContent').innerHTML = `
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Owner Role</th><th class="num-col">Partners</th><th class="num-col">MTD Business</th><th class="num-col">Target</th><th class="num-col">Achievement</th></tr></thead>
          <tbody>${rows.map(r => {
            const ach = r.target > 0 ? (r.mtd / r.target * 100).toFixed(1) : '0.0';
            return `<tr>
              <td><span class="badge badge-gray">${safe(r.role)}</span></td>
              <td class="num-col">${r.count}</td>
              <td class="num-col">${fmtINR(r.mtd)}</td>
              <td class="num-col">${fmtINR(r.target)}</td>
              <td class="num-col ${Number(ach) >= 100 ? 'kpi-pos' : ''}">${ach}%</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>`;
  }

  // ── AM Performance tab ────────────────────────────────────────────
  function renderAM() {
    const byAM = {};
    allPartners.forEach(p => {
      if ((p.ownerRole || '') !== 'AM') return;
      const name = p.ownerName || 'Unknown';
      if (!byAM[name]) byAM[name] = { name, partners: 0, active: 0, mtd: 0, lmtd: 0, target: 0, calls: 0, visits: 0 };
      byAM[name].partners++;
      if ((p.status || '').toLowerCase() === 'active') byAM[name].active++;
      byAM[name].mtd += Number(p.mtd) || 0;
      byAM[name].lmtd += Number(p.lmtd) || 0;
      byAM[name].target += Number(p.target) || 0;
      byAM[name].calls += Number(p.calls) || 0;
      byAM[name].visits += Number(p.visits) || 0;
    });

    const rows = Object.values(byAM).sort((a, b) => b.mtd - a.mtd);
    if (!rows.length) {
      $('amContent').innerHTML = `<div class="empty-state"><div class="empty-state-icon">📊</div><div class="empty-state-msg">No AM data available</div></div>`;
      return;
    }

    $('amContent').innerHTML = `
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>#</th><th>AM Name</th><th class="num-col">Partners</th><th class="num-col">Active</th><th class="num-col">MTD</th><th class="num-col">LMTD</th><th class="num-col">MoM%</th><th class="num-col">Target</th><th class="num-col">Ach%</th><th class="num-col">Calls</th><th class="num-col">Visits</th></tr></thead>
          <tbody>${rows.map((r, i) => {
            const mom = r.lmtd > 0 ? ((r.mtd - r.lmtd) / r.lmtd * 100).toFixed(1) : '0.0';
            const ach = r.target > 0 ? (r.mtd / r.target * 100).toFixed(1) : '0.0';
            return `<tr>
              <td>${i + 1}</td>
              <td><strong>${safe(r.name)}</strong></td>
              <td class="num-col">${r.partners}</td>
              <td class="num-col kpi-pos">${r.active}</td>
              <td class="num-col">${fmtINR(r.mtd)}</td>
              <td class="num-col">${fmtINR(r.lmtd)}</td>
              <td class="num-col ${Number(mom) >= 0 ? 'kpi-pos' : 'kpi-neg'}">${mom}%</td>
              <td class="num-col">${fmtINR(r.target)}</td>
              <td class="num-col ${Number(ach) >= 100 ? 'kpi-pos' : ''}">${ach}%</td>
              <td class="num-col">${fmtN(r.calls)}</td>
              <td class="num-col">${fmtN(r.visits)}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>`;
  }

  // ── Modal ─────────────────────────────────────────────────────────
  function openModal(p) {
    if (!p) return;
    $('modalTitle').textContent = p.name || 'Partner Details';
    const mom = Number(p.lmtd) > 0 ? ((Number(p.mtd) - Number(p.lmtd)) / Number(p.lmtd) * 100).toFixed(1) : '0.0';
    $('modalBody').innerHTML = `
      <div class="modal-section">
        <div class="modal-section-title">Partner Info</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px">
          <div><span style="color:#94a3b8">Zone:</span> <strong>${safe(p.zone)}</strong></div>
          <div><span style="color:#94a3b8">State:</span> <strong>${safe(p.state)}</strong></div>
          <div><span style="color:#94a3b8">City:</span> <strong>${safe(p.city)}</strong></div>
          <div><span style="color:#94a3b8">GCD:</span> <strong>${safe(p.gcd)}</strong></div>
          <div><span style="color:#94a3b8">Status:</span> ${statusBadge(p.status)}</div>
          <div><span style="color:#94a3b8">Unique:</span> ${statusBadge(p.uniqueStatus)}</div>
          <div><span style="color:#94a3b8">Owner:</span> <strong>${safe(p.ownerName)} (${safe(p.ownerRole)})</strong></div>
          <div><span style="color:#94a3b8">Active Months:</span> <strong>${fmtN(p.activeMonths)}</strong></div>
        </div>
      </div>
      <div class="modal-section">
        <div class="modal-section-title">Business Performance</div>
        <div class="modal-kpi-grid">
          <div class="modal-kpi"><div class="modal-kpi-label">FTD</div><div class="modal-kpi-val">${fmtINR(p.ftd)}</div></div>
          <div class="modal-kpi"><div class="modal-kpi-label">MTD</div><div class="modal-kpi-val">${fmtINR(p.mtd)}</div></div>
          <div class="modal-kpi"><div class="modal-kpi-label">LMTD</div><div class="modal-kpi-val">${fmtINR(p.lmtd)}</div></div>
          <div class="modal-kpi"><div class="modal-kpi-label">MoM%</div><div class="modal-kpi-val ${Number(mom) >= 0 ? 'kpi-pos' : 'kpi-neg'}">${mom}%</div></div>
          <div class="modal-kpi"><div class="modal-kpi-label">Net Combined</div><div class="modal-kpi-val">${fmtINR(p.netCombined)}</div></div>
          <div class="modal-kpi"><div class="modal-kpi-label">Active Business</div><div class="modal-kpi-val">${fmtINR(p.activeBiz)}</div></div>
          <div class="modal-kpi"><div class="modal-kpi-label">Target</div><div class="modal-kpi-val">${fmtINR(p.target)}</div></div>
          <div class="modal-kpi"><div class="modal-kpi-label">Achievement</div><div class="modal-kpi-val ${Number(p.ach) >= 100 ? 'kpi-pos' : ''}">${Number(p.ach || 0).toFixed(1)}%</div></div>
          <div class="modal-kpi"><div class="modal-kpi-label">Calls / Visits</div><div class="modal-kpi-val">${fmtN(p.calls)} / ${fmtN(p.visits)}</div></div>
        </div>
      </div>
    `;
    $('modal').style.display = 'flex';
  }
  $('modalClose').addEventListener('click', () => $('modal').style.display = 'none');
  $('modal').addEventListener('click', e => { if (e.target === $('modal')) $('modal').style.display = 'none'; });

  // ── Start ────────────────────────────────────────────────────────
  load();

})();
