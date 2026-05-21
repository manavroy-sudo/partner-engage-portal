// ====================================================================
// app.js v9 — Partner Engage Dashboard Logic
// V9 Changes over v10:
//  1. openModal: 14-month trend chart using monthlyData + monthLabels
//  2. renderTeam: individual member cards (not just a role table)
//     — each card has "Details" button → partner drill-down modal
//  3. renderAM: AM cards with search/zone filter
//     — each card has "Details" button → partner list drill-down
//  4. VIEW button added to All Partners & My Partners table rows
//  5. window._dashData stored after load for global access
//  6. openTeamDrill / openAMDrill: partner list modals with VIEW chain
//  7. AM owner-mapping fix: myPartners now populated from server (v9 Code.gs)
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
  const fmtN = n => Number(n || 0).toLocaleString('en-IN');

  // Field accessors — handles both old and new Code.gs field names
  const mtd  = p => Number(p.currentMonth  || p.mtd  || 0);
  const lmtd = p => Number(p.prevMonth     || p.lmtd || 0);
  const ftd  = p => Number(p.ftd  || 0);
  const tgt  = p => Number(p.target || 0);
  const net  = p => Number(p.netCombinedPremium || p.netCombined || 0);
  const abiz = p => Number(p.activeMonthsBiz   || p.activeBiz   || 0);
  const amon = p => Number(p.activeMonthsCount  || p.activeMonths || 0);
  const mom  = p => lmtd(p) > 0 ? ((mtd(p) - lmtd(p)) / lmtd(p) * 100) : 0;
  const ach  = p => tgt(p)  > 0 ? (mtd(p) / tgt(p) * 100) : 0;
  const statusStr  = p => p.status || (p.isActive ? 'Active' : 'Inactive');
  const statusBadge = s => {
    const m = { Active:'green', Inactive:'red', New:'blue', Dormant:'yellow' };
    return `<span class="badge badge-${m[s]||'gray'}">${safe(s)}</span>`;
  };

  // ── Header ───────────────────────────────────────────────────────
  $('headerName').textContent = peUser.name || peUser.gid;
  $('headerRole').textContent = peUser.role || '';
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
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const pane = $('tab-' + btn.dataset.tab);
      if (pane) pane.classList.add('active');
    });
  });

  // ── State ────────────────────────────────────────────────────────
  let allPartners = [];
  let filtered    = [];
  let _trendChart = null;   // Chart.js instance (destroyed on modal close)
  let _drillTeam  = [];     // member list for team drill modal index
  let _drillAM    = [];     // member list for AM drill modal index

  // ── Load ─────────────────────────────────────────────────────────
  function load() {
    setStatus('Loading data…', 'loading');
    fetch(API_URL + '?action=getDashboard&gid=' + encodeURIComponent(peUser.gid))
      .then(r => r.json())
      .then(res => {
        $('loader').style.display = 'none';
        if (!res.success) { setStatus(res.message || 'Failed to load data.', 'error'); return; }
        setStatus('', '');

        window._dashData = res;          // v9: global access for modals
        allPartners      = res.partners || [];
        window.allPartners = allPartners;

        buildFilters(res.filterOptions);
        applyFilters();
        renderKPIs(allPartners, 'kpiGrid');
        renderMyPartners(res.myPartners);
        renderTeam(res.teamBreakdown, res.amPerformance);
        renderAM(res.amPerformance);
      })
      .catch(e => {
        $('loader').style.display = 'none';
        setStatus('Connection error: ' + e.message, 'error');
      });
  }

  // ── Filters ──────────────────────────────────────────────────────
  function buildFilters(opts) {
    if (opts) {
      populateSelect($('filterZone'),  opts.zones  || [], 'All Zones');
      populateSelect($('filterState'), opts.states || [], 'All States');
      populateSelect($('filterOwner'), opts.owners || [], 'All Owners');
    } else {
      populateSelect($('filterZone'),  [...new Set(allPartners.map(p => p.zone).filter(Boolean))].sort(),  'All Zones');
      populateSelect($('filterState'), [...new Set(allPartners.map(p => p.state).filter(Boolean))].sort(), 'All States');
      populateSelect($('filterOwner'), [...new Set(allPartners.map(p => p.ownerName).filter(Boolean))].sort(), 'All Owners');
    }
  }
  function populateSelect(sel, vals, label) {
    if (!sel) return;
    sel.innerHTML = `<option value="">${label}</option>` +
      vals.map(v => `<option value="${safe(v)}">${safe(v)}</option>`).join('');
  }

  ['searchInput','filterZone','filterState','filterOwner'].forEach(id => {
    const el = $(id); if (!el) return;
    el.addEventListener('input',  applyFilters);
    el.addEventListener('change', applyFilters);
  });
  $('btnClear').addEventListener('click', () => {
    ['searchInput','filterZone','filterState','filterOwner'].forEach(id => { const el=$(id); if(el) el.value=''; });
    applyFilters();
  });

  function applyFilters() {
    const q     = ($('searchInput').value || '').toLowerCase();
    const zone  = ($('filterZone').value  || '');
    const state = ($('filterState').value || '');
    const owner = ($('filterOwner').value || '');
    filtered = allPartners.filter(p => {
      if (q && !((p.name||'').toLowerCase().includes(q) || (p.empId||p.gcd||p.gid||'').toLowerCase().includes(q))) return false;
      if (zone  && p.zone      !== zone)  return false;
      if (state && p.state     !== state) return false;
      if (owner && p.ownerName !== owner) return false;
      return true;
    });
    renderTable(filtered);
    renderKPIs(filtered, 'kpiGrid');
  }

  // ── All Partners Table (v9: VIEW button added) ────────────────────
  function renderTable(rows) {
    const tbody = $('partnerBody');
    const empty = $('tableEmpty');
    const count = $('tableCount');
    if (!rows.length) {
      tbody.innerHTML = '';
      if (empty) empty.style.display = 'block';
      if (count) count.textContent = '';
      return;
    }
    if (empty) empty.style.display = 'none';
    if (count) count.textContent = `Showing ${rows.length.toLocaleString('en-IN')} of ${allPartners.length.toLocaleString('en-IN')} partners`;

    tbody.innerHTML = rows.map((p, i) => {
      const m = mom(p), a = ach(p);
      const idx = allPartners.indexOf(p);
      return `<tr style="cursor:pointer" data-idx="${idx}">
        <td>${i + 1}</td>
        <td><strong>${safe(p.name)}</strong>${p.empId||p.gid ? `<br><small style="color:#94a3b8">${safe(p.empId||p.gid)}</small>` : ''}</td>
        <td>${safe(p.zone||'—')}</td>
        <td>${safe(p.state||'—')}</td>
        <td>${safe(p.city||'—')}</td>
        <td><span class="badge badge-gray">${safe(p.ownerRole||'—')}</span></td>
        <td>${safe(p.ownerName||'—')}</td>
        <td>${statusBadge(statusStr(p))}</td>
        <td>${p.uniqueStatus ? statusBadge(p.uniqueStatus) : '—'}</td>
        <td class="num-col">${fmtINR(ftd(p))}</td>
        <td class="num-col ${m>=0?'kpi-pos':'kpi-neg'}">${fmtINR(mtd(p))}</td>
        <td class="num-col">${fmtINR(lmtd(p))}</td>
        <td class="num-col ${m>=0?'kpi-pos':'kpi-neg'}">${m>=0?'+':''}${m.toFixed(1)}%</td>
        <td class="num-col">${fmtINR(net(p))}</td>
        <td class="num-col">${fmtINR(tgt(p))}</td>
        <td class="num-col ${a>=100?'kpi-pos':''}">${a.toFixed(1)}%</td>
        <td class="num-col">${fmtN(amon(p))}</td>
        <td class="num-col">${fmtINR(abiz(p))}</td>
        <td class="num-col">${fmtN(p.calls||0)}</td>
        <td class="num-col">${fmtN(p.visits||0)}</td>
        <td><button class="btn-view-sm" onclick="event.stopPropagation();openPartnerModal(window.allPartners[${idx}])">VIEW</button></td>
      </tr>`;
    }).join('');

    tbody.querySelectorAll('tr').forEach(tr => {
      tr.addEventListener('click', () => openPartnerModal(allPartners[+tr.dataset.idx]));
    });
  }

  // ── KPI Strip ────────────────────────────────────────────────────
  function renderKPIs(rows, gridId) {
    const el = $(gridId); if (!el) return;
    const total   = rows.length;
    const active  = rows.filter(p => p.isActive || (p.status||'').toLowerCase()==='active').length;
    const totFtd  = rows.reduce((s,p) => s + ftd(p),  0);
    const totMtd  = rows.reduce((s,p) => s + mtd(p),  0);
    const totLmt  = rows.reduce((s,p) => s + lmtd(p), 0);
    const totTgt  = rows.reduce((s,p) => s + tgt(p),  0);
    const totAch  = totTgt > 0 ? (totMtd / totTgt * 100).toFixed(1) : '0.0';
    const totMom  = totLmt > 0 ? ((totMtd - totLmt) / totLmt * 100).toFixed(1) : '0.0';
    const connected = rows.filter(p => p.connected).length;
    const growth    = rows.filter(p => p.isGrowth).length;

    el.innerHTML = `
      <div class="kpi-card"><div class="kpi-label">Total Partners</div><div class="kpi-value">${fmtN(total)}</div></div>
      <div class="kpi-card"><div class="kpi-label">Active</div><div class="kpi-value kpi-pos">${fmtN(active)}</div></div>
      <div class="kpi-card"><div class="kpi-label">FTD Business</div><div class="kpi-value">${fmtINR(totFtd)}</div></div>
      <div class="kpi-card"><div class="kpi-label">MTD Business</div><div class="kpi-value ${Number(totMom)>=0?'kpi-pos':'kpi-neg'}">${fmtINR(totMtd)}</div></div>
      <div class="kpi-card"><div class="kpi-label">LMTD Business</div><div class="kpi-value">${fmtINR(totLmt)}</div></div>
      <div class="kpi-card"><div class="kpi-label">Target (May)</div><div class="kpi-value">${fmtINR(totTgt)}</div></div>
      <div class="kpi-card"><div class="kpi-label">Achievement</div><div class="kpi-value ${Number(totAch)>=100?'kpi-pos':''}">${totAch}%</div></div>
      <div class="kpi-card"><div class="kpi-label">MoM%</div><div class="kpi-value ${Number(totMom)>=0?'kpi-pos':'kpi-neg'}">${Number(totMom)>=0?'+':''}${totMom}%</div></div>
      <div class="kpi-card"><div class="kpi-label">Connected</div><div class="kpi-value kpi-pos">${fmtN(connected)}</div></div>
      <div class="kpi-card"><div class="kpi-label">Growth</div><div class="kpi-value kpi-pos">${fmtN(growth)}</div></div>
    `;
  }

  // ── My Partners Tab (v9: VIEW button, works for AM too) ──────────
  function renderMyPartners(myPartners) {
    // v9: Code.gs now returns myPartners for AM users too
    const mine = (myPartners && myPartners.length) ? myPartners :
      allPartners.filter(p => (p.ownerName||'').toLowerCase() === (peUser.name||'').toLowerCase());

    renderKPIs(mine, 'myKpiGrid');
    const tbody = $('myBody'); if (!tbody) return;

    if (!mine.length) {
      tbody.innerHTML = `<tr><td colspan="14">
        <div class="empty-state">
          <div class="empty-state-icon">📋</div>
          <div class="empty-state-msg">No partners directly assigned to you</div>
          <div class="empty-state-sub">Partners appear here when you are the listed owner</div>
        </div></td></tr>`;
      return;
    }
    tbody.innerHTML = mine.map((p, i) => {
      const m = mom(p), a = ach(p);
      return `<tr style="cursor:pointer" onclick="openPartnerModal(window._dashData.myPartners[${i}]||window.allPartners[${allPartners.indexOf(p)}])">
        <td>${i+1}</td>
        <td><strong>${safe(p.name)}</strong>${p.gid?`<br><small style="color:#94a3b8">${safe(p.gid)}</small>`:''}</td>
        <td>${safe(p.zone||'—')}</td><td>${safe(p.state||'—')}</td><td>${safe(p.city||'—')}</td>
        <td class="num-col">${fmtINR(ftd(p))}</td>
        <td class="num-col ${mtd(p)>0?'kpi-pos':''}">${fmtINR(mtd(p))}</td>
        <td class="num-col">${fmtINR(lmtd(p))}</td>
        <td class="num-col ${m>=0?'kpi-pos':'kpi-neg'}">${m>=0?'+':''}${m.toFixed(1)}%</td>
        <td class="num-col">${fmtINR(tgt(p))}</td>
        <td class="num-col ${a>=100?'kpi-pos':''}">${a.toFixed(1)}%</td>
        <td class="num-col">${fmtN(p.calls||0)}</td>
        <td class="num-col">${fmtN(p.visits||0)}</td>
        <td><button class="btn-view-sm" onclick="event.stopPropagation();openPartnerModal(window._dashData.myPartners[${i}])">VIEW</button></td>
      </tr>`;
    }).join('');
  }

  // ── Team Breakdown Tab (v9: member cards with Details drill-down) ─
  function renderTeam(breakdown, amPerformance) {
    const container = $('teamContent'); if (!container) return;

    // Build unified member list
    const members  = [];
    const seenKeys = new Set();

    const addMember = (role, name, partnerCount, states, summary, partnerList) => {
      const key = role + '|' + name;
      if (seenKeys.has(key)) return;
      seenKeys.add(key);
      members.push({ role, name, partnerCount: partnerCount||0, states: states||[], summary: summary||{}, partnerList: partnerList||[] });
    };

    if (breakdown && breakdown.length) {
      breakdown.forEach(m => addMember(
        m.role || m.ownerRole || '—',
        m.name || m.ownerName || '—',
        m.partnerCount || (m.partnerList||[]).length,
        m.states || [],
        m.summary || {},
        m.partnerList || []
      ));
    }
    if (amPerformance && amPerformance.length) {
      amPerformance.forEach(m => addMember(
        'AM', m.name || '—',
        m.partnerCount || 0,
        m.states || [],
        m.summary || {},
        m.partnerList || []
      ));
    }

    // Fallback: derive from allPartners
    if (!members.length && allPartners.length) {
      const byOwner = {};
      allPartners.forEach(p => {
        const key = (p.ownerRole||'?') + '|' + (p.ownerName||'?');
        if (!byOwner[key]) byOwner[key] = { role:p.ownerRole||'?', name:p.ownerName||'?', partners:[], stateSet:new Set() };
        byOwner[key].partners.push(p);
        if (p.state) byOwner[key].stateSet.add(p.state);
      });
      Object.values(byOwner).forEach(m => {
        const pts = m.partners;
        const sumMtd  = pts.reduce((s,p)=>s+mtd(p),0);
        const sumLmtd = pts.reduce((s,p)=>s+lmtd(p),0);
        const sumTgt  = pts.reduce((s,p)=>s+tgt(p),0);
        const act     = pts.filter(p=>p.isActive).length;
        const conn    = pts.filter(p=>p.connected).length;
        addMember(m.role, m.name, pts.length, [...m.stateSet], {
          currentMonthPremium:  sumMtd, prevMonthPremium: sumLmtd,
          totalTarget:          sumTgt,
          achievementPct:       sumTgt>0?Math.round(sumMtd/sumTgt*100):0,
          momPct:               sumLmtd>0?Math.round((sumMtd-sumLmtd)/sumLmtd*100):0,
          totalMaxPotential:    pts.reduce((s,p)=>s+(p.maxPotential||0),0),
          totalOverallPotential:pts.reduce((s,p)=>s+(p.overallPotential||0),0),
          activeCount:          act, inactiveCount:pts.length-act,
          connectedCount:       conn,
          totalCalls:           pts.reduce((s,p)=>s+(p.calls||0),0),
          totalVisits:          pts.reduce((s,p)=>s+(p.visits||0),0)
        }, pts);
      });
      members.sort((a,b)=>(b.summary.currentMonthPremium||0)-(a.summary.currentMonthPremium||0));
    }

    _drillTeam = members;

    if (!members.length) {
      container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🏢</div><div class="empty-state-msg">No team data available</div></div>`;
      return;
    }

    container.innerHTML = `
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;align-items:center;">
        <input type="text" id="teamSearch" placeholder="Search member…" class="inline-search"/>
        <select id="teamRoleFilter" class="filter-select" style="min-width:110px;">
          <option value="">All Roles</option>
          <option value="ZH">ZH</option><option value="RH">RH</option>
          <option value="SH">SH</option><option value="RM">RM</option><option value="AM">AM</option>
        </select>
        <span id="teamCount" style="font-size:12px;color:#94a3b8;">${members.length} members</span>
      </div>
      <div class="team-cards-grid" id="teamCardsGrid"></div>
    `;

    renderMemberCards(members, 'teamCardsGrid', _drillTeam, openTeamDrill);

    const doFilter = () => {
      const q    = (document.getElementById('teamSearch').value||'').toLowerCase();
      const role = document.getElementById('teamRoleFilter').value;
      const vis  = _drillTeam.filter(m => {
        if (role && m.role !== role) return false;
        if (q && !(m.name||'').toLowerCase().includes(q)) return false;
        return true;
      });
      document.getElementById('teamCount').textContent = vis.length + ' members';
      renderMemberCards(vis, 'teamCardsGrid', _drillTeam, openTeamDrill);
    };
    document.getElementById('teamSearch').addEventListener('input', doFilter);
    document.getElementById('teamRoleFilter').addEventListener('change', doFilter);
  }

  // ── AM Performance Tab (v9: cards + drill-down) ───────────────────
  function renderAM(amData) {
    const container = $('amContent'); if (!container) return;

    let members = [];

    if (amData && amData.length) {
      members = amData.map(m => ({
        role: 'AM',
        name: m.name || m.ownerName || '—',
        zone: m.zone || (m.zones && m.zones[0]) || '',
        partnerCount: m.partnerCount || m.partners || m.count || 0,
        states: m.states || [],
        summary: m.summary || {
          currentMonthPremium:   m.mtd    || m.currentMonth || 0,
          prevMonthPremium:      m.lmtd   || m.prevMonth    || 0,
          totalTarget:           m.target || 0,
          achievementPct:        m.target > 0 ? Math.round((m.mtd||0)/m.target*100) : 0,
          momPct:                m.lmtd   > 0 ? Math.round(((m.mtd||0)-(m.lmtd||0))/(m.lmtd||1)*100) : 0,
          totalMaxPotential:     m.maxPot || 0,
          totalOverallPotential: m.overallPotential || 0,
          activeCount:           m.active || 0,
          inactiveCount:         (m.partnerCount||0) - (m.active||0),
          connectedCount:        m.connected || 0,
          totalCalls:            m.calls  || 0,
          totalVisits:           m.visits || 0
        },
        partnerList: m.partnerList || []
      }));
    } else {
      // Fallback: aggregate from allPartners
      const byAM = {};
      allPartners.filter(p => p.ownerRole === 'AM').forEach(p => {
        const n = p.ownerName || 'Unknown';
        if (!byAM[n]) byAM[n] = { name:n, zone:p.zone||'', stateSet:new Set(), partners:[] };
        byAM[n].partners.push(p);
        if (p.state) byAM[n].stateSet.add(p.state);
      });
      members = Object.values(byAM).map(m => {
        const pts = m.partners;
        const sumMtd  = pts.reduce((s,p)=>s+mtd(p),0);
        const sumLmtd = pts.reduce((s,p)=>s+lmtd(p),0);
        const sumTgt  = pts.reduce((s,p)=>s+tgt(p),0);
        const act     = pts.filter(p=>p.isActive).length;
        return {
          role:'AM', name:m.name, zone:m.zone, states:[...m.stateSet],
          partnerCount:pts.length,
          summary:{
            currentMonthPremium:  sumMtd, prevMonthPremium:sumLmtd,
            totalTarget:          sumTgt,
            achievementPct:       sumTgt>0?Math.round(sumMtd/sumTgt*100):0,
            momPct:               sumLmtd>0?Math.round((sumMtd-sumLmtd)/sumLmtd*100):0,
            totalMaxPotential:    pts.reduce((s,p)=>s+(p.maxPotential||0),0),
            totalOverallPotential:pts.reduce((s,p)=>s+(p.overallPotential||0),0),
            activeCount:          act, inactiveCount:pts.length-act,
            connectedCount:       pts.filter(p=>p.connected).length,
            totalCalls:           pts.reduce((s,p)=>s+(p.calls||0),0),
            totalVisits:          pts.reduce((s,p)=>s+(p.visits||0),0)
          },
          partnerList: pts
        };
      }).sort((a,b)=>(b.summary.currentMonthPremium||0)-(a.summary.currentMonthPremium||0));
    }

    _drillAM = members;

    if (!members.length) {
      container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📊</div><div class="empty-state-msg">No AM data available</div></div>`;
      return;
    }

    const zones = [...new Set(members.map(m=>m.zone).filter(Boolean))].sort();

    container.innerHTML = `
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;align-items:center;">
        <input type="text" id="amSearch" placeholder="Search AM name…" class="inline-search"/>
        <select id="amZoneFilter" class="filter-select" style="min-width:120px;">
          <option value="">All Zones</option>
          ${zones.map(z=>`<option value="${safe(z)}">${safe(z)}</option>`).join('')}
        </select>
        <span id="amCount" style="font-size:12px;color:#94a3b8;">${members.length} AMs</span>
      </div>
      <div class="team-cards-grid" id="amCardsGrid"></div>
    `;

    renderMemberCards(members, 'amCardsGrid', _drillAM, openAMDrill);

    const doFilter = () => {
      const q    = (document.getElementById('amSearch').value||'').toLowerCase();
      const zone = document.getElementById('amZoneFilter').value;
      const vis  = _drillAM.filter(m => {
        if (zone && m.zone !== zone) return false;
        if (q && !(m.name||'').toLowerCase().includes(q)) return false;
        return true;
      });
      document.getElementById('amCount').textContent = vis.length + ' AMs';
      renderMemberCards(vis, 'amCardsGrid', _drillAM, openAMDrill);
    };
    document.getElementById('amSearch').addEventListener('input', doFilter);
    document.getElementById('amZoneFilter').addEventListener('change', doFilter);
  }

  // ── Shared: render member cards grid ─────────────────────────────
  function renderMemberCards(members, containerId, sourceArr, drillFn) {
    const g = document.getElementById(containerId); if (!g) return;
    if (!members.length) {
      g.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🔍</div><div class="empty-state-msg">No members match filters</div></div>`;
      return;
    }
    g.innerHTML = members.map(m => {
      const s      = m.summary || {};
      const mom_v  = s.momPct || 0;
      const momCls = mom_v > 0 ? 'kpi-pos' : mom_v < 0 ? 'kpi-neg' : '';
      const ach_v  = s.achievementPct || 0;
      const stSt   = (m.states||[]).slice(0,3).join(', ') + ((m.states||[]).length>3?` +${(m.states||[]).length-3}`:'');
      const srcIdx = sourceArr.indexOf(m);
      const fnName = drillFn === openTeamDrill ? 'openTeamDrill' : 'openAMDrill';
      return `<div class="team-member-card">
        <div class="tmc-header">
          <div class="tmc-title-wrap">
            <div class="tmc-name">${safe(m.name)}</div>
            <div class="tmc-sub">${safe(m.role)} &bull; ${fmtN(m.partnerCount)} partner${m.partnerCount!==1?'s':''} &bull; ${safe(stSt||m.zone||'—')}</div>
          </div>
          <button class="btn-details" onclick="${fnName}(${srcIdx})">Details</button>
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

  // ── Partner list table for drill modals ──────────────────────────
  function buildPartnerDrillTable(partners) {
    if (!partners || !partners.length) {
      return `<div class="empty-state"><div class="empty-state-icon">📋</div><div class="empty-state-msg">No partner details available — refresh data</div></div>`;
    }
    return `<div class="table-wrap" style="margin-top:14px;">
      <table class="data-table" style="min-width:900px;">
        <thead><tr>
          <th>#</th><th>Partner</th><th>City/State</th>
          <th class="num-col">Max Pot.</th>
          <th class="num-col">MTD</th><th class="num-col">LMTD</th><th class="num-col">MoM%</th>
          <th class="num-col">Target</th><th class="num-col">Ach%</th>
          <th>Status</th><th>Growth</th>
          <th class="num-col">Calls</th><th class="num-col">Visits</th>
          <th>Action</th>
        </tr></thead>
        <tbody>${partners.map((p, i) => {
          const pm  = p.prevMonth > 0 ? ((p.currentMonth-p.prevMonth)/p.prevMonth*100) : 0;
          const pa  = p.target    > 0 ? (p.currentMonth/p.target*100) : 0;
          const pmC = pm>=0?'kpi-pos':'kpi-neg';
          return `<tr>
            <td>${i+1}</td>
            <td><strong>${safe(p.name)}</strong><br><small style="color:#94a3b8">${safe(p.gid||p.empId||'')}</small></td>
            <td>${safe(p.city||'—')}, ${safe(p.state||'—')}</td>
            <td class="num-col">${fmtINR(p.maxPotential||0)}</td>
            <td class="num-col ${p.currentMonth>0?'kpi-pos':''}">${fmtINR(p.currentMonth||0)}</td>
            <td class="num-col">${fmtINR(p.prevMonth||0)}</td>
            <td class="num-col ${pmC}">${pm>=0?'▲ +':'▼ '}${pm.toFixed(1)}%</td>
            <td class="num-col">${fmtINR(p.target||0)}</td>
            <td class="num-col ${pa>=100?'kpi-pos':''}">${pa.toFixed(1)}%</td>
            <td><span class="badge ${p.isActive?'badge-green':'badge-red'}">${p.isActive?'Active':'Inactive'}</span></td>
            <td><span class="badge ${p.isGrowth?'badge-green':'badge-red'}">${p.isGrowth?'▲ Growth':'▼ Degrowth'}</span></td>
            <td class="num-col">${fmtN(p.calls||0)}</td>
            <td class="num-col">${fmtN(p.visits||0)}</td>
            <td><button class="btn-view-sm" onclick="openPartnerModal(${JSON.stringify(p).replace(/"/g,'&quot;')})">VIEW</button></td>
          </tr>`;
        }).join('')}</tbody>
      </table>
    </div>`;
  }

  // ── Team Drill Modal ─────────────────────────────────────────────
  window.openTeamDrill = function(idx) {
    const m = _drillTeam[idx]; if (!m) return;
    const s = m.summary || {};
    const mom_v = s.momPct || 0;
    $('modalTitle').textContent = m.name + ' — ' + m.role + ' Details';
    $('modalBody').innerHTML = `
      <div class="modal-kpi-grid" style="margin-bottom:16px;">
        <div class="modal-kpi"><div class="modal-kpi-label">Role</div><div class="modal-kpi-val">${safe(m.role)}</div></div>
        <div class="modal-kpi"><div class="modal-kpi-label">Partners</div><div class="modal-kpi-val">${fmtN(m.partnerCount)}</div></div>
        <div class="modal-kpi"><div class="modal-kpi-label">MTD</div><div class="modal-kpi-val ${(s.currentMonthPremium||0)>0?'kpi-pos':''}">${fmtINR(s.currentMonthPremium||0)}</div></div>
        <div class="modal-kpi"><div class="modal-kpi-label">LMTD</div><div class="modal-kpi-val">${fmtINR(s.prevMonthPremium||0)}</div></div>
        <div class="modal-kpi"><div class="modal-kpi-label">MoM%</div><div class="modal-kpi-val ${mom_v>=0?'kpi-pos':'kpi-neg'}">${mom_v>=0?'+':''}${mom_v}%</div></div>
        <div class="modal-kpi"><div class="modal-kpi-label">Ach%</div><div class="modal-kpi-val">${s.achievementPct||0}%</div></div>
      </div>
      <div style="font-size:12px;color:#64748b;margin-bottom:8px;"><strong>States:</strong> ${(m.states||[]).join(', ')||'—'}</div>
      ${buildPartnerDrillTable(m.partnerList)}
    `;
    $('modal').style.display = 'flex';
  };

  // ── AM Drill Modal ───────────────────────────────────────────────
  window.openAMDrill = function(idx) {
    const m = _drillAM[idx]; if (!m) return;
    const s = m.summary || {};
    const mom_v = s.momPct || 0;
    $('modalTitle').textContent = m.name + ' — AM Partner Details';
    $('modalBody').innerHTML = `
      <div class="modal-kpi-grid" style="margin-bottom:16px;">
        <div class="modal-kpi"><div class="modal-kpi-label">Zone</div><div class="modal-kpi-val">${safe(m.zone||'—')}</div></div>
        <div class="modal-kpi"><div class="modal-kpi-label">Partners</div><div class="modal-kpi-val">${fmtN(m.partnerCount)}</div></div>
        <div class="modal-kpi"><div class="modal-kpi-label">MTD</div><div class="modal-kpi-val ${(s.currentMonthPremium||0)>0?'kpi-pos':''}">${fmtINR(s.currentMonthPremium||0)}</div></div>
        <div class="modal-kpi"><div class="modal-kpi-label">LMTD</div><div class="modal-kpi-val">${fmtINR(s.prevMonthPremium||0)}</div></div>
        <div class="modal-kpi"><div class="modal-kpi-label">MoM%</div><div class="modal-kpi-val ${mom_v>=0?'kpi-pos':'kpi-neg'}">${mom_v>=0?'+':''}${mom_v}%</div></div>
        <div class="modal-kpi"><div class="modal-kpi-label">Ach%</div><div class="modal-kpi-val">${s.achievementPct||0}%</div></div>
        <div class="modal-kpi"><div class="modal-kpi-label">Active</div><div class="modal-kpi-val kpi-pos">${fmtN(s.activeCount||0)}</div></div>
        <div class="modal-kpi"><div class="modal-kpi-label">Connected</div><div class="modal-kpi-val kpi-pos">${fmtN(s.connectedCount||0)}</div></div>
        <div class="modal-kpi"><div class="modal-kpi-label">Max Pot.</div><div class="modal-kpi-val">${fmtINR(s.totalMaxPotential||0)}</div></div>
      </div>
      <div style="font-size:12px;color:#64748b;margin-bottom:8px;"><strong>States:</strong> ${(m.states||[]).join(', ')||'—'}</div>
      ${buildPartnerDrillTable(m.partnerList)}
    `;
    $('modal').style.display = 'flex';
  };

  // ── Partner Modal (v9: 14-month trend chart) ─────────────────────
  window.openPartnerModal = function(p) {
    if (!p) return;
    if (typeof p === 'string') { try { p = JSON.parse(p); } catch(e) { return; } }
    $('modalTitle').textContent = p.name || 'Partner Details';
    const m = mom(p), a = ach(p);
    const monthlyData   = p.monthlyData || [];
    const monthlyLabels = p.monthLabels || (window._dashData && window._dashData.monthLabels) || [];

    $('modalBody').innerHTML = `
      <div class="modal-section">
        <div class="modal-section-title">Partner Info</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:13px;">
          <div><span style="color:#94a3b8">GID / ID:</span> <strong>${safe(p.gid||p.empId||'—')}</strong></div>
          <div><span style="color:#94a3b8">Zone:</span> <strong>${safe(p.zone||'—')}</strong></div>
          <div><span style="color:#94a3b8">State:</span> <strong>${safe(p.state||'—')}</strong></div>
          <div><span style="color:#94a3b8">City:</span> <strong>${safe(p.city||'—')}</strong></div>
          <div><span style="color:#94a3b8">Status:</span> ${statusBadge(statusStr(p))}</div>
          <div><span style="color:#94a3b8">Growth:</span> <span class="${p.isGrowth?'kpi-pos':'kpi-neg'}">${p.isGrowth?'▲ Growth':'▼ Degrowth'}</span></div>
          <div><span style="color:#94a3b8">Owner:</span> <strong>${safe(p.ownerName||'—')} <span class="badge badge-gray" style="font-size:10px;">${safe(p.ownerRole||'')}</span></strong></div>
          <div><span style="color:#94a3b8">Connected:</span> <span class="${p.connected?'kpi-pos':'kpi-neg'}">${p.connected?'✓ Yes':'✗ No'}</span></div>
        </div>
      </div>

      <div class="modal-section">
        <div class="modal-section-title">Business Performance</div>
        <div class="modal-kpi-grid">
          <div class="modal-kpi"><div class="modal-kpi-label">FTD</div><div class="modal-kpi-val">${fmtINR(ftd(p))}</div></div>
          <div class="modal-kpi"><div class="modal-kpi-label">MTD (May'26)</div><div class="modal-kpi-val ${mtd(p)>0?'kpi-pos':mtd(p)<0?'kpi-neg':''}">${fmtINR(mtd(p))}</div></div>
          <div class="modal-kpi"><div class="modal-kpi-label">LMTD (Apr'26)</div><div class="modal-kpi-val">${fmtINR(lmtd(p))}</div></div>
          <div class="modal-kpi"><div class="modal-kpi-label">MoM%</div><div class="modal-kpi-val ${m>=0?'kpi-pos':'kpi-neg'}">${m>=0?'+':''}${m.toFixed(1)}%</div></div>
          <div class="modal-kpi"><div class="modal-kpi-label">Max Potential</div><div class="modal-kpi-val">${fmtINR(p.maxPotential||0)}</div></div>
          <div class="modal-kpi"><div class="modal-kpi-label">Overall Pot.</div><div class="modal-kpi-val">${fmtINR(p.overallPotential||0)}</div></div>
          <div class="modal-kpi"><div class="modal-kpi-label">Target (May)</div><div class="modal-kpi-val">${p.target>0?fmtINR(p.target):'Not set'}</div></div>
          <div class="modal-kpi"><div class="modal-kpi-label">Achievement</div><div class="modal-kpi-val ${a>=100?'kpi-pos':''}">${a.toFixed(1)}%</div></div>
          <div class="modal-kpi"><div class="modal-kpi-label">Calls / Visits</div><div class="modal-kpi-val">${fmtN(p.calls||0)} / ${fmtN(p.visits||0)}</div></div>
        </div>
      </div>

      ${monthlyData.length ? `
      <div class="modal-section">
        <div class="modal-section-title">14-Month Business Trend</div>
        <canvas id="modalTrendChart" height="180" style="width:100%;"></canvas>
      </div>` : ''}

      ${p.remark ? `
      <div class="modal-section">
        <div class="modal-section-title">Remark</div>
        <p style="font-size:13px;color:#475569;background:#f8fafc;padding:10px;border-radius:8px;">${safe(p.remark)}</p>
      </div>` : ''}
    `;

    // Render 14-month trend chart
    if (monthlyData.length && typeof Chart !== 'undefined') {
      if (_trendChart) { try { _trendChart.destroy(); } catch(e){} _trendChart = null; }
      const ctx = document.getElementById('modalTrendChart');
      if (ctx) {
        const labels = monthlyLabels.length ? monthlyLabels : monthlyData.map((_,i) => 'M'+(i+1));
        _trendChart = new Chart(ctx, {
          type: 'line',
          data: {
            labels,
            datasets: [{
              label:                'Business (₹)',
              data:                 monthlyData,
              borderColor:         '#3b82f6',
              backgroundColor:     'rgba(59,130,246,0.08)',
              pointBackgroundColor:'#3b82f6',
              pointRadius:          4,
              pointHoverRadius:     6,
              fill:                 true,
              tension:              0.35
            }]
          },
          options: {
            responsive: true,
            plugins: {
              legend: { display: false },
              tooltip: { callbacks: { label: c => fmtINR(c.parsed.y) } }
            },
            scales: {
              y: {
                beginAtZero: true,
                ticks: {
                  callback: v =>
                    v >= 1e7 ? '₹'+(v/1e7).toFixed(1)+'Cr' :
                    v >= 1e5 ? '₹'+(v/1e5).toFixed(1)+'L'  :
                    v >= 1e3 ? '₹'+(v/1e3).toFixed(0)+'K'  : '₹'+v
                }
              }
            }
          }
        });
      }
    }

    $('modal').style.display = 'flex';
  };

  // Keep backward compat (some inline onclick calls use openModal)
  window.openModal = window.openPartnerModal;

  // ── Modal close ──────────────────────────────────────────────────
  function closeModal() {
    $('modal').style.display = 'none';
    if (_trendChart) { try { _trendChart.destroy(); } catch(e){} _trendChart = null; }
  }
  $('modalClose').addEventListener('click', closeModal);
  $('modal').addEventListener('click', e => { if (e.target === $('modal')) closeModal(); });

  // ── Start ────────────────────────────────────────────────────────
  load();

})();
