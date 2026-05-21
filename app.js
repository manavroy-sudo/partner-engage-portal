// ====================================================================
// app.js v10 — Partner Engage Dashboard Logic
// Field names matched to Code.gs buildPartnerObj output
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

  // Field accessors matching Code.gs buildPartnerObj
  const mtd  = p => Number(p.currentMonth || p.mtd || 0);
  const lmtd = p => Number(p.prevMonth    || p.lmtd || 0);
  const ftd  = p => Number(p.ftd || 0);
  const tgt  = p => Number(p.target || 0);
  const net  = p => Number(p.netCombinedPremium || p.netCombined || 0);
  const abiz = p => Number(p.activeMonthsBiz || p.activeBiz || 0);
  const amon = p => Number(p.activeMonthsCount || p.activeMonths || 0);
  const mom  = p => lmtd(p) > 0 ? ((mtd(p) - lmtd(p)) / lmtd(p) * 100) : 0;
  const ach  = p => tgt(p) > 0 ? (mtd(p) / tgt(p) * 100) : 0;
  const statusStr = p => p.status || (p.isActive ? 'Active' : 'Inactive');

  const statusBadge = s => {
    const m = {'Active':'green','Inactive':'red','New':'blue','Dormant':'yellow'};
    return `<span class="badge badge-${m[s]||'gray'}">${safe(s)}</span>`;
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
    fetch(API_URL + '?action=getDashboard&gid=' + encodeURIComponent(peUser.gid))
      .then(r => r.json())
      .then(res => {
        $('loader').style.display = 'none';
        if (!res.success) { setStatus(res.message || 'Failed to load data.', 'error'); return; }
        setStatus('', '');
        allPartners = res.partners || [];
        buildFilters(res.filterOptions);
        applyFilters();
        renderKPIs(allPartners, 'kpiGrid');
        renderMyPartners(res.myPartners);
        renderTeam(res.teamBreakdown);
        renderAM(res.amPerformance);
      })
      .catch(e => {
        $('loader').style.display = 'none';
        setStatus('Connection error: ' + e.message, 'error');
      });
  }

  // ── Build filter dropdowns ────────────────────────────────────────
  function buildFilters(opts) {
    if (opts) {
      populateSelect($('filterZone'),  opts.zones  || [], 'All Zones');
      populateSelect($('filterState'), opts.states || [], 'All States');
      populateSelect($('filterOwner'), opts.owners || [], 'All Owners');
    } else {
      const zones  = [...new Set(allPartners.map(p => p.zone).filter(Boolean))].sort();
      const states = [...new Set(allPartners.map(p => p.state).filter(Boolean))].sort();
      const owners = [...new Set(allPartners.map(p => p.ownerName).filter(Boolean))].sort();
      populateSelect($('filterZone'),  zones,  'All Zones');
      populateSelect($('filterState'), states, 'All States');
      populateSelect($('filterOwner'), owners, 'All Owners');
    }
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
    const q     = ($('searchInput').value || '').toLowerCase();
    const zone  = $('filterZone').value;
    const state = $('filterState').value;
    const owner = $('filterOwner').value;

    filtered = allPartners.filter(p => {
      if (q && !((p.name||'').toLowerCase().includes(q) || (p.empId||p.gcd||'').toLowerCase().includes(q))) return false;
      if (zone  && p.zone      !== zone)  return false;
      if (state && p.state     !== state) return false;
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
    const st = statusStr;

    tbody.innerHTML = rows.map((p, i) => {
      const m = mom(p), a = ach(p);
      return `
      <tr style="cursor:pointer" data-idx="${allPartners.indexOf(p)}">
        <td>${i + 1}</td>
        <td><strong>${safe(p.name)}</strong>${p.empId ? `<br><small style="color:#94a3b8">${safe(p.empId)}</small>` : ''}</td>
        <td>${safe(p.zone)}</td>
        <td>${safe(p.state)}</td>
        <td>${safe(p.city)}</td>
        <td><span class="badge badge-gray">${safe(p.ownerRole)}</span></td>
        <td>${safe(p.ownerName)}</td>
        <td>${statusBadge(st(p))}</td>
        <td>${p.uniqueStatus ? statusBadge(p.uniqueStatus) : '—'}</td>
        <td class="num-col">${fmtINR(ftd(p))}</td>
        <td class="num-col">${fmtINR(mtd(p))}</td>
        <td class="num-col">${fmtINR(lmtd(p))}</td>
        <td class="num-col ${m >= 0 ? 'kpi-pos' : 'kpi-neg'}">${m.toFixed(1)}%</td>
        <td class="num-col">${fmtINR(net(p))}</td>
        <td class="num-col">${fmtINR(tgt(p))}</td>
        <td class="num-col ${a >= 100 ? 'kpi-pos' : ''}">${a.toFixed(1)}%</td>
        <td class="num-col">${fmtN(amon(p))}</td>
        <td class="num-col">${fmtINR(abiz(p))}</td>
        <td class="num-col">${fmtN(p.calls)}</td>
        <td class="num-col">${fmtN(p.visits)}</td>
      </tr>`}).join('');

    tbody.querySelectorAll('tr').forEach(tr => {
      tr.addEventListener('click', () => openModal(allPartners[+tr.dataset.idx]));
    });
  }

  // ── KPI cards ─────────────────────────────────────────────────────
  function renderKPIs(rows, gridId) {
    const total  = rows.length;
    const active = rows.filter(p => p.isActive || (p.status||'').toLowerCase()==='active').length;
    const totFtd = rows.reduce((s,p) => s + ftd(p), 0);
    const totMtd = rows.reduce((s,p) => s + mtd(p), 0);
    const totLmt = rows.reduce((s,p) => s + lmtd(p), 0);
    const totTgt = rows.reduce((s,p) => s + tgt(p), 0);
    const totAch = totTgt > 0 ? (totMtd / totTgt * 100).toFixed(1) : '0.0';
    const totMom = totLmt > 0 ? ((totMtd - totLmt) / totLmt * 100).toFixed(1) : '0.0';

    $(gridId).innerHTML = `
      <div class="kpi-card"><div class="kpi-label">Total Partners</div><div class="kpi-value">${total}</div></div>
      <div class="kpi-card"><div class="kpi-label">Active</div><div class="kpi-value kpi-pos">${active}</div></div>
      <div class="kpi-card"><div class="kpi-label">FTD Business</div><div class="kpi-value">${fmtINR(totFtd)}</div></div>
      <div class="kpi-card"><div class="kpi-label">MTD Business</div><div class="kpi-value">${fmtINR(totMtd)}</div></div>
      <div class="kpi-card"><div class="kpi-label">LMTD Business</div><div class="kpi-value">${fmtINR(totLmt)}</div></div>
      <div class="kpi-card"><div class="kpi-label">Target (May)</div><div class="kpi-value">${fmtINR(totTgt)}</div></div>
      <div class="kpi-card"><div class="kpi-label">Achievement</div><div class="kpi-value ${Number(totAch)>=100?'kpi-pos':''}">${totAch}%</div></div>
      <div class="kpi-card"><div class="kpi-label">MoM%</div><div class="kpi-value ${Number(totMom)>=0?'kpi-pos':'kpi-neg'}">${Number(totMom)>=0?'+':''}${totMom}%</div></div>
    `;
  }

  // ── My Partners tab ───────────────────────────────────────────────
  function renderMyPartners(myParters) {
    const mine = myParters && myParters.length ? myParters :
      allPartners.filter(p => (p.ownerName||'').toLowerCase() === (peUser.name||'').toLowerCase());

    renderKPIs(mine, 'myKpiGrid');
    const tbody = $('myBody');
    if (!mine.length) {
      tbody.innerHTML = `<tr><td colspan="13"><div class="empty-state"><div class="empty-state-icon">📋</div><div class="empty-state-msg">No partners directly assigned to you</div></div></td></tr>`;
      return;
    }
    tbody.innerHTML = mine.map((p, i) => {
      const m = mom(p), a = ach(p);
      return `<tr>
        <td>${i+1}</td><td><strong>${safe(p.name)}</strong></td>
        <td>${safe(p.zone)}</td><td>${safe(p.state)}</td><td>${safe(p.city)}</td>
        <td class="num-col">${fmtINR(ftd(p))}</td>
        <td class="num-col">${fmtINR(mtd(p))}</td>
        <td class="num-col">${fmtINR(lmtd(p))}</td>
        <td class="num-col ${m>=0?'kpi-pos':'kpi-neg'}">${m.toFixed(1)}%</td>
        <td class="num-col">${fmtINR(tgt(p))}</td>
        <td class="num-col ${a>=100?'kpi-pos':''}">${a.toFixed(1)}%</td>
        <td class="num-col">${fmtN(p.calls)}</td>
        <td class="num-col">${fmtN(p.visits)}</td>
      </tr>`;
    }).join('');
  }

  // ── Team Breakdown tab ────────────────────────────────────────────
  function renderTeam(breakdown) {
    if (breakdown && Array.isArray(breakdown)) {
      $('teamContent').innerHTML = `
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Owner Role</th><th class="num-col">Partners</th><th class="num-col">MTD</th><th class="num-col">Target</th><th class="num-col">Ach%</th></tr></thead>
            <tbody>${breakdown.map(r => {
              const a = r.target > 0 ? (r.mtd/r.target*100).toFixed(1) : '0.0';
              return `<tr><td><span class="badge badge-gray">${safe(r.role||r.ownerRole)}</span></td>
                <td class="num-col">${fmtN(r.count||r.partners)}</td>
                <td class="num-col">${fmtINR(r.mtd||r.currentMonth)}</td>
                <td class="num-col">${fmtINR(r.target)}</td>
                <td class="num-col ${Number(a)>=100?'kpi-pos':''}">${a}%</td></tr>`;
            }).join('')}</tbody>
          </table>
        </div>`;
      return;
    }
    // Fallback: calculate from allPartners
    const byRole = {};
    allPartners.forEach(p => {
      const r = p.ownerRole || 'Unknown';
      if (!byRole[r]) byRole[r] = { role:r, count:0, mtd:0, target:0 };
      byRole[r].count++;
      byRole[r].mtd    += mtd(p);
      byRole[r].target += tgt(p);
    });
    const rows = Object.values(byRole).sort((a,b) => b.mtd - a.mtd);
    $('teamContent').innerHTML = `
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Owner Role</th><th class="num-col">Partners</th><th class="num-col">MTD</th><th class="num-col">Target</th><th class="num-col">Ach%</th></tr></thead>
          <tbody>${rows.map(r => {
            const a = r.target > 0 ? (r.mtd/r.target*100).toFixed(1) : '0.0';
            return `<tr><td><span class="badge badge-gray">${safe(r.role)}</span></td>
              <td class="num-col">${r.count}</td>
              <td class="num-col">${fmtINR(r.mtd)}</td>
              <td class="num-col">${fmtINR(r.target)}</td>
              <td class="num-col ${Number(a)>=100?'kpi-pos':''}">${a}%</td></tr>`;
          }).join('')}</tbody>
        </table>
      </div>`;
  }

  // ── AM Performance tab ────────────────────────────────────────────
  function renderAM(amData) {
    if (amData && Array.isArray(amData)) {
      $('amContent').innerHTML = buildAMTable(amData.map(r => ({
        name: r.name || r.ownerName,
        zone: r.zone || '',
        count: r.partners || r.count || 0,
        active: r.active || 0,
        mtd:    r.mtd || r.currentMonth || 0,
        lmtd:   r.lmtd || r.prevMonth || 0,
        target: r.target || 0,
        calls:  r.calls || 0,
        visits: r.visits || 0
      })));
      return;
    }
    // Fallback
    const byAM = {};
    allPartners.filter(p => p.ownerRole === 'AM').forEach(p => {
      const n = p.ownerName || 'Unknown';
      if (!byAM[n]) byAM[n] = { name:n, zone:p.zone||'', count:0, active:0, mtd:0, lmtd:0, target:0, calls:0, visits:0 };
      byAM[n].count++;
      if (p.isActive) byAM[n].active++;
      byAM[n].mtd    += mtd(p);
      byAM[n].lmtd   += lmtd(p);
      byAM[n].target += tgt(p);
      byAM[n].calls  += Number(p.calls)||0;
      byAM[n].visits += Number(p.visits)||0;
    });
    $('amContent').innerHTML = buildAMTable(Object.values(byAM).sort((a,b) => b.mtd - a.mtd));
  }

  function buildAMTable(rows) {
    if (!rows.length) return `<div class="empty-state"><div class="empty-state-icon">📊</div><div class="empty-state-msg">No AM data</div></div>`;
    return `<div class="table-wrap"><table class="data-table">
      <thead><tr><th>#</th><th>AM Name</th><th>Zone</th><th class="num-col">Partners</th><th class="num-col">Active</th><th class="num-col">MTD</th><th class="num-col">LMTD</th><th class="num-col">MoM%</th><th class="num-col">Target</th><th class="num-col">Ach%</th><th class="num-col">Calls</th><th class="num-col">Visits</th></tr></thead>
      <tbody>${rows.map((r,i) => {
        const m = r.lmtd > 0 ? ((r.mtd-r.lmtd)/r.lmtd*100).toFixed(1) : '0.0';
        const a = r.target > 0 ? (r.mtd/r.target*100).toFixed(1) : '0.0';
        return `<tr>
          <td>${i+1}</td><td><strong>${safe(r.name)}</strong></td><td>${safe(r.zone)}</td>
          <td class="num-col">${fmtN(r.count)}</td><td class="num-col kpi-pos">${fmtN(r.active)}</td>
          <td class="num-col">${fmtINR(r.mtd)}</td><td class="num-col">${fmtINR(r.lmtd)}</td>
          <td class="num-col ${Number(m)>=0?'kpi-pos':'kpi-neg'}">${m}%</td>
          <td class="num-col">${fmtINR(r.target)}</td>
          <td class="num-col ${Number(a)>=100?'kpi-pos':''}">${a}%</td>
          <td class="num-col">${fmtN(r.calls)}</td><td class="num-col">${fmtN(r.visits)}</td>
        </tr>`;
      }).join('')}</tbody></table></div>`;
  }

  // ── Modal ─────────────────────────────────────────────────────────
  function openModal(p) {
    if (!p) return;
    $('modalTitle').textContent = p.name || 'Partner Details';
    const m = mom(p), a = ach(p);
    $('modalBody').innerHTML = `
      <div class="modal-section">
        <div class="modal-section-title">Partner Info</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px">
          <div><span style="color:#94a3b8">Zone:</span> <strong>${safe(p.zone)}</strong></div>
          <div><span style="color:#94a3b8">State:</span> <strong>${safe(p.state)}</strong></div>
          <div><span style="color:#94a3b8">City:</span> <strong>${safe(p.city)}</strong></div>
          <div><span style="color:#94a3b8">Emp ID:</span> <strong>${safe(p.empId||p.gcd||'—')}</strong></div>
          <div><span style="color:#94a3b8">Status:</span> ${statusBadge(statusStr(p))}</div>
          <div><span style="color:#94a3b8">Unique:</span> ${p.uniqueStatus ? statusBadge(p.uniqueStatus) : '—'}</div>
          <div><span style="color:#94a3b8">Owner:</span> <strong>${safe(p.ownerName)} (${safe(p.ownerRole)})</strong></div>
          <div><span style="color:#94a3b8">Active Months:</span> <strong>${fmtN(amon(p))}</strong></div>
        </div>
      </div>
      <div class="modal-section">
        <div class="modal-section-title">Business Performance</div>
        <div class="modal-kpi-grid">
          <div class="modal-kpi"><div class="modal-kpi-label">FTD</div><div class="modal-kpi-val">${fmtINR(ftd(p))}</div></div>
          <div class="modal-kpi"><div class="modal-kpi-label">MTD</div><div class="modal-kpi-val">${fmtINR(mtd(p))}</div></div>
          <div class="modal-kpi"><div class="modal-kpi-label">LMTD</div><div class="modal-kpi-val">${fmtINR(lmtd(p))}</div></div>
          <div class="modal-kpi"><div class="modal-kpi-label">MoM%</div><div class="modal-kpi-val ${m>=0?'kpi-pos':'kpi-neg'}">${m>=0?'+':''}${m.toFixed(1)}%</div></div>
          <div class="modal-kpi"><div class="modal-kpi-label">Net Combined</div><div class="modal-kpi-val">${fmtINR(net(p))}</div></div>
          <div class="modal-kpi"><div class="modal-kpi-label">Active Biz</div><div class="modal-kpi-val">${fmtINR(abiz(p))}</div></div>
          <div class="modal-kpi"><div class="modal-kpi-label">Target</div><div class="modal-kpi-val">${fmtINR(tgt(p))}</div></div>
          <div class="modal-kpi"><div class="modal-kpi-label">Achievement</div><div class="modal-kpi-val ${a>=100?'kpi-pos':''}">${a.toFixed(1)}%</div></div>
          <div class="modal-kpi"><div class="modal-kpi-label">Calls / Visits</div><div class="modal-kpi-val">${fmtN(p.calls)} / ${fmtN(p.visits)}</div></div>
        </div>
      </div>
      ${p.remark ? `<div class="modal-section"><div class="modal-section-title">Remark</div><p style="font-size:13px;color:#475569">${safe(p.remark)}</p></div>` : ''}
    `;
    $('modal').style.display = 'flex';
  }
  $('modalClose').addEventListener('click', () => $('modal').style.display = 'none');
  $('modal').addEventListener('click', e => { if (e.target === $('modal')) $('modal').style.display = 'none'; });

  // ── Start ────────────────────────────────────────────────────────
  load();

})();
