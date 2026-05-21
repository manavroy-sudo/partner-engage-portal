// ====================================================================
// app.js — v9 ADDITIONS: "My Activity" Call/Visit Summary Card
// ====================================================================
// WHERE TO INSERT IN YOUR EXISTING app.js:
//
//  1. Add loadMyActivity() call inside your existing initDashboard()
//     or wherever you fire the initial data fetch. Example:
//
//       async function initDashboard() {
//         await loadPartnerData();      // existing
//         await loadMyActivity();       // ← ADD THIS LINE
//       }
//
//  2. Add a <div id="my-activity-card"></div> to dashboard.html
//     inside the KPI/summary section at the top of the dashboard.
//     (See dashboard.html additions below.)
//
//  3. Paste the three functions below anywhere in app.js.
// ====================================================================

/**
 * Fetches and renders the "My Activity" call/visit summary card.
 * Works for all roles: AM, RM, SH, RH, ZH.
 */
async function loadMyActivity() {
  var wrap = document.getElementById('my-activity-card');
  if (!wrap) return;
  wrap.innerHTML = '<div style="text-align:center;padding:12px;color:#94a3b8">Loading activity…</div>';

  try {
    var qs = `action=getOwnerCallVisit&token=${encodeURIComponent(partnerToken)}`;
    var res = await fetch(API_URL + '?' + qs);
    var d = await res.json();
    if (!d.success) throw new Error(d.error || 'Load failed');
    renderMyActivityCard(d.stats);
  } catch(e) {
    wrap.innerHTML = `<div style="color:#dc2626;padding:12px;font-size:.82rem">Activity load failed: ${e.message}</div>`;
  }
}

/**
 * Renders the activity card HTML into #my-activity-card.
 */
function renderMyActivityCard(s) {
  var wrap = document.getElementById('my-activity-card');
  if (!wrap) return;
  s = s || {};
  var total    = s.total    || 0;
  var called   = s.called   || 0;
  var notCall  = s.notCalled || 0;
  var visited  = s.visited  || 0;
  var notVisit = s.notVisited || 0;
  var callsSum = s.callsSum || 0;
  var visSum   = s.visitsSum || 0;

  var calledPct  = total ? Math.round((called  / total) * 100) : 0;
  var visitedPct = total ? Math.round((visited / total) * 100) : 0;

  wrap.innerHTML = `
    <div class="activity-card">
      <div class="activity-card-header">
        <span class="activity-icon">📞</span>
        <span class="activity-title">My Call &amp; Visit Activity</span>
      </div>
      <div class="activity-grid">
        <div class="activity-stat">
          <div class="ast-label">Total Partners</div>
          <div class="ast-value neutral">${total.toLocaleString('en-IN')}</div>
        </div>
        <div class="activity-stat">
          <div class="ast-label">Called</div>
          <div class="ast-value green">${called.toLocaleString('en-IN')}</div>
          <div class="ast-sub">${calledPct}%</div>
        </div>
        <div class="activity-stat">
          <div class="ast-label">Not Called</div>
          <div class="ast-value red">${notCall.toLocaleString('en-IN')}</div>
          <div class="ast-sub">${100-calledPct}%</div>
        </div>
        <div class="activity-stat">
          <div class="ast-label">Visited</div>
          <div class="ast-value green">${visited.toLocaleString('en-IN')}</div>
          <div class="ast-sub">${visitedPct}%</div>
        </div>
        <div class="activity-stat">
          <div class="ast-label">Not Visited</div>
          <div class="ast-value amber">${notVisit.toLocaleString('en-IN')}</div>
          <div class="ast-sub">${100-visitedPct}%</div>
        </div>
        <div class="activity-stat">
          <div class="ast-label">Total Calls</div>
          <div class="ast-value blue">${callsSum.toLocaleString('en-IN')}</div>
        </div>
        <div class="activity-stat">
          <div class="ast-label">Total Visits</div>
          <div class="ast-value blue">${visSum.toLocaleString('en-IN')}</div>
        </div>
      </div>
      <div class="activity-progress">
        <div class="act-prog-row">
          <span class="act-prog-label">Call Coverage</span>
          <div class="act-prog-wrap"><div class="act-prog-fill called" style="width:${calledPct}%"></div></div>
          <span class="act-prog-pct">${calledPct}%</span>
        </div>
        <div class="act-prog-row">
          <span class="act-prog-label">Visit Coverage</span>
          <div class="act-prog-wrap"><div class="act-prog-fill visited" style="width:${visitedPct}%"></div></div>
          <span class="act-prog-pct">${visitedPct}%</span>
        </div>
      </div>
    </div>`;
}

// ====================================================================
// END OF v9 app.js ADDITIONS
// ====================================================================
