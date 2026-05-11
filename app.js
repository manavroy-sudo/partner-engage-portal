// =============================================
// Partner Engage Portal v2 — InsuranceDekho
// app.js
// =============================================

const MONTHS = ["Apr'25","May'25","Jun'25","Jul'25","Aug'25","Sep'25",
                 "Oct'25","Nov'25","Dec'25","Jan'26","Feb'26","Mar'26",
                 "Apr'26","May'26"];

const ROLE_LEVEL = { ZH:5, RH:4, SH:3, RM:2, AM:1 };

let allPartners  = [];
let currentUser  = null;
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
  return parseFloat(String(v).replace(/[₹,\s]/g,'')) || 0;
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
function initials(name) {
  return (name||'').trim().split(/\s+/).map(w=>w[0]).join('').toUpperCase().slice(0,2)||'--';
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
  const gid = document.getElementById('gidInput').value.trim().toUpperCase();
  const errEl = document.getElementById('gidError');
  errEl.style.display = 'none';
  if (!gid) { showError('gidError','Please enter your User ID.'); return; }

  setBtnLoading('gidBtnText','gidSpinner',true);
  try {
    const data = await callAPI({ action:'checkPassword', gid });
    if (!data.success) { showError('gidError', data.message); return; }

    loginGid = gid;

    if (data.hasPassword) {
      // Has password → show password step
      document.getElementById('stepGid').style.display = 'none';
      document.getElementById('stepPassword').style.display = 'block';
      document.getElementById('passwordUserLabel').textContent = 'Signing in as: ' + gid;
      document.getElementById('passwordInput').focus();
    } else {
      // No password → show create password step
      document.getElementById('stepGid').style.display = 'none';
      document.getElementById('stepSetPassword').style.display = 'block';
      document.getElementById('setPasswordUserLabel').textContent = 'Setting up: ' + gid;
      document.getElementById('newPassword1').focus();
    }
  } catch(e) {
    showError('gidError', 'Connection error. Check your config.js URL.');
  } finally {
    setBtnLoading('gidBtnText','gidSpinner',false);
  }
}

async function doLogin() {
  const pw = document.getElementById('passwordInput').value;
  if (!pw) { showError('passwordError','Please enter your password.'); return; }

  setBtnLoading('loginBtnText','loginSpinner',true);
  document.getElementById('passwordError').style.display = 'none';
  try {
    const hashed = await sha256(pw);
    const data = await callAPI({ action:'login', gid:loginGid, password:hashed });
    if (data.success) {
      saveSession(data.user);
      window.location.href = 'dashboard.html';
    } else {
      showError('passwordError', data.message || 'Incorrect password.');
    }
  } catch(e) {
    showError('passwordError','Connection error.');
  } finally {
    setBtnLoading('loginBtnText','loginSpinner',false);
  }
}

// First-time password set OR change password
async function doSetPassword(isChange) {
  const prefix = isChange ? 'change' : 'set';
  const p1El   = isChange ? document.getElementById('changePassword1') : document.getElementById('newPassword1');
  const p2El   = isChange ? document.getElementById('changePassword2') : document.getElementById('newPassword2');
  const errEl  = isChange ? 'changePasswordError' : 'setPasswordError';
  const sucEl  = isChange ? 'changePasswordSuccess' : 'setPasswordSuccess';
  const btnTxt = isChange ? 'changeBtnText' : 'setPasswordBtnText';
  const btnSpin= isChange ? 'changeSpinner' : 'setPasswordSpinner';

  document.getElementById(errEl).style.display = 'none';
  document.getElementById(sucEl).style.display = 'none';

  const newPw = p1El.value;
  const conf  = p2El.value;

  if (!newPw || newPw.length < 6) { showError(errEl,'Password must be at least 6 characters.'); return; }
  if (newPw !== conf)              { showError(errEl,'Passwords do not match.'); return; }

  let oldHash = '';
  if (isChange) {
    const oldPw = document.getElementById('oldPassword').value;
    if (!oldPw) { showError(errEl,'Please enter your current password.'); return; }
    oldHash = await sha256(oldPw);
  }

  const newHash = await sha256(newPw);
  setBtnLoading(btnTxt, btnSpin, true);
  try {
    const data = await callAPI({ action:'setPassword', gid:loginGid, oldPassword:oldHash, newPassword:newHash });
    if (data.success) {
      document.getElementById(sucEl).textContent = 'Password set! Signing you in…';
      document.getElementById(sucEl).style.display = 'block';
      // Auto-login after set
      await new Promise(r => setTimeout(r, 800));
      const loginData = await callAPI({ action:'login', gid:loginGid, password:newHash });
      if (loginData.success) {
        saveSession(loginData.user);
        window.location.href = 'dashboard.html';
      }
    } else {
      showError(errEl, data.message || 'Could not set password.');
    }
  } catch(e) {
    showError(errEl,'Connection error.');
  } finally {
    setBtnLoading(btnTxt, btnSpin, false);
  }
}

function goBack() {
  document.getElementById('stepPassword').style.display     = 'none';
  document.getElementById('stepSetPassword').style.display  = 'none';
  document.getElementById('stepChangePassword').style.display = 'none';
  document.getElementById('stepGid').style.display = 'block';
  document.getElementById('gidInput').focus();
}

function showForgotFlow() {
  document.getElementById('stepPassword').style.display = 'none';
  document.getElementById('stepChangePassword').style.display = 'block';
  document.getElementById('changePasswordUserLabel').textContent = 'Changing password for: ' + loginGid;
}

function showError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
}

function setBtnLoading(textId, spinnerId, loading) {
  const t = document.getElementById(textId);
  const s = document.getElementById(spinnerId);
  if (t) t.style.display = loading ? 'none' : 'inline';
  if (s) s.style.display = loading ? 'block' : 'none';
  const btn = t ? t.closest('button') : null;
  if (btn) btn.disabled = loading;
}

// =============================================
// DASHBOARD PAGE
// =============================================
async function initDashboard() {
  currentUser = loadSession();
  if (!currentUser) { window.location.href = 'index.html'; return; }

  document.getElementById('userAvatar').textContent = initials(currentUser.name);
  document.getElementById('userName').textContent   = currentUser.name;
  document.getElementById('userRole').textContent   = currentUser.role + ' · ' + currentUser.zone;

  // Show Team tab only for roles above AM
  const roleLevel = ROLE_LEVEL[currentUser.role] || 0;
  if (roleLevel > 1) {
    document.getElementById('tabTeam').style.display = 'block';
  }

  try {
    const data = await callAPI({ action:'getDashboard', gid:currentUser.gid });
    if (!data.success) throw new Error(data.message);
    allPartners = data.partners || [];
    renderSummaryCards(data.summary);
    renderTable(allPartners);
    buildOwnerFilter(allPartners);
    if (roleLevel > 1) renderTeamTab(allPartners);
  } catch(err) {
    document.getElementById('partnerBody').innerHTML =
      `<tr><td colspan="9" class="loading-row" style="color:var(--red)">
        Error: ${err.message}
      </td></tr>`;
  }
}

// ─── TABS ─────────────────────────────────────────────────────
function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('panelPartners').style.display = tab === 'partners' ? 'block' : 'none';
  document.getElementById('panelTeam').style.display     = tab === 'team'     ? 'block' : 'none';
  document.getElementById('tabPartners').classList.toggle('active', tab === 'partners');
  document.getElementById('tabTeam').classList.toggle('active', tab === 'team');
}

// ─── SUMMARY CARDS ────────────────────────────────────────────
function renderSummaryCards(s) {
  document.getElementById('zoneLabel').textContent = 'Summary — ' + currentUser.zone;
  const curr = parseNum(s.currentMonthPremium);
  const prev = parseNum(s.prevMonthPremium);
  const momPct = prev > 0 ? ((curr - prev) / prev * 100).toFixed(1) : null;
  const momBadge = momPct !== null
    ? `<div class="sc-badge ${parseFloat(momPct)>=0?'up':'down'}">${parseFloat(momPct)>=0?'▲':'▼'} ${Math.abs(momPct)}% MoM</div>`
    : '';

  const cards = [
    { label:'👥 Total partners', val: s.totalPartners, cls:'' },
    { label:'💰 Biz potential',  val: fmtINR(s.totalPotential), cls:'' },
    { label:'📅 '+MONTHS[13]+' premium', val: fmtINR(curr), cls:'', badge: momBadge },
    { label:'✅ Active',   val: s.activeCount,   cls:'green' },
    { label:'⭕ Inactive', val: s.inactiveCount, cls:'red' },
    { label:'📈 Growth',   val: s.growthCount,   cls:'green' },
    { label:'📉 De-growth',val: s.degrowthCount, cls:'red' },
  ];

  document.getElementById('summaryCards').innerHTML = cards.map(c=>`
    <div class="summary-card">
      <div class="sc-label">${c.label}</div>
      <div class="sc-value ${c.cls}">${c.val}</div>
      ${c.badge||''}
    </div>
  `).join('');
}

// ─── TEAM TAB ────────────────────────────────────────────────
function renderTeamTab(partners) {
  // Group partners by their ownerRole & ownerName (excluding ZH level)
  const teamMap = {};
  partners.forEach(p => {
    if (!p.ownerRole || p.ownerRole === 'ZH') return;
    const key = p.ownerRole + '|' + p.ownerName;
    if (!teamMap[key]) {
      teamMap[key] = {
        role: p.ownerRole,
        name: p.ownerName,
        partners: []
      };
    }
    teamMap[key].partners.push(p);
  });

  const roleOrder = ['RH','SH','RM','AM'];
  const sorted = Object.values(teamMap).sort((a,b) => {
    const ra = roleOrder.indexOf(a.role), rb = roleOrder.indexOf(b.role);
    if (ra !== rb) return ra - rb;
    return a.name.localeCompare(b.name);
  });

  if (sorted.length === 0) {
    document.getElementById('teamGrid').innerHTML =
      '<p style="color:var(--gray-400);font-size:13px">No team members found under your access level.</p>';
    document.getElementById('teamLabel').textContent = 'Team Performance';
    return;
  }

  document.getElementById('teamLabel').textContent =
    'Team Performance — ' + sorted.length + ' members';

  document.getElementById('teamGrid').innerHTML = sorted.map(member => {
    const pts    = member.partners;
    const total  = pts.length;
    const active = pts.filter(p=>p.isActive).length;
    const curr   = pts.reduce((s,p)=>s+p.currentMonth,0);
    const pot    = pts.reduce((s,p)=>s+p.potential,0);
    const pct    = pot > 0 ? Math.min(Math.round(curr/pot*100),999) : 0;
    const growth = pts.filter(p=>p.isGrowth).length;

    let fillCls = 'red', fillColor = 'var(--red)';
    if (pct>=75) { fillCls='green'; fillColor='var(--green)'; }
    else if (pct>=40) { fillCls='amber'; fillColor='#d97706'; }

    const avatarCls = member.role.toLowerCase();

    return `
      <div class="team-card">
        <div class="team-card-header">
          <div class="team-avatar ${avatarCls}">${initials(member.name)}</div>
          <div>
            <div class="team-card-name">${member.name}</div>
            <div class="team-card-role">${member.role} · ${total} partner${total!==1?'s':''}</div>
          </div>
        </div>
        <div class="team-stats">
          <div class="team-stat">
            <div class="team-stat-val">${fmtINR(curr)}</div>
            <div class="team-stat-lbl">Current Month</div>
          </div>
          <div class="team-stat">
            <div class="team-stat-val green">${active}</div>
            <div class="team-stat-lbl">Active</div>
          </div>
          <div class="team-stat">
            <div class="team-stat-val green">${growth}</div>
            <div class="team-stat-lbl">Growth</div>
          </div>
        </div>
        <div class="team-progress-wrap">
          <div class="team-progress-label">
            <span>Achievement vs Potential</span>
            <span style="font-weight:600;color:${fillColor}">${pct}%</span>
          </div>
          <div class="team-progress-bar">
            <div class="team-progress-fill" style="width:${Math.min(pct,100)}%;background:${fillColor}"></div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ─── PARTNER TABLE ────────────────────────────────────────────
function renderTable(partners) {
  const tbody  = document.getElementById('partnerBody');
  const footer = document.getElementById('tableFooter');

  if (!partners || partners.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="loading-row">No partners found.</td></tr>';
    footer.textContent = '';
    return;
  }

  tbody.innerHTML = partners.map((p,i) => {
    const pot  = parseNum(p.potential);
    const curr = parseNum(p.currentMonth);
    const pct  = pot > 0 ? Math.min(Math.round(curr/pot*100),999) : 0;
    let pctCls = 'red', fillCls = 'red';
    if (pct>=75) { pctCls='green'; fillCls='green'; }
    else if (pct>=40) { pctCls='amber'; fillCls='amber'; }

    const ownerShort = (p.owner||'').split(':').slice(1).join(':').trim().split(' ').slice(0,2).join(' ') || p.owner;

    return `
      <tr>
        <td>
          <div class="partner-name" title="${p.name}">${p.name}</div>
          <div class="partner-gid">${p.gid}</div>
        </td>
        <td>
          <div class="city-text">${p.city||'—'}</div>
          <div class="state-text">${p.state||''}</div>
        </td>
        <td><div class="owner-text" title="${p.owner||''}">${p.ownerRole||''}${p.ownerRole?': ':''}${ownerShort}</div></td>
        <td>${fmtINR(pot)}</td>
        <td>${fmtINR(curr)}</td>
        <td>
          <div class="progress-wrap">
            <div class="progress-bar">
              <div class="progress-fill ${fillCls}" style="width:${Math.min(pct,100)}%"></div>
            </div>
            <span class="pct-label ${pctCls}">${pct}%</span>
          </div>
        </td>
        <td>${p.isGrowth
          ? '<span class="badge growth">▲ Growth</span>'
          : '<span class="badge degrowth">▼ De-growth</span>'}</td>
        <td>${p.isActive
          ? '<span class="badge active">Active</span>'
          : '<span class="badge inactive">Inactive</span>'}</td>
        <td><button class="btn-view" onclick="openModal(${i})">View</button></td>
      </tr>
    `;
  }).join('');

  footer.textContent = `Showing ${partners.length} partner${partners.length!==1?'s':''}`;
}

// ─── OWNER FILTER (for ZH/RH/SH who see multiple owners) ─────
function buildOwnerFilter(partners) {
  const roleLevel = ROLE_LEVEL[currentUser.role] || 0;
  if (roleLevel <= 1) return; // AM doesn't need it

  const roles = [...new Set(partners.map(p=>p.ownerRole).filter(Boolean))].sort();
  if (roles.length <= 1) return;

  const sel = document.getElementById('ownerRoleFilter');
  sel.style.display = 'block';
  sel.innerHTML = '<option value="">All owners</option>' +
    roles.map(r => `<option value="${r}">${r}</option>`).join('');
}

// ─── FILTERS ─────────────────────────────────────────────────
function applyFilters() {
  const search    = document.getElementById('searchInput').value.toLowerCase();
  const status    = document.getElementById('statusFilter').value;
  const trend     = document.getElementById('trendFilter').value;
  const ownerRole = document.getElementById('ownerRoleFilter').value;

  const filtered = allPartners.filter(p => {
    const ms = !search ||
      (p.name||'').toLowerCase().includes(search) ||
      (p.gid ||'').toLowerCase().includes(search) ||
      (p.city||'').toLowerCase().includes(search) ||
      (p.state||'').toLowerCase().includes(search);
    const mst = !status ||
      (status==='active' && p.isActive) ||
      (status==='inactive' && !p.isActive);
    const mt = !trend ||
      (trend==='growth' && p.isGrowth) ||
      (trend==='degrowth' && !p.isGrowth);
    const mo = !ownerRole || p.ownerRole === ownerRole;
    return ms && mst && mt && mo;
  });

  renderTable(filtered);
}

// ─── MODAL ───────────────────────────────────────────────────
async function openModal(index) {
  const p = allPartners[index];
  if (!p) return;

  // Header
  document.getElementById('mName').textContent = p.name;
  document.getElementById('mMeta').textContent =
    `GID: ${p.gid}  ·  ${p.city||''}${p.state?', '+p.state:''}  ·  ${p.owner||''}`;

  const monthly  = (p.monthlyData||[]).map(parseNum);
  const maxMonth = Math.max(...monthly, 0);
  const fyTotal  = monthly.reduce((a,b)=>a+b,0);
  const currM    = parseNum(p.currentMonth);
  const pot      = parseNum(p.potential);

  // KPI cards
  document.getElementById('mKpis').innerHTML = `
    <div class="kpi-card">
      <div class="kpi-label">Business Potential</div>
      <div class="kpi-value">${fmtFull(pot)}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">FY26 Total (14 months)</div>
      <div class="kpi-value">${fmtFull(fyTotal)}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Best Month Ever</div>
      <div class="kpi-value">${fmtFull(maxMonth)}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">${MONTHS[13]} Premium</div>
      <div class="kpi-value ${currM>0?'green':'red'}">${fmtFull(currM)}</div>
    </div>
  `;

  // Potential box
  const achPct = pot > 0 ? Math.min(Math.round(currM/pot*100),999) : 0;
  let pctCls = 'red';
  if (achPct>=75) pctCls='green';
  else if (achPct>=40) pctCls='amber';

  document.getElementById('mPotentialBox').innerHTML = `
    <div class="pot-item">
      <div class="pot-label">Max Potential</div>
      <div class="pot-value">${fmtFull(pot)}</div>
    </div>
    <div class="pot-item">
      <div class="pot-label">Current Month (${MONTHS[13]})</div>
      <div class="pot-value">${fmtFull(currM)}</div>
    </div>
    <div class="pot-item" style="text-align:right">
      <div class="pot-label">Achievement</div>
      <div class="pot-pct ${pctCls}">${achPct}%</div>
    </div>
  `;

  // Trend chart
  if (trendChartInstance) { trendChartInstance.destroy(); trendChartInstance = null; }
  const ctx = document.getElementById('trendChart').getContext('2d');
  trendChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: MONTHS,
      datasets: [{
        label: 'Monthly Premium',
        data: monthly,
        borderColor: '#e05a2b',
        backgroundColor: 'rgba(224,90,43,0.08)',
        borderWidth: 2,
        pointBackgroundColor: '#e05a2b',
        pointRadius: 4,
        pointHoverRadius: 6,
        fill: true,
        tension: 0.3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => fmtFull(ctx.raw)
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { size: 10 }, color: '#9ca3af' }
        },
        y: {
          grid: { color: '#f3f4f6' },
          ticks: {
            font: { size: 10 }, color: '#9ca3af',
            callback: v => fmtINR(v)
          }
        }
      }
    }
  });

  // History table
  document.getElementById('mHistoryBody').innerHTML = monthly.map((val,i) => {
    let momHtml = '—';
    if (i > 0) {
      const prev = monthly[i-1];
      if (prev > 0 && val !== prev) {
        const diff = ((val-prev)/prev*100).toFixed(1);
        momHtml = parseFloat(diff)>=0
          ? `<span class="mom-up">▲ +${diff}%</span>`
          : `<span class="mom-down">▼ ${diff}%</span>`;
      } else if (prev===0 && val>0) {
        momHtml = '<span class="mom-up">▲ New</span>';
      }
    }
    return `<tr><td>${MONTHS[i]}</td><td>${fmtFull(val)}</td><td>${momHtml}</td></tr>`;
  }).join('');

  // Engagement
  document.getElementById('mEngageGrid').innerHTML = `
    <div class="engage-card">
      <div class="engage-label">Calls Made</div>
      <div class="engage-value">${p.calls||'—'}</div>
    </div>
    <div class="engage-card">
      <div class="engage-label">Visits</div>
      <div class="engage-value">${p.visits||'—'}</div>
    </div>
    <div class="engage-card">
      <div class="engage-label">Month Achievement</div>
      <div class="engage-value">${achPct}%</div>
    </div>
    <div class="engage-card remark">
      <div class="engage-label">Remark</div>
      <div class="engage-value">${p.remark||'No remark added.'}</div>
    </div>
  `;

  document.getElementById('modalOverlay').classList.add('open');
}

function closeModal(e) {
  if (e.target===document.getElementById('modalOverlay')) closeModalDirect();
}
function closeModalDirect() {
  document.getElementById('modalOverlay').classList.remove('open');
  if (trendChartInstance) { trendChartInstance.destroy(); trendChartInstance=null; }
}

// ─── INIT ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('partnerTable')) initDashboard();
  // Enter key on GID input
  const gi = document.getElementById('gidInput');
  if (gi) gi.addEventListener('keydown', e => { if(e.key==='Enter') checkGid(); });
  const pi = document.getElementById('passwordInput');
  if (pi) pi.addEventListener('keydown', e => { if(e.key==='Enter') doLogin(); });
});

document.addEventListener('keydown', e => {
  if (e.key==='Escape') closeModalDirect();
});
