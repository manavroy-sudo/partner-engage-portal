// =============================================
// Partner Engage Portal — InsuranceDekho
// app.js — All frontend logic
// =============================================

const MONTHS = ['Apr\'25','May\'25','Jun\'25','Jul\'25','Aug\'25','Sep\'25',
                 'Oct\'25','Nov\'25','Dec\'25','Jan\'26','Feb\'26','Mar\'26',
                 'Apr\'26','May\'26'];

let allPartners = [];   // Full dataset after login
let currentUser = null; // Logged-in user object

// ─── SHA-256 helper ───────────────────────────────────────────
async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── API helper ───────────────────────────────────────────────
async function callAPI(params) {
  const url = new URL(API_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error('Network error: ' + res.status);
  return res.json();
}

// ─── Number / currency helpers ────────────────────────────────
function parseNum(val) {
  if (!val && val !== 0) return 0;
  return parseFloat(String(val).replace(/[₹,\s]/g, '')) || 0;
}

function fmtINR(num) {
  if (!num) return '₹0';
  const n = Math.round(parseNum(num));
  if (n >= 10000000) return '₹' + (n / 10000000).toFixed(2) + 'Cr';
  if (n >= 100000)   return '₹' + (n / 100000).toFixed(2) + 'L';
  if (n >= 1000)     return '₹' + (n / 1000).toFixed(1) + 'K';
  return '₹' + n.toLocaleString('en-IN');
}

function fmtINRFull(num) {
  const n = Math.round(parseNum(num));
  return '₹' + n.toLocaleString('en-IN');
}

function getInitials(name) {
  if (!name) return '--';
  return name.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

// ─── Auth helpers ─────────────────────────────────────────────
function saveSession(user) {
  sessionStorage.setItem('pe_user', JSON.stringify(user));
}

function loadSession() {
  const raw = sessionStorage.getItem('pe_user');
  return raw ? JSON.parse(raw) : null;
}

function clearSession() {
  sessionStorage.removeItem('pe_user');
}

function logout() {
  clearSession();
  window.location.href = 'index.html';
}

// ─── LOGIN PAGE ───────────────────────────────────────────────
async function handleLogin(e) {
  e.preventDefault();
  const gid      = document.getElementById('gid').value.trim().toUpperCase();
  const password = document.getElementById('password').value;
  const errorEl  = document.getElementById('loginError');
  const btnText  = document.getElementById('loginBtnText');
  const spinner  = document.getElementById('loginSpinner');
  const btn      = document.getElementById('loginBtn');

  errorEl.style.display = 'none';
  btnText.style.display = 'none';
  spinner.style.display = 'block';
  btn.disabled = true;

  try {
    const hashed = await sha256(password);
    const data = await callAPI({ action: 'login', gid, password: hashed });

    if (data.success) {
      saveSession(data.user);
      window.location.href = 'dashboard.html';
    } else {
      errorEl.textContent = data.message || 'Invalid credentials. Please try again.';
      errorEl.style.display = 'block';
    }
  } catch (err) {
    errorEl.textContent = 'Connection error. Check if the Apps Script URL is set correctly in config.js.';
    errorEl.style.display = 'block';
  } finally {
    btnText.style.display = 'block';
    spinner.style.display = 'none';
    btn.disabled = false;
  }
}

// ─── DASHBOARD PAGE ───────────────────────────────────────────
async function initDashboard() {
  currentUser = loadSession();
  if (!currentUser) {
    window.location.href = 'index.html';
    return;
  }

  // Set user info in topbar
  document.getElementById('userAvatar').textContent = getInitials(currentUser.name);
  document.getElementById('userName').textContent   = currentUser.name;
  document.getElementById('userRole').textContent   =
    currentUser.role + ' · ' + currentUser.zone;

  // Load partners
  try {
    const data = await callAPI({ action: 'getDashboard', gid: currentUser.gid });
    if (!data.success) throw new Error(data.message);
    allPartners = data.partners || [];
    renderSummaryCards(data.summary);
    renderTable(allPartners);
  } catch (err) {
    document.getElementById('partnerBody').innerHTML =
      `<tr><td colspan="9" class="loading-row" style="color:#b91c1c">
        Error loading data: ${err.message}
      </td></tr>`;
  }
}

// ─── SUMMARY CARDS ────────────────────────────────────────────
function renderSummaryCards(s) {
  document.getElementById('zoneLabel').textContent =
    `Summary — ${currentUser.zone} zone`;

  const prev  = parseNum(s.prevMonthPremium);
  const curr  = parseNum(s.currentMonthPremium);
  const momPct = prev > 0 ? ((curr - prev) / prev * 100).toFixed(1) : null;
  const momBadge = momPct !== null
    ? `<div class="sc-badge ${parseFloat(momPct) >= 0 ? 'up' : 'down'}">
         ${parseFloat(momPct) >= 0 ? '▲' : '▼'} ${Math.abs(momPct)}% MoM
       </div>`
    : '';

  const cards = [
    { label: '👥 Total partners',       value: s.totalPartners,                  cls: '' },
    { label: '💰 Biz potential',        value: fmtINR(s.totalPotential),         cls: '' },
    { label: '📅 ' + MONTHS[MONTHS.length-1] + ' premium',
                                         value: fmtINR(curr),                    cls: '',    badge: momBadge },
    { label: '✅ Active',               value: s.activeCount,                    cls: 'green' },
    { label: '⭕ Inactive',             value: s.inactiveCount,                  cls: 'red' },
    { label: '📈 Growth',              value: s.growthCount,                    cls: 'green' },
    { label: '📉 De-growth',           value: s.degrowthCount,                  cls: 'red' },
  ];

  document.getElementById('summaryCards').innerHTML = cards.map(c => `
    <div class="summary-card">
      <div class="sc-label">${c.label}</div>
      <div class="sc-value ${c.cls}">${c.value}</div>
      ${c.badge || ''}
    </div>
  `).join('');
}

// ─── PARTNER TABLE ────────────────────────────────────────────
function renderTable(partners) {
  const tbody = document.getElementById('partnerBody');
  const footer = document.getElementById('tableFooter');

  if (!partners || partners.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="loading-row">No partners found matching the filters.</td></tr>';
    footer.textContent = '';
    return;
  }

  tbody.innerHTML = partners.map((p, i) => {
    const potential   = parseNum(p.potential);
    const currentPrem = parseNum(p.currentMonth);
    const pct         = potential > 0 ? Math.min((currentPrem / potential) * 100, 999) : 0;
    const pctDisplay  = Math.round(pct);

    let pctClass = 'red', fillClass = 'red';
    if (pct >= 75) { pctClass = 'green'; fillClass = 'green'; }
    else if (pct >= 40) { pctClass = 'amber'; fillClass = 'amber'; }

    const trendBadge = p.isGrowth
      ? '<span class="badge growth">▲ Growth</span>'
      : '<span class="badge degrowth">▼ De-growth</span>';

    const statusBadge = p.isActive
      ? '<span class="badge active">Active</span>'
      : '<span class="badge inactive">Inactive</span>';

    const ownerShort = (p.owner || '').replace(/^(ZH|RH|SH|AM|RM):\s*/i, '').split(' ').slice(0,2).join(' ');

    return `
      <tr>
        <td>
          <div class="partner-name" title="${p.name}">${p.name}</div>
          <div class="partner-gid">${p.gid}</div>
        </td>
        <td>
          <div class="city-text">${p.city || '—'}</div>
          <div class="state-text">${p.state || ''}</div>
        </td>
        <td>
          <div class="owner-text" title="${p.owner || ''}">${ownerShort || '—'}</div>
        </td>
        <td>${fmtINR(potential)}</td>
        <td>${fmtINR(currentPrem)}</td>
        <td>
          <div class="progress-wrap">
            <div class="progress-bar">
              <div class="progress-fill ${fillClass}" style="width:${Math.min(pct,100)}%"></div>
            </div>
            <span class="pct-label ${pctClass}">${pctDisplay}%</span>
          </div>
        </td>
        <td>${trendBadge}</td>
        <td>${statusBadge}</td>
        <td><button class="btn-view" onclick="openModal(${i})">View</button></td>
      </tr>
    `;
  }).join('');

  footer.textContent = `Showing ${partners.length} partner${partners.length !== 1 ? 's' : ''}`;
}

// ─── FILTERS ─────────────────────────────────────────────────
function applyFilters() {
  const search  = document.getElementById('searchInput').value.toLowerCase();
  const status  = document.getElementById('statusFilter').value;
  const trend   = document.getElementById('trendFilter').value;

  const filtered = allPartners.filter(p => {
    const matchSearch = !search ||
      (p.name  || '').toLowerCase().includes(search) ||
      (p.gid   || '').toLowerCase().includes(search) ||
      (p.city  || '').toLowerCase().includes(search) ||
      (p.state || '').toLowerCase().includes(search);

    const matchStatus =
      !status ||
      (status === 'active'   &&  p.isActive) ||
      (status === 'inactive' && !p.isActive);

    const matchTrend =
      !trend ||
      (trend === 'growth'   &&  p.isGrowth) ||
      (trend === 'degrowth' && !p.isGrowth);

    return matchSearch && matchStatus && matchTrend;
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
    `GID: ${p.gid}  ·  ${p.city || ''}${p.state ? ', ' + p.state : ''}  ·  ${p.owner || ''}`;

  // KPI cards
  const monthly  = (p.monthlyData || []).map(parseNum);
  const maxMonth = Math.max(...monthly, 0);
  const fyTotal  = monthly.reduce((a, b) => a + b, 0);
  const currM    = parseNum(p.currentMonth);
  const potential = parseNum(p.potential);

  document.getElementById('mKpis').innerHTML = `
    <div class="kpi-card">
      <div class="kpi-label">Business Potential</div>
      <div class="kpi-value">${fmtINRFull(potential)}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">FY26 Total (Apr–May)</div>
      <div class="kpi-value">${fmtINRFull(fyTotal)}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Best Month</div>
      <div class="kpi-value">${fmtINRFull(maxMonth)}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">${MONTHS[MONTHS.length-1]} Premium</div>
      <div class="kpi-value ${currM > 0 ? 'green' : 'red'}">${fmtINRFull(currM)}</div>
    </div>
  `;

  // History table
  const historyRows = monthly.map((val, i) => {
    let momHtml = '—';
    if (i > 0) {
      const prev = monthly[i - 1];
      if (prev > 0 && val !== prev) {
        const diff = ((val - prev) / prev * 100).toFixed(1);
        const cls  = parseFloat(diff) >= 0 ? 'mom-up' : 'mom-down';
        const sign = parseFloat(diff) >= 0 ? '▲ +' : '▼ ';
        momHtml = `<span class="${cls}">${sign}${diff}%</span>`;
      } else if (prev === 0 && val > 0) {
        momHtml = '<span class="mom-up">▲ New</span>';
      }
    }
    return `
      <tr>
        <td>${MONTHS[i]}</td>
        <td>${fmtINRFull(val)}</td>
        <td>${momHtml}</td>
      </tr>
    `;
  }).join('');

  document.getElementById('mHistoryBody').innerHTML = historyRows;

  // Engagement
  const proj = p.projection ? fmtINRFull(parseNum(p.projection)) : '—';
  const ach  = p.achievement ? fmtINRFull(parseNum(p.achievement)) : '—';
  const pctAch = potential > 0 && currM > 0
    ? Math.round(currM / potential * 100) + '%'
    : '—';

  document.getElementById('mEngageGrid').innerHTML = `
    <div class="engage-card">
      <div class="engage-label">Calls Made</div>
      <div class="engage-value">${p.calls || '—'}</div>
    </div>
    <div class="engage-card">
      <div class="engage-label">Visits</div>
      <div class="engage-value">${p.visits || '—'}</div>
    </div>
    <div class="engage-card">
      <div class="engage-label">Month Achievement %</div>
      <div class="engage-value">${pctAch}</div>
    </div>
    <div class="engage-card remark">
      <div class="engage-label">Remark</div>
      <div class="engage-value">${p.remark || 'No remark added for this month.'}</div>
    </div>
  `;

  document.getElementById('modalOverlay').classList.add('open');
}

function closeModal(e) {
  if (e.target === document.getElementById('modalOverlay')) closeModalDirect();
}

function closeModalDirect() {
  document.getElementById('modalOverlay').classList.remove('open');
}

// ─── ROUTE: run correct init based on page ─────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('loginForm'))   { /* login page — form handles itself */ }
  if (document.getElementById('partnerTable')) initDashboard();
});

// Close modal on Escape key
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModalDirect();
});
