// =============================================
// Partner Engage Portal v3 — InsuranceDekho
// app.js
// =============================================

const MONTHS_13 = ["Apr'25","May'25","Jun'25","Jul'25","Aug'25","Sep'25",
                    "Oct'25","Nov'25","Dec'25","Jan'26","Feb'26","Mar'26","Apr'26"];
const CURRENT_MONTH_LABEL = "May'26";
const ROLE_LEVEL = { ZH:5, RH:4, SH:3, RM:2, AM:1 };

let allPartners  = [];
let myPartners   = [];
let teamBreakdown = [];
let currentUser  = null;
let modalPartnerIndex = null;
let trendChartInstance = null;

// ─── SHA-256 ──────────────────────────────────────────────────
async function sha256(msg) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

// ─── API ──────────────────────────────────────────────────────
async function callAPI(params) {
  const url = new URL(API_URL);
  Object.entries(params).forEach(([k,v]) => url.searchParams.append(k,v));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error('Network error ' + res.status);
  return res.json();
}

// ─── Number helpers ──────────────────────────────────────────
function parseNum(v) {
  if (!v && v !== 0) return 0;
  return parseFloat(String(v).replace(/[₹,%\s,]/g,'')) || 0;
}
function fmtINR(n) {
  n = Math.round(parseNum(n));
  if (n >= 10000000) return '₹' + (n/10000000).toFixed(2) + 'Cr';
  if (n >= 100000)   return '₹' + (n/100000).toFixed(2) + 'L';
  if (n >= 1000)     return '₹' + (n/1000).toFixed(1) + 'K';
  return '₹' + n.toLocaleString('en-IN');
}
function fmtFull(n) {
  return '₹' + Math.round(parseNum(n)).toLocaleString('en-IN');
}
function pctColor(pct) {
  if (pct >= 75) return 'green';
  if (pct >= 40) return 'amber';
  return 'red';
}
function momBadge(curr, prev) {
  if (prev <= 0) return curr > 0 ? '<span class="mom-up">▲ New</span>' : '—';
  const pct = ((curr - prev) / prev * 100).toFixed(1);
  return parseFloat(pct) >= 0
    ? `<span class="mom-up">▲ +${pct}%</span>`
    : `<span class="mom-down">▼ ${pct}%</span>`;
}
function initials(name) {
  return (name||'--').trim().split(/\s+/).map(w=>w[0]).join('').toUpperCase().slice(0,2);
}

// ─── Session ─────────────────────────────────────────────────
function saveSession(u) { sessionStorage.setItem('pe_user', JSON.stringify(u)); }
function loadSession()  { const r=sessionStorage.getItem('pe_user'); return r?JSON.parse(r):null; }
function clearSession() { sessionStorage.removeItem('pe_user'); }
function logout()       { clearSession(); window.location.href='index.html'; }

// =============================================
// LOGIN PAGE
// =============================================
let loginGid = '';

async function checkGid() {
  const gid = (document.getElementById('gidInput').value||'').trim().toUpperCase();
  if (!gid) { showErr('gidError','Please enter your User ID.'); return; }
  setBusy('gidBtnText','gidSpinner',true);
  hideErr('gidError');
  try {
    const data = await callAPI({ action:'checkPassword', gid });
    if (!data.success) { showErr('gidError', data.message); return; }
    loginGid = gid;
    document.getElementById('stepGid').style.display = 'none';
    if (data.hasPassword) {
      document.getElementById('stepPassword').style.display = 'block';
      document.getElementById('passwordUserLabel').textContent = 'Signing in as: ' + gid;
      document.getElementById('passwordInput').focus();
    } else {
      document.getElementById('stepSetPassword').style.display = 'block';
      document.getElementById('setPasswordUserLabel').textContent = 'First login — set password for: ' + gid;
      document.getElementById('newPassword1').focus();
    }
  } catch(e) { showErr('gidError','Connection error. Check config.js URL.'); }
  finally     { setBusy('gidBtnText','gidSpinner',false); }
}

async function doLogin() {
  const pw = document.getElementById('passwordInput').value;
  if (!pw) { showErr('passwordError','Enter your password.'); return; }
  setBusy('loginBtnText','loginSpinner',true); hideErr('passwordError');
  try {
    const data = await callAPI({ action:'login', gid:loginGid, password: await sha256(pw) });
    if (data.success) { saveSession(data.user); window.location.href='dashboard.html'; }
    else showErr('passwordError', data.message||'Incorrect password.');
  } catch(e) { showErr('passwordError','Connection error.'); }
  finally     { setBusy('loginBtnText','loginSpinner',false); }
}

async function doSetPassword(isChange) {
  const p1 = isChange ? document.getElementById('changePassword1') : document.getElementById('newPassword1');
  const p2 = isChange ? document.getElementById('changePassword2') : document.getElementById('newPassword2');
  const eId = isChange ? 'changePasswordError' : 'setPasswordError';
  const sId = isChange ? 'changePasswordSuccess' : 'setPasswordSuccess';
  const bt  = isChange ? 'changeBtnText' : 'setPasswordBtnText';
  const bs  = isChange ? 'changeSpinner' : 'setPasswordSpinner';
  hideErr(eId); hideErr(sId);
  if (!p1.value || p1.value.length < 6) { showErr(eId,'At least 6 characters.'); return; }
  if (p1.value !== p2.value) { showErr(eId,'Passwords do not match.'); return; }
  let oldHash = '';
  if (isChange) {
    const op = document.getElementById('oldPassword').value;
    if (!op) { showErr(eId,'Enter current password.'); return; }
    oldHash = await sha256(op);
  }
  const newHash = await sha256(p1.value);
  setBusy(bt,bs,true);
  try {
    const data = await callAPI({ action:'setPassword', gid:loginGid, oldPassword:oldHash, newPassword:newHash });
    if (data.success) {
      document.getElementById(sId).textContent = 'Password set! Signing you in…';
      document.getElementById(sId).style.display = 'block';
      await delay(800);
      const ld = await callAPI({ action:'login', gid:loginGid, password:newHash });
      if (ld.success) { saveSession(ld.user); window.location.href='dashboard.html'; }
    } else showErr(eId, data.message);
  } catch(e) { showErr(eId,'Connection error.'); }
  finally     { setBusy(bt,bs,false); }
}

function goBack() {
  ['stepPassword','stepSetPassword','stepChangePassword'].forEach(id => {
    const el = document.getElementById(id); if (el) el.style.display='none';
  });
  document.getElementById('stepGid').style.display='block';
  document.getElementById('gidInput').focus();
}
function showForgotFlow() {
  document.getElementById('stepPassword').style.display='none';
  document.getElementById('stepChangePassword').style.display='block';
  document.getElementById('changePasswordUserLabel').textContent='Changing password for: '+loginGid;
}

// =============================================
// DASHBOARD PAGE
// =============================================
async function initDashboard() {
  currentUser = loadSession();
  if (!currentUser) { window.location.href='index.html'; return; }

  document.getElementById('userAvatar').textContent = initials(currentUser.name);
  document.getElementById('userName').textContent   = currentUser.name;
  document.getElementById('userRole').textContent   = currentUser.role + ' · ' + currentUser.zone;

  const level = ROLE_LEVEL[currentUser.role]||0;
  if (level > 1) {
    document.getElementById('tabTeam').style.display = 'block';
    document.getElementById('tabMine').style.display = 'block';
  }

  try {
    const data = await callAPI({ action:'getDashboard', gid:currentUser.gid });
    if (!data.success) throw new Error(data.message);
    allPartners   = data.partners  || [];
    myPartners    = data.myPartners || [];
    teamBreakdown = data.teamBreakdown || [];

    renderSummaryCards(data.summary, 'summaryCards');
    renderTable(allPartners, 'partnerBody', 'tableFooter', true);
    buildFilters(allPartners);

    if (level > 1) {
      renderSummaryCards(buildMiniSummary(myPartners), 'mySummaryCards');
      renderMyTable(myPartners);
      renderTeamTab(teamBreakdown);
    }
  } catch(err) {
    document.getElementById('partnerBody').innerHTML =
      `<tr><td colspan="13" class="loading-row" style="color:var(--red)">Error: ${err.message}</td></tr>`;
  }
}

// ─── TABS ─────────────────────────────────────────────────────
function switchTab(tab) {
  ['all','mine','team'].forEach(t => {
    document.getElementById('panel'+cap(t)).style.display = t===tab?'block':'none';
    document.getElementById('tab'+cap(t)).classList.toggle('active', t===tab);
  });
}
function cap(s) { return s.charAt(0).toUpperCase()+s.slice(1); }

// ─── SUMMARY CARDS ────────────────────────────────────────────
function renderSummaryCards(s, containerId) {
  if (!s) return;
  const curr = s.currentMonthPremium||0, prev = s.prevMonthPremium||0;
  const mom = prev>0 ? ((curr-prev)/prev*100).toFixed(1) : null;
  const momB = mom !== null
    ? `<div class="sc-badge ${parseFloat(mom)>=0?'up':'down'}">${parseFloat(mom)>=0?'▲':'▼'} ${Math.abs(mom)}% MoM</div>`
    : '';
  const achPct = s.totalTarget>0 ? Math.round(curr/s.totalTarget*100) : 0;
  const achCls = pctColor(achPct);

  const cards = [
    { label:'👥 Partners',          val: s.totalPartners,           cls:'' },
    { label:'💰 Potential',         val: fmtINR(s.totalPotential),  cls:'' },
    { label:'🎯 Target (May)',       val: fmtINR(s.totalTarget),     cls:'' },
    { label:'📅 MTD ('+CURRENT_MONTH_LABEL+')', val: fmtINR(curr), cls:'', badge: momB },
    { label:'📅 LMTD (Apr\'26)',     val: fmtINR(prev),              cls:'' },
    { label:'🏆 Target Ach.',        val: achPct+'%',                cls:achCls },
    { label:'✅ Active',             val: s.activeCount,             cls:'green' },
    { label:'📈 Growth',             val: s.growthCount,             cls:'green' },
  ];

  document.getElementById(containerId).innerHTML = cards.map(c=>`
    <div class="summary-card">
      <div class="sc-label">${c.label}</div>
      <div class="sc-value ${c.cls}">${c.val}</div>
      ${c.badge||''}
    </div>`).join('');
}

function buildMiniSummary(pts) {
  if (!pts || !pts.length) return { totalPartners:0, totalPotential:0, totalTarget:0,
    currentMonthPremium:0, prevMonthPremium:0, activeCount:0, growthCount:0 };
  return {
    totalPartners: pts.length,
    totalPotential: pts.reduce((s,p)=>s+parseNum(p.overallPot),0),
    totalTarget: pts.reduce((s,p)=>s+parseNum(p.target),0),
    currentMonthPremium: pts.reduce((s,p)=>s+parseNum(p.currentMonth),0),
    prevMonthPremium: pts.reduce((s,p)=>s+parseNum(p.prevMonth),0),
    activeCount: pts.filter(p=>p.isActive).length,
    growthCount: pts.filter(p=>p.isGrowth).length
  };
}

// ─── BUILD FILTERS ────────────────────────────────────────────
function buildFilters(partners) {
  const states = [...new Set(partners.map(p=>p.state).filter(Boolean))].sort();
  const stateEl = document.getElementById('stateFilter');
  stateEl.innerHTML = '<option value="">All states</option>' +
    states.map(s=>`<option value="${s}">${s}</option>`).join('');

  const level = ROLE_LEVEL[currentUser.role]||0;
  if (level > 1) {
    const owners = [...new Set(partners.map(p=>p.ownerName).filter(Boolean))].sort();
    const ownerEl = document.getElementById('ownerFilter');
    ownerEl.style.display = 'block';
    ownerEl.innerHTML = '<option value="">All owners</option>' +
      owners.map(o=>`<option value="${o}">${o}</option>`).join('');
  }
}

// ─── RENDER PARTNER TABLE ─────────────────────────────────────
function renderTable(partners, bodyId, footerId, showOwner) {
  const tbody  = document.getElementById(bodyId);
  const footer = document.getElementById(footerId);
  if (!partners || !partners.length) {
    tbody.innerHTML = '<tr><td colspan="13" class="loading-row">No partners found.</td></tr>';
    if (footer) footer.textContent=''; return;
  }

  tbody.innerHTML = partners.map((p,i) => {
    const curr   = parseNum(p.currentMonth);
    const prev   = parseNum(p.prevMonth);
    const target = parseNum(p.target);
    const pot    = parseNum(p.overallPot);
    const achPct = target>0 ? Math.min(Math.round(curr/target*100),999) : 0;
    const achCls = pctColor(achPct);
    const momVal = prev>0 ? ((curr-prev)/prev*100).toFixed(1) : null;
    const momCls = momVal===null ? '' : parseFloat(momVal)>=0?'mom-up':'mom-down';
    const momStr = momVal===null ? '—' : `<span class="${momCls}">${parseFloat(momVal)>=0?'▲ +':'▼ '}${momVal}%</span>`;
    const connectBadge = p.connected
      ? '<span class="badge active" style="font-size:10px">✓ Connected</span>'
      : '<span class="badge inactive" style="font-size:10px">✗ Not yet</span>';

    const ownerShort = (p.ownerRole||'') + (p.ownerName ? ': ' + p.ownerName.split(' ')[0] : '');

    return `<tr>
      <td><div class="partner-name" title="${p.name}">${p.name}</div><div class="partner-gid">${p.gid}</div></td>
      <td><div class="city-text">${p.city||'—'}</div><div class="state-text">${p.state||''}</div></td>
      ${showOwner ? `<td><div class="owner-text" title="${p.ownerRole}: ${p.ownerName}">${ownerShort}</div></td>` : ''}
      <td>${fmtINR(pot)}</td>
      <td>${target>0?fmtINR(target):'—'}</td>
      <td><strong>${fmtINR(curr)}</strong></td>
      <td>${fmtINR(prev)}</td>
      <td>${momStr}</td>
      <td>
        <div class="progress-wrap">
          <div class="progress-bar"><div class="progress-fill ${achCls}" style="width:${Math.min(achPct,100)}%"></div></div>
          <span class="pct-label ${achCls}">${achPct}%</span>
        </div>
        <div style="font-size:10px;color:var(--gray-400);margin-top:2px">${fmtINR(curr)} / ${target>0?fmtINR(target):'—'}</div>
      </td>
      <td>${p.isGrowth?'<span class="badge growth">▲ Growth</span>':'<span class="badge degrowth">▼ Degrowth</span>'}</td>
      <td>${p.isActive?'<span class="badge active">Active</span>':'<span class="badge inactive">Inactive</span>'}</td>
      <td>${connectBadge}</td>
      <td><button class="btn-view" onclick="openModal(${i}, '${bodyId}')">View</button></td>
    </tr>`;
  }).join('');

  if (footer) footer.textContent = `Showing ${partners.length} partner${partners.length!==1?'s':''}`;
}

// ─── MY PARTNERS TABLE ────────────────────────────────────────
function renderMyTable(partners) {
  const tbody  = document.getElementById('myPartnerBody');
  const footer = document.getElementById('myTableFooter');
  if (!partners || !partners.length) {
    tbody.innerHTML = '<tr><td colspan="11" class="loading-row">No directly assigned partners.</td></tr>';
    return;
  }
  tbody.innerHTML = partners.map((p,i) => {
    const curr   = parseNum(p.currentMonth);
    const prev   = parseNum(p.prevMonth);
    const target = parseNum(p.target);
    const pot    = parseNum(p.overallPot);
    const achPct = target>0 ? Math.min(Math.round(curr/target*100),999) : 0;
    const achCls = pctColor(achPct);
    const momVal = prev>0 ? ((curr-prev)/prev*100).toFixed(1) : null;
    const momStr = momVal===null ? '—' : `<span class="${parseFloat(momVal)>=0?'mom-up':'mom-down'}">${parseFloat(momVal)>=0?'▲ +':'▼ '}${momVal}%</span>`;
    return `<tr>
      <td><div class="partner-name">${p.name}</div><div class="partner-gid">${p.gid}</div></td>
      <td><div class="city-text">${p.city||'—'}</div><div class="state-text">${p.state||''}</div></td>
      <td>${fmtINR(pot)}</td>
      <td>${target>0?fmtINR(target):'—'}</td>
      <td><strong>${fmtINR(curr)}</strong></td>
      <td>${fmtINR(prev)}</td>
      <td>${momStr}</td>
      <td>
        <div class="progress-wrap">
          <div class="progress-bar"><div class="progress-fill ${achCls}" style="width:${Math.min(achPct,100)}%"></div></div>
          <span class="pct-label ${achCls}">${achPct}%</span>
        </div>
      </td>
      <td>${p.isGrowth?'<span class="badge growth">▲ Growth</span>':'<span class="badge degrowth">▼ Degrowth</span>'}</td>
      <td>${p.isActive?'<span class="badge active">Active</span>':'<span class="badge inactive">Inactive</span>'}</td>
      <td><button class="btn-view" onclick="openModal(${i}, 'myPartnerBody')">View</button></td>
    </tr>`;
  }).join('');
  if (footer) footer.textContent = `${partners.length} assigned partner${partners.length!==1?'s':''}`;
}

// ─── FILTERS ─────────────────────────────────────────────────
function applyFilters() {
  const search  = document.getElementById('searchInput').value.toLowerCase();
  const state   = document.getElementById('stateFilter').value;
  const status  = document.getElementById('statusFilter').value;
  const trend   = document.getElementById('trendFilter').value;
  const owner   = document.getElementById('ownerFilter').value;
  const connect = document.getElementById('connectFilter').value;

  const filtered = allPartners.filter(p => {
    const ms = !search || (p.name||'').toLowerCase().includes(search) ||
               (p.gid||'').toLowerCase().includes(search) || (p.city||'').toLowerCase().includes(search);
    const mst = !state  || p.state === state;
    const mss = !status || (status==='active'?p.isActive:!p.isActive);
    const mt  = !trend  || (trend==='growth'?p.isGrowth:!p.isGrowth);
    const mo  = !owner  || p.ownerName === owner;
    const mc  = !connect|| (connect==='connected'?p.connected:!p.connected);
    return ms && mst && mss && mt && mo && mc;
  });
  renderTable(filtered, 'partnerBody', 'tableFooter', true);
}

// ─── TEAM TAB ────────────────────────────────────────────────
function renderTeamTab(breakdown) {
  const grid = document.getElementById('teamGrid');
  if (!breakdown || !breakdown.length) {
    grid.innerHTML = '<p style="color:var(--gray-400);font-size:13px">No team data available.</p>';
    return;
  }
  document.getElementById('teamLabel').textContent = 'Team Performance — ' + breakdown.length + ' members';

  grid.innerHTML = breakdown.map((m, idx) => {
    const s    = m.summary;
    const curr = s.currentMonthPremium||0;
    const tgt  = s.totalTarget||0;
    const achPct = tgt>0 ? Math.min(Math.round(curr/tgt*100),999) : 0;
    const achCls = pctColor(achPct);
    const prev = s.prevMonthPremium||0;
    const mom  = prev>0 ? ((curr-prev)/prev*100).toFixed(1) : null;
    const momStr = mom!==null
      ? `<span style="font-size:11px;font-weight:600;color:${parseFloat(mom)>=0?'var(--green)':'var(--red)'}">${parseFloat(mom)>=0?'▲ +':'▼ '}${mom}%</span>`
      : '';

    const roleCls = (m.role||'am').toLowerCase();
    const remarkCount = (m.partners||[]).filter(p=>p.remark&&p.remark.trim()).length;

    return `
      <div class="team-card">
        <div class="team-card-header">
          <div class="team-avatar ${roleCls}">${initials(m.name)}</div>
          <div style="flex:1">
            <div class="team-card-name">${m.name}</div>
            <div class="team-card-role">${m.role} · ${s.totalPartners} partners · ${momStr}</div>
          </div>
          <button class="btn-view" style="align-self:flex-start" onclick="openTeamModal(${idx})">Details</button>
        </div>
        <div class="team-stats">
          <div class="team-stat">
            <div class="team-stat-val">${fmtINR(curr)}</div>
            <div class="team-stat-lbl">MTD</div>
          </div>
          <div class="team-stat">
            <div class="team-stat-val">${tgt>0?fmtINR(tgt):'—'}</div>
            <div class="team-stat-lbl">Target</div>
          </div>
          <div class="team-stat">
            <div class="team-stat-val green">${s.activeCount||0}</div>
            <div class="team-stat-lbl">Active</div>
          </div>
          <div class="team-stat">
            <div class="team-stat-val green">${s.growthCount||0}</div>
            <div class="team-stat-lbl">Growth</div>
          </div>
          <div class="team-stat">
            <div class="team-stat-val">${s.connectedCount||0}</div>
            <div class="team-stat-lbl">Connected</div>
          </div>
          <div class="team-stat">
            <div class="team-stat-val">${remarkCount}</div>
            <div class="team-stat-lbl">Remarks</div>
          </div>
        </div>
        <div class="team-progress-wrap">
          <div class="team-progress-label">
            <span>Target Achievement</span>
            <span style="font-weight:600;color:var(--${achCls==='amber'?'amber':''+achCls})">${achPct}%</span>
          </div>
          <div class="team-progress-bar">
            <div class="team-progress-fill" style="width:${Math.min(achPct,100)}%;background:${achCls==='green'?'var(--green)':achCls==='amber'?'#d97706':'var(--red)'}"></div>
          </div>
        </div>
      </div>`;
  }).join('');
}

// ─── TEAM MODAL ───────────────────────────────────────────────
function openTeamModal(idx) {
  const m = teamBreakdown[idx];
  if (!m) return;
  const s = m.summary;
  document.getElementById('tmName').textContent = m.name;
  document.getElementById('tmMeta').textContent = m.role + ' · ' + s.totalPartners + ' partners';

  const achPct = s.totalTarget>0 ? Math.round(s.currentMonthPremium/s.totalTarget*100) : 0;
  document.getElementById('tmKpis').innerHTML = `
    <div class="kpi-card"><div class="kpi-label">MTD (${CURRENT_MONTH_LABEL})</div><div class="kpi-value">${fmtFull(s.currentMonthPremium)}</div></div>
    <div class="kpi-card"><div class="kpi-label">Target (May)</div><div class="kpi-value">${s.totalTarget>0?fmtFull(s.totalTarget):'—'}</div></div>
    <div class="kpi-card"><div class="kpi-label">Achievement</div><div class="kpi-value ${pctColor(achPct)}">${achPct}%</div></div>
    <div class="kpi-card"><div class="kpi-label">Active / Total</div><div class="kpi-value">${s.activeCount} / ${s.totalPartners}</div></div>
  `;

  const pts = m.partners || [];
  document.getElementById('tmPartnerBody').innerHTML = pts.map((p,i) => {
    const curr = parseNum(p.currentMonth), prev = parseNum(p.prevMonth), tgt = parseNum(p.target);
    const achP = tgt>0?Math.min(Math.round(curr/tgt*100),999):0;
    const achC = pctColor(achP);
    const momV = prev>0?((curr-prev)/prev*100).toFixed(1):null;
    const momS = momV===null?'—':`<span class="${parseFloat(momV)>=0?'mom-up':'mom-down'}">${parseFloat(momV)>=0?'▲ +':'▼ '}${momV}%</span>`;
    const conn = p.connected?'<span class="badge active" style="font-size:10px">✓</span>':'<span class="badge inactive" style="font-size:10px">✗</span>';
    return `<tr>
      <td><div class="partner-name">${p.name}</div><div class="partner-gid">${p.gid}</div></td>
      <td><div class="city-text">${p.city||'—'}</div><div class="state-text">${p.state||''}</div></td>
      <td><strong>${fmtINR(curr)}</strong></td>
      <td>${fmtINR(prev)}</td>
      <td>${momS}</td>
      <td>
        <div class="progress-wrap">
          <div class="progress-bar"><div class="progress-fill ${achC}" style="width:${Math.min(achP,100)}%"></div></div>
          <span class="pct-label ${achC}">${achP}%</span>
        </div>
      </td>
      <td>${p.isGrowth?'<span class="badge growth">▲</span>':'<span class="badge degrowth">▼</span>'}</td>
      <td>${p.isActive?'<span class="badge active">Active</span>':'<span class="badge inactive">Inactive</span>'}</td>
      <td>${conn}</td>
      <td><button class="btn-view" onclick="openModalFromTeam(${i},${idx})">View</button></td>
    </tr>`;
  }).join('');

  document.getElementById('teamModalOverlay').classList.add('open');
}

function openModalFromTeam(partnerIdx, teamIdx) {
  const p = teamBreakdown[teamIdx]?.partners?.[partnerIdx];
  if (!p) return;
  // Temporarily set as modal target
  openModalWithPartner(p);
}

function closeTeamModal(e) {
  if (e.target===document.getElementById('teamModalOverlay')) closeTeamModalDirect();
}
function closeTeamModalDirect() {
  document.getElementById('teamModalOverlay').classList.remove('open');
}

// ─── PARTNER DETAIL MODAL ────────────────────────────────────
function openModal(idx, bodyId) {
  let p;
  if (bodyId === 'myPartnerBody') p = myPartners[idx];
  else p = allPartners[idx];
  if (!p) return;
  modalPartnerIndex = { idx, bodyId };
  openModalWithPartner(p);
}

function openModalWithPartner(p) {
  document.getElementById('mName').textContent = p.name;
  document.getElementById('mMeta').textContent =
    `GID: ${p.gid}  ·  ${p.city||''}${p.state?', '+p.state:''}  ·  ${p.ownerRole}: ${p.ownerName}`;

  const monthly  = (p.monthlyData||[]).map(parseNum);
  const allData  = [...monthly, parseNum(p.currentMonth)]; // 13 + 1 = 14
  const allLabels = [...MONTHS_13, CURRENT_MONTH_LABEL];
  const maxMonth = Math.max(...allData, 0);
  const fyTotal  = allData.reduce((a,b)=>a+b,0);
  const curr     = parseNum(p.currentMonth);
  const prev     = parseNum(p.prevMonth);
  const target   = parseNum(p.target);
  const pot      = parseNum(p.overallPot);
  const achPct   = target>0 ? Math.min(Math.round(curr/target*100),999) : 0;
  const achCls   = pctColor(achPct);

  // KPI cards
  document.getElementById('mKpis').innerHTML = `
    <div class="kpi-card"><div class="kpi-label">Overall Potential</div><div class="kpi-value">${fmtFull(pot)}</div></div>
    <div class="kpi-card"><div class="kpi-label">May Target</div><div class="kpi-value">${target>0?fmtFull(target):'—'}</div></div>
    <div class="kpi-card"><div class="kpi-label">MTD (${CURRENT_MONTH_LABEL})</div><div class="kpi-value ${curr>0?'green':'red'}">${fmtFull(curr)}</div></div>
    <div class="kpi-card"><div class="kpi-label">Best Month</div><div class="kpi-value">${fmtFull(maxMonth)}</div></div>
  `;

  // Potential box
  document.getElementById('mPotentialBox').innerHTML = `
    <div class="pot-item"><div class="pot-label">Max Potential</div><div class="pot-value">${fmtFull(pot)}</div></div>
    <div class="pot-item"><div class="pot-label">May Target</div><div class="pot-value">${target>0?fmtFull(target):'Not set'}</div></div>
    <div class="pot-item"><div class="pot-label">MTD vs LMTD</div><div class="pot-value">${fmtINR(curr)} / ${fmtINR(prev)}</div></div>
    <div class="pot-item" style="text-align:right">
      <div class="pot-label">Target Achievement</div>
      <div class="pot-pct ${achCls}">${achPct}%</div>
    </div>
  `;

  // Chart
  if (trendChartInstance) { trendChartInstance.destroy(); trendChartInstance=null; }
  const ctx = document.getElementById('trendChart').getContext('2d');
  trendChartInstance = new Chart(ctx, {
    type:'line',
    data: {
      labels: allLabels,
      datasets: [{
        label:'Premium',
        data: allData,
        borderColor:'#e05a2b',
        backgroundColor:'rgba(224,90,43,0.08)',
        borderWidth:2,
        pointBackgroundColor: allData.map((v,i)=> i===allData.length-1?'#e05a2b':'#e05a2b'),
        pointRadius: allData.map((_,i)=>i===allData.length-1?6:4),
        fill:true, tension:0.3
      },
      ...(target>0?[{
        label:'Target',
        data: allLabels.map((_,i)=>i===allLabels.length-1?target:null),
        borderColor:'#3b82f6',
        borderDash:[4,4],
        borderWidth:2,
        pointRadius:6,
        fill:false
      }]:[])
      ]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:target>0 }, tooltip:{ callbacks:{ label:ctx=>fmtFull(ctx.raw) } } },
      scales:{
        x:{ grid:{display:false}, ticks:{font:{size:10},color:'#9ca3af'} },
        y:{ grid:{color:'#f3f4f6'}, ticks:{font:{size:10},color:'#9ca3af',callback:v=>fmtINR(v)} }
      }
    }
  });

  // History table — all 14 months
  document.getElementById('mHistoryBody').innerHTML = allData.map((val,i) => {
    let mB = '—';
    if (i>0) {
      const pv = allData[i-1];
      if (pv>0&&val!==pv) {
        const d = ((val-pv)/pv*100).toFixed(1);
        mB = parseFloat(d)>=0?`<span class="mom-up">▲ +${d}%</span>`:`<span class="mom-down">▼ ${d}%</span>`;
      } else if (pv===0&&val>0) mB='<span class="mom-up">▲ New</span>';
    }
    const isCurrentRow = i===allData.length-1;
    return `<tr style="${isCurrentRow?'background:var(--orange-light);font-weight:600':''}">
      <td>${allLabels[i]}${isCurrentRow?' ★':''}</td>
      <td>${fmtFull(val)}</td>
      <td>${mB}</td>
    </tr>`;
  }).join('');

  // Engagement
  const callsOk = p.calls && p.calls !== '0' && p.calls !== '';
  const visitOk = p.visits && p.visits !== '0' && p.visits !== '';
  document.getElementById('mEngageGrid').innerHTML = `
    <div class="engage-card">
      <div class="engage-label">Calls Made</div>
      <div class="engage-value" style="color:${callsOk?'var(--green)':'var(--red)'}">${p.calls||'0'} ${callsOk?'✓':'✗'}</div>
    </div>
    <div class="engage-card">
      <div class="engage-label">Visits</div>
      <div class="engage-value" style="color:${visitOk?'var(--green)':'var(--red)'}">${p.visits||'0'} ${visitOk?'✓':'✗'}</div>
    </div>
    <div class="engage-card">
      <div class="engage-label">Connect Status</div>
      <div class="engage-value">${p.connected?'<span class="badge active">✓ Connected</span>':'<span class="badge inactive">✗ Not connected</span>'}</div>
    </div>
  `;

  // Remark
  document.getElementById('mRemark').value = p.remark || '';
  document.getElementById('remarkSaved').style.display='none';

  document.getElementById('modalOverlay').classList.add('open');
}

// ─── SAVE REMARK ─────────────────────────────────────────────
async function saveRemark() {
  const remark = document.getElementById('mRemark').value.trim();
  const btn = document.getElementById('saveRemarkBtn');
  const saved = document.getElementById('remarkSaved');
  if (!modalPartnerIndex) return;

  let p;
  if (modalPartnerIndex.bodyId === 'myPartnerBody') p = myPartners[modalPartnerIndex.idx];
  else p = allPartners[modalPartnerIndex.idx];
  if (!p) return;

  btn.disabled = true;
  btn.textContent = 'Saving…';
  try {
    const data = await callAPI({ action:'saveRemark', gid:currentUser.gid, partnerGid:p.gid, remark });
    if (data.success) {
      p.remark = remark;
      saved.style.display = 'inline';
      setTimeout(() => saved.style.display='none', 3000);
    }
  } catch(e) { alert('Could not save remark.'); }
  finally { btn.disabled=false; btn.textContent='Save Remark'; }
}

// ─── MODAL OPEN/CLOSE ─────────────────────────────────────────
function closeModal(e) { if(e.target===document.getElementById('modalOverlay')) closeModalDirect(); }
function closeModalDirect() {
  document.getElementById('modalOverlay').classList.remove('open');
  if (trendChartInstance) { trendChartInstance.destroy(); trendChartInstance=null; }
  modalPartnerIndex = null;
}

// ─── UTILS ───────────────────────────────────────────────────
function showErr(id, msg) { const e=document.getElementById(id); if(e){e.textContent=msg;e.style.display='block';} }
function hideErr(id)       { const e=document.getElementById(id); if(e) e.style.display='none'; }
function setBusy(tId,sId,busy) {
  const t=document.getElementById(tId),s=document.getElementById(sId);
  if(t) t.style.display=busy?'none':'inline';
  if(s) s.style.display=busy?'block':'none';
  if(t) { const b=t.closest('button'); if(b) b.disabled=busy; }
}
function delay(ms) { return new Promise(r=>setTimeout(r,ms)); }

// ─── INIT ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('partnerBody')) initDashboard();
  const gi=document.getElementById('gidInput');      if(gi) gi.addEventListener('keydown',e=>{if(e.key==='Enter')checkGid();});
  const pi=document.getElementById('passwordInput'); if(pi) pi.addEventListener('keydown',e=>{if(e.key==='Enter')doLogin();});
});
document.addEventListener('keydown', e => { if(e.key==='Escape'){ closeModalDirect(); closeTeamModalDirect(); } });
