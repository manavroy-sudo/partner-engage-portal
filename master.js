// ====================================================================
// master.js v9 — Master Dashboard Logic
// Works with master.html element IDs
// Features:
//  1. Pan-India banner KPIs
//  2. Zone overview cards with drill modal
//  3. All Partners table with search/filter
//  4. AM Performance cards with partner drill-down
//  5. Team Breakdown by role hierarchy
//  6. Call & Visit Tracker per owner
//  7. Charts: MTD by zone, Ach%, Partner status, Top 10 AMs
// ====================================================================

(function () {
  'use strict';

  // ── Session ──────────────────────────────────────────────────────
  const peUser = JSON.parse(sessionStorage.getItem('peUser') || 'null');
  if (!peUser) { location.href = 'index.html'; return; }

  // ── Helpers ──────────────────────────────────────────────────────
  const $    = id => document.getElementById(id);
  const safe = s  => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  const fmtINR = n => {
    n = Number(n) || 0;
    if (n >= 1e7) return '₹' + (n / 1e7).toFixed(2) + ' Cr';
    if (n >= 1e5) return '₹' + (n / 1e5).toFixed(2) + ' L';
    if (n >= 1e3) return '₹' + (n / 1e3).toFixed(1) + 'K';
    return '₹' + Math.round(n).toLocaleString('en-IN');
  };
  const fmtN  = n => Number(n || 0).toLocaleString('en-IN');

  const mtd  = p => Number(p.currentMonth  || p.mtd  || 0);
  const lmtd = p => Number(p.prevMonth     || p.lmtd || 0);
  const ftd  = p => Number(p.ftd  || 0);
  const tgt  = p => Number(p.target || 0);
  const net  = p => Number(p.netCombinedPremium || p.netCombined || 0);
  const abiz = p => Number(p.activeMonthsBiz   || p.activeBiz   || 0);
  const amon = p => Number(p.activeMonthsCount  || p.activeMonths || 0);
  const mom  = p => lmtd(p) > 0 ? ((mtd(p)-lmtd(p))/lmtd(p)*100) : 0;
  const ach  = p => tgt(p)  > 0 ? (mtd(p)/tgt(p)*100) : 0;
  const statusStr  = p => p.status || (p.isActive ? 'Active' : 'Inactive');
  const statusBadge = s => {
    const m = { Active:'green', Inactive:'red', New:'blue', Dormant:'yellow' };
    return `<span class="badge badge-${m[s]||'gray'}">${safe(s)}</span>`;
  };

  // Zone accent colours
  const ZONE_COLORS = {
    North:'#3b82f6', South:'#10b981', East:'#f59e0b',
    West:'#8b5cf6', RON:'#ef4444', TELE_RM:'#06b6d4', Other:'#94a3b8'
  };

  // ── Header ───────────────────────────────────────────────────────
  $('headerName').textContent = peUser.name || peUser.gid;
  $('btnLogout').addEventListener('click', () => {
    sessionStorage.removeItem('peUser');
    location.href = 'index.html';
  });

  // ── Status bar ───────────────────────────────────────────────────
  function setStatus(msg, kind) {
    const bar = $('statusBar');
    bar.textContent = msg || '';
    bar.className = 'status-bar' + (kind ? ' '+kind : '') + (!msg ? ' hidden' : '');
  }

  // ── Tabs ─────────────────────────────────────────────────────────
  document.querySelectorAll('.master-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.master-tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.master-content').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const pane = $('mc-' + btn.dataset.tab);
      if (pane) pane.classList.add('active');
    });
  });

  // ── Chart refs ──────────────────────────────────────────────────
  let chartZone, chartAch, chartStatus, chartAM;

  // ── State ────────────────────────────────────────────────────────
  let allPartners = [];
  let masterData  = {};

  // ── Load ─────────────────────────────────────────────────────────
  function load() {
    setStatus('Loading master data…', 'loading');
    fetch(API_URL + '?action=getMaster&gid=' + encodeURIComponent(peUser.gid))
      .then(r => r.json())
      .then(res => {
        $('loader').style.display = 'none';
        if (!res.success) { setStatus(res.message || 'Failed.', 'error'); return; }
        setStatus('', '');

        masterData  = res;
        allPartners = res.teleRMPartners
          ? (res.amPerf || []).reduce((arr, am) => arr.concat(am.partnerList || []), [])
          : [];

        // Collect all partners from amPerf partnerLists for the Partners tab
        const ptMap = {};
        ['zhPerf','rhPerf','shPerf','rmPerf','amPerf','teleRMPerf'].forEach(key => {
          (res[key] || []).forEach(m => {
            (m.partnerList || []).forEach(p => { if (!ptMap[p.gid]) ptMap[p.gid] = p; });
          });
        });
        // Also include teleRMPartners directly
        (res.teleRMPartners || []).forEach(p => { if (!ptMap[p.gid]) ptMap[p.gid] = p; });
        allPartners = Object.values(ptMap);
        window._masterAllPartners = allPartners;
        window._masterData = res;

        renderBanner(res.overallSummary || res.overallProject);
        renderZones(res.zoneSummaries || []);
        buildPartnerFilters();
        applyMasterFilters();
        renderAMPerf(res.amPerf, res.teleRMPerf);
        renderTeamBreakdown(res);
        renderTracker(res);
        renderCharts(res);
      })
      .catch(e => {
        $('loader').style.display = 'none';
        setStatus('Error: ' + e.message, 'error');
      });
  }

  // ── Banner KPIs ──────────────────────────────────────────────────
  function renderBanner(s) {
    if (!s) return;
    const mom_v = s.momPct || 0;
    const ach_v = s.achievementPct || 0;
    const momCls = mom_v >= 0 ? '' : 'kpi-neg';
    $('bTotal').textContent  = fmtN(s.totalPartners || 0);
    $('bActive').textContent = fmtN(s.activeCount || s.activePartners || 0);
    $('bFtd').textContent    = fmtINR(0); // FTD not in overall summary — set to 0
    $('bMtd').textContent    = fmtINR(s.currentMonthPremium || s.businessGenerated || 0);
    $('bLmtd').textContent   = fmtINR(s.prevMonthPremium || s.lmtd || 0);
    $('bTarget').textContent = fmtINR(s.totalTarget || s.target || 0);
    $('bAch').textContent    = ach_v + '%';
    $('bMom').textContent    = (mom_v >= 0 ? '+' : '') + mom_v + '%';
    $('bMom').className      = 'banner-value ' + momCls;
    $('bCalls').textContent  = fmtN(s.totalCalls || s.calls || 0);
    $('bVisits').textContent = fmtN(s.totalVisits || s.visits || 0);
  }

  // ── Zone Cards ───────────────────────────────────────────────────
  function renderZones(zones) {
    const grid = $('zoneGrid');
    if (!zones.length) {
      grid.innerHTML = '<div class="empty-state"><div class="empty-state-msg">No zone data</div></div>';
      return;
    }
    grid.innerHTML = zones.map((z, idx) => {
      const s      = z.summary || {};
      const mom_v  = s.momPct || 0;
      const ach_v  = s.achievementPct || 0;
      const achCls = ach_v >= 100 ? 'ach-color' : ach_v >= 60 ? 'ach-mid' : 'ach-low';
      const color  = ZONE_COLORS[z.zone] || ZONE_COLORS.Other;
      const barPct = Math.min(ach_v, 100);
      return `<div class="z-card" onclick="openZoneDrill(${idx})" style="border-top:4px solid ${color};">
        <div class="z-row">
          <div class="z-name">${safe(z.zone)}</div>
          <div class="z-ach ${achCls}">${ach_v}%</div>
        </div>
        <div style="font-size:12px;color:#64748b;margin-bottom:8px;">${fmtN(z.partnerCount)} partners</div>
        <div class="z-row">
          <div><div class="z-stat-label">MTD</div><div class="z-stat-val ${mom_v>=0?'kpi-pos':'kpi-neg'}">${fmtINR(s.currentMonthPremium||0)}</div></div>
          <div><div class="z-stat-label">LMTD</div><div class="z-stat-val">${fmtINR(s.prevMonthPremium||0)}</div></div>
          <div><div class="z-stat-label">MoM%</div><div class="z-stat-val ${mom_v>=0?'kpi-pos':'kpi-neg'}">${mom_v>=0?'+':''}${mom_v}%</div></div>
        </div>
        <div class="z-stats">
          <div><div class="z-stat-label">Max Pot.</div><div class="z-stat-val">${fmtINR(s.totalMaxPotential||0)}</div></div>
          <div><div class="z-stat-label">Target</div><div class="z-stat-val">${fmtINR(s.totalTarget||0)}</div></div>
          <div><div class="z-stat-label">Active</div><div class="z-stat-val kpi-pos">${fmtN(s.activeCount||0)}</div></div>
          <div><div class="z-stat-label">Connected</div><div class="z-stat-val">${fmtN(s.connectedCount||0)}</div></div>
          <div><div class="z-stat-label">Calls</div><div class="z-stat-val">${fmtN(s.totalCalls||0)}</div></div>
          <div><div class="z-stat-label">Visits</div><div class="z-stat-val">${fmtN(s.totalVisits||0)}</div></div>
        </div>
        <div class="z-bar"><div class="z-bar-fill" style="width:${barPct}%;background:${color};"></div></div>
      </div>`;
    }).join('');

    window._zoneSummaries = zones;
  }

  // ── Zone Drill Modal ─────────────────────────────────────────────
  window.openZoneDrill = function(idx) {
    const z = (window._zoneSummaries || [])[idx]; if (!z) return;
    const s = z.summary || {};
    const mom_v = s.momPct || 0;
    const color = ZONE_COLORS[z.zone] || ZONE_COLORS.Other;

    // Build AM performance for this zone from masterData
    const zoneAMs = ((masterData.amPerf || []).concat(masterData.teleRMPerf || []))
      .filter(m => (m.zone === z.zone || (m.zones||[]).includes(z.zone)))
      .sort((a,b) => (b.summary?.currentMonthPremium||0) - (a.summary?.currentMonthPremium||0));

    $('zoneModalTitle').innerHTML = `<span style="color:${color}">●</span> ${safe(z.zone)} Zone — ${fmtN(z.partnerCount)} Partners`;
    $('zoneModalBody').innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px;">
        <div class="modal-kpi"><div class="modal-kpi-label">MTD</div><div class="modal-kpi-val ${(s.currentMonthPremium||0)>0?'kpi-pos':''}">${fmtINR(s.currentMonthPremium||0)}</div></div>
        <div class="modal-kpi"><div class="modal-kpi-label">LMTD</div><div class="modal-kpi-val">${fmtINR(s.prevMonthPremium||0)}</div></div>
        <div class="modal-kpi"><div class="modal-kpi-label">MoM%</div><div class="modal-kpi-val ${mom_v>=0?'kpi-pos':'kpi-neg'}">${mom_v>=0?'+':''}${mom_v}%</div></div>
        <div class="modal-kpi"><div class="modal-kpi-label">Achievement</div><div class="modal-kpi-val">${s.achievementPct||0}%</div></div>
        <div class="modal-kpi"><div class="modal-kpi-label">Max Potential</div><div class="modal-kpi-val">${fmtINR(s.totalMaxPotential||0)}</div></div>
        <div class="modal-kpi"><div class="modal-kpi-label">Target</div><div class="modal-kpi-val">${fmtINR(s.totalTarget||0)}</div></div>
        <div class="modal-kpi"><div class="modal-kpi-label">Active</div><div class="modal-kpi-val kpi-pos">${fmtN(s.activeCount||0)}</div></div>
        <div class="modal-kpi"><div class="modal-kpi-label">Connected</div><div class="modal-kpi-val">${fmtN(s.connectedCount||0)}</div></div>
      </div>

      ${zoneAMs.length ? `
      <div style="font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px;">
        AMs in this Zone (${zoneAMs.length})
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr>
            <th>#</th><th>AM Name</th><th>Zone</th>
            <th class="num-col">Partners</th><th class="num-col">Active</th>
            <th class="num-col">MTD</th><th class="num-col">LMTD</th>
            <th class="num-col">MoM%</th><th class="num-col">Ach%</th>
            <th class="num-col">Calls</th><th class="num-col">Visits</th>
          </tr></thead>
          <tbody>${zoneAMs.map((m,i) => {
            const ms = m.summary || {};
            const mm = ms.momPct || 0;
            return `<tr>
              <td>${i+1}</td>
              <td><strong>${safe(m.name)}</strong></td>
              <td>${safe(m.zone||z.zone)}</td>
              <td class="num-col">${fmtN(m.partnerCount||0)}</td>
              <td class="num-col kpi-pos">${fmtN(ms.activeCount||0)}</td>
              <td class="num-col ${(ms.currentMonthPremium||0)>0?'kpi-pos':''}">${fmtINR(ms.currentMonthPremium||0)}</td>
              <td class="num-col">${fmtINR(ms.prevMonthPremium||0)}</td>
              <td class="num-col ${mm>=0?'kpi-pos':'kpi-neg'}">${mm>=0?'+':''}${mm}%</td>
              <td class="num-col ${(ms.achievementPct||0)>=100?'kpi-pos':''}">${ms.achievementPct||0}%</td>
              <td class="num-col">${fmtN(ms.totalCalls||0)}</td>
              <td class="num-col">${fmtN(ms.totalVisits||0)}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>` : '<div class="empty-state"><div class="empty-state-msg">No AM breakdown available for this zone</div></div>'}
    `;
    $('zoneModal').style.display = 'flex';
  };

  $('zoneModalClose').addEventListener('click', () => $('zoneModal').style.display = 'none');
  $('zoneModal').addEventListener('click', e => { if (e.target === $('zoneModal')) $('zoneModal').style.display = 'none'; });

  // ── All Partners Tab ─────────────────────────────────────────────
  function buildPartnerFilters() {
    const zones  = [...new Set(allPartners.map(p=>p.zone||'').filter(Boolean))].sort();
    const states = [...new Set(allPartners.map(p=>p.state||'').filter(Boolean))].sort();
    const roles  = [...new Set(allPartners.map(p=>p.ownerRole||'').filter(Boolean))].sort();

    populateSel($('mZone'),  zones,  'All Zones');
    populateSel($('mState'), states, 'All States');
    populateSel($('mRole'),  roles,  'All Roles');

    ['mSearch','mZone','mState','mRole'].forEach(id => {
      const el = $(id); if (!el) return;
      el.addEventListener('input',  applyMasterFilters);
      el.addEventListener('change', applyMasterFilters);
    });
    $('mClear').addEventListener('click', () => {
      ['mSearch','mZone','mState','mRole'].forEach(id => { const el=$(id); if(el) el.value=''; });
      applyMasterFilters();
    });
  }

  function populateSel(sel, vals, label) {
    if (!sel) return;
    sel.innerHTML = `<option value="">${label}</option>` +
      vals.map(v=>`<option value="${safe(v)}">${safe(v)}</option>`).join('');
  }

  function applyMasterFilters() {
    const q     = (($('mSearch')||{}).value||'').toLowerCase();
    const zone  = (($('mZone')||{}).value||'');
    const state = (($('mState')||{}).value||'');
    const role  = (($('mRole')||{}).value||'');

    const rows = allPartners.filter(p => {
      if (q && !((p.name||'').toLowerCase().includes(q)||(p.gid||'').toLowerCase().includes(q))) return false;
      if (zone  && p.zone      !== zone)  return false;
      if (state && p.state     !== state) return false;
      if (role  && p.ownerRole !== role)  return false;
      return true;
    });

    const cnt = $('mCount'); if (cnt) cnt.textContent = `Showing ${rows.length.toLocaleString('en-IN')} of ${allPartners.length.toLocaleString('en-IN')} partners`;
    renderMasterTable(rows);
  }

  function renderMasterTable(rows) {
    const tbody = $('masterBody'); if (!tbody) return;
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="19"><div class="empty-state"><div class="empty-state-icon">🔍</div><div class="empty-state-msg">No partners match filters</div></div></td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map((p, i) => {
      const m = mom(p), a = ach(p);
      const zoneColor = ZONE_COLORS[p.zone] || '#94a3b8';
      return `<tr>
        <td>${i+1}</td>
        <td><strong>${safe(p.name)}</strong>${p.gid?`<br><small style="color:#94a3b8">${safe(p.gid)}</small>`:''}</td>
        <td><span style="color:${zoneColor};font-weight:600;">${safe(p.zone||'—')}</span></td>
        <td>${safe(p.state||'—')}</td><td>${safe(p.city||'—')}</td>
        <td><span class="badge badge-gray">${safe(p.ownerRole||'—')}</span></td>
        <td>${safe(p.ownerName||'—')}</td>
        <td>${statusBadge(statusStr(p))}</td>
        <td>${p.uniqueStatus?statusBadge(p.uniqueStatus):'—'}</td>
        <td class="num-col">${fmtINR(ftd(p))}</td>
        <td class="num-col ${mtd(p)>0?'kpi-pos':mtd(p)<0?'kpi-neg':''}">${fmtINR(mtd(p))}</td>
        <td class="num-col">${fmtINR(lmtd(p))}</td>
        <td class="num-col ${m>=0?'kpi-pos':'kpi-neg'}">${m>=0?'+':''}${m.toFixed(1)}%</td>
        <td class="num-col">${fmtINR(net(p))}</td>
        <td class="num-col">${fmtINR(tgt(p))}</td>
        <td class="num-col ${a>=100?'kpi-pos':''}">${a.toFixed(1)}%</td>
        <td class="num-col">${fmtN(amon(p))}</td>
        <td class="num-col">${fmtN(p.calls||0)}</td>
        <td class="num-col">${fmtN(p.visits||0)}</td>
      </tr>`;
    }).join('');
  }

  // ── AM Performance ───────────────────────────────────────────────
  function renderAMPerf(amPerf, teleRMPerf) {
    const container = $('amContent'); if (!container) return;

    // Merge regular AMs + TELE_RM AMs
    const allAMs = (amPerf || []).slice();
    const seenNames = new Set(allAMs.map(m => m.name));
    (teleRMPerf || []).forEach(m => {
      if (!seenNames.has(m.name)) {
        m._isTeleRM = true;
        allAMs.push(m);
        seenNames.add(m.name);
      }
    });
    allAMs.sort((a,b) => (b.summary?.currentMonthPremium||0) - (a.summary?.currentMonthPremium||0));

    if (!allAMs.length) {
      container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📊</div><div class="empty-state-msg">No AM data returned</div></div>`;
      return;
    }

    const zones = [...new Set(allAMs.map(m=>m.zone||(m.zones&&m.zones[0])||'').filter(Boolean))].sort();

    container.innerHTML = `
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;align-items:center;">
        <input type="text" id="mAmSearch" placeholder="Search AM name…" class="inline-search"/>
        <select id="mAmZone" class="filter-select" style="min-width:120px;">
          <option value="">All Zones</option>
          ${zones.map(z=>`<option value="${safe(z)}">${safe(z)}</option>`).join('')}
        </select>
        <span id="mAmCount" style="font-size:12px;color:#94a3b8;">${allAMs.length} AMs</span>
      </div>
      <div class="team-cards-grid" id="mAmGrid"></div>
    `;

    window._masterAMs = allAMs;
    renderMasterAMCards(allAMs);

    const doFilter = () => {
      const q    = (document.getElementById('mAmSearch').value||'').toLowerCase();
      const zone = document.getElementById('mAmZone').value;
      const vis  = allAMs.filter(m => {
        const mz = m.zone || (m.zones&&m.zones[0]) || '';
        if (zone && mz !== zone) return false;
        if (q && !(m.name||'').toLowerCase().includes(q)) return false;
        return true;
      });
      document.getElementById('mAmCount').textContent = vis.length + ' AMs';
      renderMasterAMCards(vis);
    };
    document.getElementById('mAmSearch').addEventListener('input', doFilter);
    document.getElementById('mAmZone').addEventListener('change', doFilter);
  }

  function renderMasterAMCards(list) {
    const g = document.getElementById('mAmGrid'); if (!g) return;
    if (!list.length) { g.innerHTML = `<div class="empty-state"><div class="empty-state-msg">No AMs match</div></div>`; return; }

    g.innerHTML = list.map((m, idx) => {
      const s      = m.summary || {};
      const mom_v  = s.momPct || 0;
      const momCls = mom_v > 0 ? 'kpi-pos' : mom_v < 0 ? 'kpi-neg' : '';
      const ach_v  = s.achievementPct || 0;
      const zone   = m.zone || (m.zones&&m.zones[0]) || '—';
      const states = (m.states||[]).slice(0,3).join(', ') + ((m.states||[]).length>3?` +${(m.states||[]).length-3}`:'');
      const teleTag = m._isTeleRM ? '<span class="badge badge-blue" style="font-size:10px;margin-left:6px;">TELE</span>' : '';
      const srcIdx = (window._masterAMs||[]).indexOf(m);

      return `<div class="team-member-card">
        <div class="tmc-header">
          <div class="tmc-title-wrap">
            <div class="tmc-name">${safe(m.name)}${teleTag}</div>
            <div class="tmc-sub">AM &bull; ${fmtN(m.partnerCount||0)} partners &bull; ${safe(zone)}</div>
          </div>
          <button class="btn-details" onclick="openMasterAMDrill(${srcIdx})">Details</button>
        </div>
        <div class="tmc-kpis">
          <div class="tmc-kpi"><div class="tmc-kpi-label">MTD</div><div class="tmc-kpi-val ${(s.currentMonthPremium||0)>0?'kpi-pos':''}">${fmtINR(s.currentMonthPremium||0)}</div></div>
          <div class="tmc-kpi"><div class="tmc-kpi-label">LMTD</div><div class="tmc-kpi-val">${fmtINR(s.prevMonthPremium||0)}</div></div>
          <div class="tmc-kpi"><div class="tmc-kpi-label">MoM%</div><div class="tmc-kpi-val ${momCls}">${mom_v>0?'▲ +':mom_v<0?'▼ ':''}${mom_v}%</div></div>
          <div class="tmc-kpi"><div class="tmc-kpi-label">Target</div><div class="tmc-kpi-val">${fmtINR(s.totalTarget||0)}</div></div>
          <div class="tmc-kpi"><div class="tmc-kpi-label">Ach%</div><div class="tmc-kpi-val ${ach_v>=100?'kpi-pos':''}">${ach_v}%</div></div>
          <div class="tmc-kpi"><div class="tmc-kpi-label">Max Pot.</div><div class="tmc-kpi-val">${fmtINR(s.totalMaxPotential||0)}</div></div>
          <div class="tmc-kpi"><div class="tmc-kpi-label">Overall Pot.</div><div class="tmc-kpi-val">${fmtINR(s.totalOverallPotential||0)}</div></div>
          <div class="tmc-kpi"><div class="tmc-kpi-label">Active</div><div class="tmc-kpi-val kpi-pos">${fmtN(s.activeCount||0)}</div></div>
          <div class="tmc-kpi"><div class="tmc-kpi-label">Inactive</div><div class="tmc-kpi-val ${(s.inactiveCount||0)>0?'kpi-neg':''}">${fmtN(s.inactiveCount||0)}</div></div>
          <div class="tmc-kpi"><div class="tmc-kpi-label">Connected</div><div class="tmc-kpi-val kpi-pos">${fmtN(s.connectedCount||0)}</div></div>
          <div class="tmc-kpi"><div class="tmc-kpi-label">Calls</div><div class="tmc-kpi-val">${fmtN(s.totalCalls||0)}</div></div>
          <div class="tmc-kpi"><div class="tmc-kpi-label">Visits</div><div class="tmc-kpi-val">${fmtN(s.totalVisits||0)}</div></div>
        </div>
      </div>`;
    }).join('');
  }

  window.openMasterAMDrill = function(idx) {
    const m = (window._masterAMs||[])[idx]; if (!m) return;
    const s = m.summary || {};
    const mom_v = s.momPct || 0;
    const partners = m.partnerList || [];

    $('zoneModalTitle').textContent = m.name + ' — AM Partner Details';
    $('zoneModalBody').innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px;">
        <div class="modal-kpi"><div class="modal-kpi-label">Zone</div><div class="modal-kpi-val">${safe(m.zone||'—')}</div></div>
        <div class="modal-kpi"><div class="modal-kpi-label">Partners</div><div class="modal-kpi-val">${fmtN(m.partnerCount||0)}</div></div>
        <div class="modal-kpi"><div class="modal-kpi-label">MTD</div><div class="modal-kpi-val kpi-pos">${fmtINR(s.currentMonthPremium||0)}</div></div>
        <div class="modal-kpi"><div class="modal-kpi-label">MoM%</div><div class="modal-kpi-val ${mom_v>=0?'kpi-pos':'kpi-neg'}">${mom_v>=0?'+':''}${mom_v}%</div></div>
        <div class="modal-kpi"><div class="modal-kpi-label">Ach%</div><div class="modal-kpi-val">${s.achievementPct||0}%</div></div>
        <div class="modal-kpi"><div class="modal-kpi-label">Active</div><div class="modal-kpi-val kpi-pos">${fmtN(s.activeCount||0)}</div></div>
        <div class="modal-kpi"><div class="modal-kpi-label">Connected</div><div class="modal-kpi-val">${fmtN(s.connectedCount||0)}</div></div>
        <div class="modal-kpi"><div class="modal-kpi-label">States</div><div class="modal-kpi-val" style="font-size:11px">${(m.states||[]).join(', ')||'—'}</div></div>
      </div>
      ${partners.length ? `
      <div class="table-wrap">
        <table class="data-table" style="min-width:860px;">
          <thead><tr>
            <th>#</th><th>Partner</th><th>City/State</th>
            <th class="num-col">MTD</th><th class="num-col">LMTD</th><th class="num-col">MoM%</th>
            <th class="num-col">Max Pot.</th><th class="num-col">Target</th><th class="num-col">Ach%</th>
            <th>Status</th><th>Growth</th>
            <th class="num-col">Calls</th><th class="num-col">Visits</th>
          </tr></thead>
          <tbody>${partners.map((p,i) => {
            const pm = p.prevMonth>0?((p.currentMonth-p.prevMonth)/p.prevMonth*100):0;
            const pa = p.target>0?(p.currentMonth/p.target*100):0;
            return `<tr>
              <td>${i+1}</td>
              <td><strong>${safe(p.name)}</strong><br><small style="color:#94a3b8">${safe(p.gid||'')}</small></td>
              <td>${safe(p.city||'—')}, ${safe(p.state||'—')}</td>
              <td class="num-col ${p.currentMonth>0?'kpi-pos':''}">${fmtINR(p.currentMonth||0)}</td>
              <td class="num-col">${fmtINR(p.prevMonth||0)}</td>
              <td class="num-col ${pm>=0?'kpi-pos':'kpi-neg'}">${pm>=0?'▲ +':'▼ '}${pm.toFixed(1)}%</td>
              <td class="num-col">${fmtINR(p.maxPotential||0)}</td>
              <td class="num-col">${fmtINR(p.target||0)}</td>
              <td class="num-col ${pa>=100?'kpi-pos':''}">${pa.toFixed(1)}%</td>
              <td><span class="badge ${p.isActive?'badge-green':'badge-red'}">${p.isActive?'Active':'Inactive'}</span></td>
              <td><span class="badge ${p.isGrowth?'badge-green':'badge-red'}">${p.isGrowth?'▲ Growth':'▼ Degrowth'}</span></td>
              <td class="num-col">${fmtN(p.calls||0)}</td>
              <td class="num-col">${fmtN(p.visits||0)}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>` : '<div class="empty-state"><div class="empty-state-msg">No partner details available</div></div>'}
    `;
    $('zoneModal').style.display = 'flex';
  };

  // ── Team Breakdown Tab ───────────────────────────────────────────
  function renderTeamBreakdown(res) {
    const container = $('teamContent'); if (!container) return;
    const ROLES = ['ZH','RH','SH','RM','AM'];
    const sections = ROLES.map(role => {
      const key = role.toLowerCase() + 'Perf';
      const members = res[key] || [];
      if (!members.length) return '';

      const rows = members.map((m, i) => {
        const s = m.summary || {};
        const mom_v = s.momPct || 0;
        return `<tr>
          <td>${i+1}</td>
          <td><strong>${safe(m.name)}</strong></td>
          <td>${safe(m.zone || (m.zones&&m.zones[0]) || '—')}</td>
          <td class="num-col">${fmtN(m.partnerCount||0)}</td>
          <td class="num-col kpi-pos">${fmtN(s.activeCount||0)}</td>
          <td class="num-col ${(s.currentMonthPremium||0)>0?'kpi-pos':''}">${fmtINR(s.currentMonthPremium||0)}</td>
          <td class="num-col">${fmtINR(s.prevMonthPremium||0)}</td>
          <td class="num-col ${mom_v>=0?'kpi-pos':'kpi-neg'}">${mom_v>=0?'+':''}${mom_v}%</td>
          <td class="num-col">${fmtINR(s.totalTarget||0)}</td>
          <td class="num-col ${(s.achievementPct||0)>=100?'kpi-pos':''}">${s.achievementPct||0}%</td>
          <td class="num-col">${fmtN(s.connectedCount||0)}</td>
          <td class="num-col">${fmtN(s.totalCalls||0)}</td>
          <td class="num-col">${fmtN(s.totalVisits||0)}</td>
        </tr>`;
      }).join('');

      const totalMTD = members.reduce((s,m)=>s+(m.summary?.currentMonthPremium||0),0);
      return `
        <div style="margin-bottom:24px;">
          <div style="font-size:13px;font-weight:700;color:#1e293b;margin-bottom:10px;padding:8px 12px;background:#f8fafc;border-radius:8px;border-left:4px solid #3b82f6;">
            ${role} Level — ${members.length} members &nbsp;·&nbsp; Total MTD: ${fmtINR(totalMTD)}
          </div>
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr>
                <th>#</th><th>Name</th><th>Zone</th>
                <th class="num-col">Partners</th><th class="num-col">Active</th>
                <th class="num-col">MTD</th><th class="num-col">LMTD</th><th class="num-col">MoM%</th>
                <th class="num-col">Target</th><th class="num-col">Ach%</th>
                <th class="num-col">Connected</th><th class="num-col">Calls</th><th class="num-col">Visits</th>
              </tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>`;
    }).join('');

    container.innerHTML = sections || `<div class="empty-state"><div class="empty-state-icon">🏢</div><div class="empty-state-msg">No team hierarchy data</div></div>`;
  }

  // ── Call & Visit Tracker ─────────────────────────────────────────
  function renderTracker(res) {
    const tGrid = $('trackerGrid');
    const tBody = $('trackerBody');

    // Build tracker data from all role perfs
    const trackerMap = {};
    ['zhPerf','rhPerf','shPerf','rmPerf','amPerf','teleRMPerf'].forEach(key => {
      (res[key] || []).forEach(m => {
        const s = m.summary || {};
        if (!trackerMap[m.name]) {
          trackerMap[m.name] = { name:m.name, role:m.role||key.replace('Perf','').toUpperCase(), zone:m.zone||(m.zones&&m.zones[0])||'—', partners:m.partnerCount||0, calls:0, visits:0 };
        }
        trackerMap[m.name].calls  += s.totalCalls  || 0;
        trackerMap[m.name].visits += s.totalVisits || 0;
      });
    });

    const trackerData = Object.values(trackerMap).sort((a,b)=>b.calls-a.calls);
    const totalCalls  = trackerData.reduce((s,m)=>s+m.calls,0);
    const totalVisits = trackerData.reduce((s,m)=>s+m.visits,0);
    const connectedOwners = trackerData.filter(m=>m.calls>0||m.visits>0).length;

    if (tGrid) {
      tGrid.innerHTML = `
        <div class="tracker-card"><div class="tracker-label">Total Calls</div><div class="tracker-val kpi-pos">${fmtN(totalCalls)}</div></div>
        <div class="tracker-card"><div class="tracker-label">Total Visits</div><div class="tracker-val kpi-pos">${fmtN(totalVisits)}</div></div>
        <div class="tracker-card"><div class="tracker-label">Active Owners</div><div class="tracker-val">${fmtN(connectedOwners)}</div></div>
        <div class="tracker-card"><div class="tracker-label">Total Owners</div><div class="tracker-val">${fmtN(trackerData.length)}</div></div>
      `;
    }

    if (tBody) {
      tBody.innerHTML = trackerData.map((m,i) => {
        const callsPerPart = m.partners > 0 ? (m.calls/m.partners).toFixed(1) : '0.0';
        return `<tr>
          <td>${i+1}</td>
          <td><strong>${safe(m.name)}</strong></td>
          <td><span class="badge badge-gray">${safe(m.role)}</span></td>
          <td>${safe(m.zone)}</td>
          <td class="num-col">${fmtN(m.partners)}</td>
          <td class="num-col ${m.calls>0?'kpi-pos':''}">${fmtN(m.calls)}</td>
          <td class="num-col ${m.visits>0?'kpi-pos':''}">${fmtN(m.visits)}</td>
          <td class="num-col">${callsPerPart}</td>
        </tr>`;
      }).join('');
    }
  }

  // ── Charts ───────────────────────────────────────────────────────
  function renderCharts(res) {
    const zones = res.zoneSummaries || [];

    // Chart 1: MTD by Zone
    const ctxZone = $('chartZone');
    if (ctxZone && typeof Chart !== 'undefined') {
      if (chartZone) chartZone.destroy();
      chartZone = new Chart(ctxZone, {
        type: 'bar',
        data: {
          labels:   zones.map(z => z.zone),
          datasets: [{
            label:           'MTD Business',
            data:            zones.map(z => z.summary?.currentMonthPremium||0),
            backgroundColor: zones.map(z => ZONE_COLORS[z.zone]||'#94a3b8'),
            borderRadius:    6
          }]
        },
        options: {
          responsive:true, plugins:{legend:{display:false}},
          scales:{ y:{ ticks:{ callback: v => v>=1e7?'₹'+(v/1e7).toFixed(1)+'Cr':v>=1e5?'₹'+(v/1e5).toFixed(1)+'L':'₹'+v }}}
        }
      });
    }

    // Chart 2: Achievement % by Zone
    const ctxAch = $('chartAch');
    if (ctxAch && typeof Chart !== 'undefined') {
      if (chartAch) chartAch.destroy();
      chartAch = new Chart(ctxAch, {
        type: 'bar',
        data: {
          labels:   zones.map(z=>z.zone),
          datasets: [{
            label:'Achievement %',
            data: zones.map(z=>z.summary?.achievementPct||0),
            backgroundColor: zones.map(z=>(z.summary?.achievementPct||0)>=100?'#10b981':(z.summary?.achievementPct||0)>=60?'#f59e0b':'#ef4444'),
            borderRadius:6
          }]
        },
        options:{responsive:true,plugins:{legend:{display:false}},scales:{y:{max:150,ticks:{callback:v=>v+'%'}}}}
      });
    }

    // Chart 3: Partner Status (Active vs Inactive)
    const ctxSt = $('chartStatus');
    const ov     = res.overallSummary || res.overallProject || {};
    if (ctxSt && typeof Chart !== 'undefined') {
      if (chartStatus) chartStatus.destroy();
      chartStatus = new Chart(ctxSt, {
        type:'doughnut',
        data:{
          labels:['Active','Inactive'],
          datasets:[{
            data:[ov.activeCount||ov.activePartners||0, ov.inactiveCount||ov.inactivePartners||0],
            backgroundColor:['#10b981','#ef4444'], borderWidth:2
          }]
        },
        options:{responsive:true,plugins:{legend:{position:'bottom'}}}
      });
    }

    // Chart 4: Top 10 AMs by MTD
    const ctxAM = $('chartAM');
    const top10  = (res.amPerf||[]).slice(0,10);
    if (ctxAM && typeof Chart !== 'undefined' && top10.length) {
      if (chartAM) chartAM.destroy();
      chartAM = new Chart(ctxAM, {
        type:'bar',
        data:{
          labels:  top10.map(m=>m.name.split(' ')[0]),
          datasets:[{
            label:'MTD',
            data: top10.map(m=>m.summary?.currentMonthPremium||0),
            backgroundColor:'#3b82f6', borderRadius:4
          }]
        },
        options:{
          indexAxis:'y', responsive:true,
          plugins:{legend:{display:false}},
          scales:{x:{ticks:{callback:v=>v>=1e5?'₹'+(v/1e5).toFixed(1)+'L':'₹'+v}}}
        }
      });
    }
  }

  // ── Start ────────────────────────────────────────────────────────
  load();

})();
