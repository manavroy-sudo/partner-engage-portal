// ====================================================================
// Master Dashboard — master.js (v4)
// All numbers come from getMaster endpoint; nothing hardcoded.
// ====================================================================
(function () {
  'use strict';

  const userJson = sessionStorage.getItem('peUser');
  if (!userJson) { location.href = 'index.html'; return; }
  const user = JSON.parse(userJson);
  if (user.role !== 'MASTER') {
    alert('Access denied. Master role required.');
    location.href = 'dashboard.html';
    return;
  }

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
      if (id === 'login') loadLoginStats();
    });
  });

  let data = null;

  function setStatus(msg, kind) {
    const bar = $('statusBar');
    bar.className = 'status-bar ' + (kind || '');
    bar.textContent = msg;
    bar.classList.toggle('hidden', !msg);
  }

  function load() {
    setStatus('Loading master data…', 'loading');
    fetch(API_URL + '?action=getMaster&gid=' + encodeURIComponent(user.gid))
      .then(r => r.json())
      .then(res => {
        if (!res.success) { setStatus(res.message || 'Failed', 'error'); return; }
        data = res;
        renderOverview();
        renderZone();
        renderState();
        renderHead();
        setStatus('', '');
      })
      .catch(e => setStatus('Connection error: ' + e.message, 'error'));
  }

  function renderOverview() {
    const op = data.overallProject;
    $('m-total').textContent = fmtInt(op.totalPartners);
    $('m-mtd').textContent = fmtINR(op.businessGenerated);
    $('m-target').textContent = fmtINR(op.target);
    $('m-ach').textContent = op.achievementPct + '%';
    $('m-maxpot').textContent = fmtINR(op.maxPotential);
    $('m-overallpot').textContent = fmtINR(op.overallPotential);
    $('m-active').textContent = fmtInt(op.activePartners);
    $('m-inactive').textContent = fmtInt(op.inactivePartners);
    $('m-conn').textContent = fmtInt(op.connectedPartners);
    $('m-noconn').textContent = fmtInt(op.nonConnectedPartners);

    new Chart($('chartZone'), {
      type: 'bar',
      data: {
        labels: data.zoneSummaries.map(z => z.zone),
        datasets: [{
          label: 'MTD',
          data: data.zoneSummaries.map(z => z.summary.currentMonthPremium),
          backgroundColor: '#2563eb'
        }]
      },
      options: {
        scales: { y: { ticks: { callback: v => fmtINR(v) } } },
        plugins: { legend: { display: false } }
      }
    });
  }

  function renderZone() {
    $('zoneGrid').innerHTML = data.zoneSummaries.map(z => {
      const op = z.overallProject;
      return `<div class="team-card">
        <div class="team-card-head">
          <div><div class="team-name">${safe(z.zone)}</div><div class="team-role">${fmtInt(op.totalPartners)} partners</div></div>
        </div>
        <div class="team-stats">
          <div class="ts"><div class="ts-l">MTD</div><div class="ts-v"><b>${fmtINR(op.businessGenerated)}</b></div></div>
          <div class="ts"><div class="ts-l">Target</div><div class="ts-v">${fmtINR(op.target)}</div></div>
          <div class="ts"><div class="ts-l">Ach.</div><div class="ts-v">${op.achievementPct}%</div></div>
          <div class="ts"><div class="ts-l">Max Pot.</div><div class="ts-v">${fmtINR(op.maxPotential)}</div></div>
          <div class="ts"><div class="ts-l">Overall Pot.</div><div class="ts-v">${fmtINR(op.overallPotential)}</div></div>
          <div class="ts"><div class="ts-l">Active</div><div class="ts-v pos">${fmtInt(op.activePartners)}</div></div>
          <div class="ts"><div class="ts-l">Inactive</div><div class="ts-v neg">${fmtInt(op.inactivePartners)}</div></div>
          <div class="ts"><div class="ts-l">Connected</div><div class="ts-v">${fmtInt(op.connectedPartners)}</div></div>
        </div>
      </div>`;
    }).join('');
  }

  function renderState() {
    $('stateTbody').innerHTML = data.stateSummaries.map(s => {
      const op = s.overallProject;
      return `<tr>
        <td><b>${safe(s.state)}</b></td>
        <td>${fmtInt(op.totalPartners)}</td>
        <td>${fmtINR(op.maxPotential)}</td>
        <td>${fmtINR(op.overallPotential)}</td>
        <td>${fmtINR(op.target)}</td>
        <td><b>${fmtINR(op.businessGenerated)}</b></td>
        <td>${fmtINR(s.summary.prevMonthPremium)}</td>
        <td>${op.achievementPct}%</td>
        <td class="pos">${fmtInt(op.activePartners)}</td>
        <td class="neg">${fmtInt(op.inactivePartners)}</td>
        <td>${fmtInt(op.connectedPartners)}</td>
      </tr>`;
    }).join('');
  }

  function renderHead() {
    const role = $('hRole').value;
    const zone = $('hZone').value;
    const q = ($('hSearch').value || '').toLowerCase();
    const list = (data[role.toLowerCase() + 'Perf'] || [])
      .filter(h => !zone || h.zone === zone)
      .filter(h => !q || h.name.toLowerCase().indexOf(q) !== -1);

    $('headTbody').innerHTML = list.map(h => {
      const op = h.overallProject;
      return `<tr>
        <td><b>${safe(h.name)}</b></td>
        <td>${safe(h.role)}</td>
        <td>${safe(h.zone)}</td>
        <td>${fmtInt(op.totalPartners)}</td>
        <td>${fmtINR(op.maxPotential)}</td>
        <td>${fmtINR(op.overallPotential)}</td>
        <td>${fmtINR(op.target)}</td>
        <td><b>${fmtINR(op.businessGenerated)}</b></td>
        <td>${op.achievementPct}%</td>
        <td class="pos">${fmtInt(op.activePartners)}</td>
        <td class="neg">${fmtInt(op.inactivePartners)}</td>
        <td>${fmtInt(op.connectedPartners)}</td>
      </tr>`;
    }).join('');
  }

  ['hRole','hZone','hSearch'].forEach(id => {
    const el = $(id);
    el.addEventListener(el.tagName === 'INPUT' ? 'input' : 'change', renderHead);
  });

  function loadLoginStats() {
    fetch(API_URL + '?action=getLoginStats&gid=' + encodeURIComponent(user.gid))
      .then(r => r.json())
      .then(res => {
        if (!res.success) return;
        $('totalLogins').textContent = fmtInt(res.totalLogins);
        $('loginTbody').innerHTML = (res.stats || [])
          .sort((a, b) => b.count - a.count)
          .map(s => `<tr>
            <td>${safe(s.gid)}</td><td>${safe(s.name)}</td><td>${safe(s.role)}</td>
            <td>${safe(s.zone)}</td><td><b>${fmtInt(s.count)}</b></td>
            <td>${safe(s.lastLogin)}</td>
          </tr>`).join('');
      });
  }

  load();
})();
