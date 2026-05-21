// ====================================================================
// CODE.GS v9 — CALL/VISIT TRACKER ADDITIONS
// ====================================================================
// HOW TO INTEGRATE:
//   1. In your existing Code.gs, find the main switch(action) block
//      inside doGet() or doPost(). Add this ONE LINE to the switch:
//
//         case 'getCallVisitStats': result = getCallVisitStats(params, user); break;
//
//   2. Add the THREE FUNCTIONS below (getCallVisitStats, getZHZoneMap,
//      getOwnerCallVisitForUser) anywhere AFTER the closing brace of
//      doGet() — e.g. at the very bottom of Code.gs.
//
//   3. If your ZONE_CV_CFG columns for Zone_South are wrong, adjust
//      callsCol/visitsCol in the ZONE_CV_CFG constant below.
// ====================================================================

// ── Per-sheet Calls/Visits column indices (0-based) ─────────────────
// Zone_South has MTD at col 27 (+2 from standard), all cols after
// TARGET shift +2 as well → CALLS=31, VISITS=32.
// All other zone sheets use the standard COL.CALLS/COL.VISITS (29/30).
// TELE_RM follows All_Partner List structure (29/30).
// If your sheet differs, edit callsCol/visitsCol below:
const ZONE_CV_CFG = {
  'Zone_North':          { zone: 'North',          callsCol: 29, visitsCol: 30 },
  'Zone_South':          { zone: 'South',          callsCol: 31, visitsCol: 32 },
  'Zone_East & Central': { zone: 'East & Central', callsCol: 29, visitsCol: 30 },
  'Zone_West':           { zone: 'West',           callsCol: 29, visitsCol: 30 },
  'Zone_RON':            { zone: 'RON',            callsCol: 29, visitsCol: 30 },
  'TELE_RM':             { zone: 'TELE_RM',        callsCol: 29, visitsCol: 30 }
};

// ────────────────────────────────────────────────────────────────────
// 1. MAIN FUNCTION — Call/Visit Stats
//    Returns overall, byZone[], byZH[], byOwnerRole{AM/RM/SH/RH}[]
//    Filters by user's allowed zones if not MASTER.
// ────────────────────────────────────────────────────────────────────
function getCallVisitStats(params, user) {
  try {
    var ss = SpreadsheetApp.openById(SHEET_ID);

    // Determine allowed zones (null = all for MASTER/Central team)
    var allowedZones = null;
    if (user && user.role !== 'MASTER' && user.zones && user.zones.length > 0) {
      allowedZones = user.zones;
    }

    var overall = {
      total: 0, called: 0, notCalled: 0,
      visited: 0, notVisited: 0,
      callsSum: 0, visitsSum: 0
    };
    var byZone   = {};   // zone → stats obj
    var byZH     = {};   // zone → { zhName, stats }
    var byOwner  = {};   // 'AM'|'RM'|'SH'|'RH' → { name → stats }
    var seenGids = {};

    // ZH → zone map from Users sheet
    var zhMap = getZHZoneMap(ss);

    // Read each zone sheet
    var sheetNames = Object.keys(ZONE_CV_CFG);
    sheetNames.forEach(function(shName) {
      var cfg    = ZONE_CV_CFG[shName];
      var zoneLbl = cfg.zone;

      // Zone restriction
      if (allowedZones && allowedZones.indexOf(zoneLbl) === -1) return;

      var sh = ss.getSheetByName(shName);
      if (!sh) return;

      var rows = sh.getDataRange().getValues();

      // Init zone bucket
      if (!byZone[zoneLbl]) {
        byZone[zoneLbl] = {
          zone: zoneLbl, total: 0,
          called: 0, notCalled: 0,
          visited: 0, notVisited: 0,
          callsSum: 0, visitsSum: 0
        };
      }
      var zs = byZone[zoneLbl];

      // Init ZH bucket for this zone
      if (!byZH[zoneLbl]) {
        byZH[zoneLbl] = {
          zone: zoneLbl, zhName: zhMap[zoneLbl] || 'Unassigned',
          total: 0, called: 0, visited: 0, callsSum: 0, visitsSum: 0
        };
      }
      var zhs = byZH[zoneLbl];

      for (var r = 2; r < rows.length; r++) {
        var row = rows[r];
        var gidRaw = String(row[1] || '').trim();
        if (!gidRaw) continue;
        var gidKey = gidRaw.toUpperCase();
        if (seenGids[gidKey]) continue;
        seenGids[gidKey] = true;

        var calls   = Math.max(0, parseInt(row[cfg.callsCol])  || 0);
        var visits  = Math.max(0, parseInt(row[cfg.visitsCol]) || 0);
        var rawRole = String(row[6] || '').trim();
        var rawName = String(row[7] || '').trim();
        // Normalise role: keep first meaningful token (AM, RM, SH, RH, ZH)
        var roleKey = rawRole.toUpperCase().split(/[\s_\/]+/)[0];

        // ── Overall ─────────────────────────────────────────────────
        overall.total++;
        overall.callsSum  += calls;
        overall.visitsSum += visits;
        if (calls  > 0) overall.called++;  else overall.notCalled++;
        if (visits > 0) overall.visited++; else overall.notVisited++;

        // ── Zone ────────────────────────────────────────────────────
        zs.total++;
        zs.callsSum  += calls;
        zs.visitsSum += visits;
        if (calls  > 0) zs.called++;  else zs.notCalled++;
        if (visits > 0) zs.visited++; else zs.notVisited++;

        // ── ZH (zone-level rollup) ───────────────────────────────────
        zhs.total++;
        zhs.callsSum  += calls;
        zhs.visitsSum += visits;
        if (calls  > 0) zhs.called++;
        if (visits > 0) zhs.visited++;

        // ── Owner (AM / RM / SH / RH) ───────────────────────────────
        var OWNER_ROLES = ['AM','RM','SH','RH'];
        if (rawName && OWNER_ROLES.indexOf(roleKey) !== -1) {
          if (!byOwner[roleKey]) byOwner[roleKey] = {};
          if (!byOwner[roleKey][rawName]) {
            byOwner[roleKey][rawName] = {
              name: rawName, role: roleKey, zone: zoneLbl,
              total: 0, called: 0, visited: 0, callsSum: 0, visitsSum: 0
            };
          }
          var o = byOwner[roleKey][rawName];
          o.total++;
          o.callsSum  += calls;
          o.visitsSum += visits;
          if (calls  > 0) o.called++;
          if (visits > 0) o.visited++;
        }
      } // end row loop
    }); // end sheet loop

    // Convert dicts → arrays, sort by callsSum desc
    var byOwnerArr = {};
    Object.keys(byOwner).forEach(function(role) {
      byOwnerArr[role] = Object.values(byOwner[role]).sort(function(a,b) {
        return b.callsSum - a.callsSum;
      });
    });

    return {
      success:     true,
      overall:     overall,
      byZone:      Object.values(byZone),
      byZH:        Object.values(byZH),
      byOwnerRole: byOwnerArr   // keys: AM, RM, SH, RH
    };

  } catch(e) {
    return { success: false, error: e.message };
  }
}

// ────────────────────────────────────────────────────────────────────
// 2. HELPER — Read ZH names from Users sheet
//    Returns { 'North':'Anil Kumar', 'South':'Bhagyaraj V', ... }
//    Reads col D (index 3) = Role, col C (index 2) = Name,
//            col E (index 4) = Zone(s) comma-separated.
//    Adjust indices if your Users sheet columns differ.
// ────────────────────────────────────────────────────────────────────
function getZHZoneMap(ss) {
  var map = {};
  try {
    var sh = ss.getSheetByName(USERS_SHEET);
    if (!sh) return map;
    var rows = sh.getDataRange().getValues();
    for (var r = 1; r < rows.length; r++) {
      var role  = String(rows[r][3] || '').trim().toUpperCase(); // col D
      var name  = String(rows[r][2] || '').trim();               // col C
      var zones = String(rows[r][4] || '').trim();               // col E
      if (role === 'ZH' && name && zones) {
        zones.split(',').forEach(function(z) {
          map[z.trim()] = name;
        });
      }
    }
  } catch(e) { /* silent — return partial map */ }
  return map;
}

// ────────────────────────────────────────────────────────────────────
// 3. INDIVIDUAL USER VIEW — Call/Visit stats for logged-in user
//    Used by app.js "My Activity" card.
//    Returns stats only for partners the user directly manages.
// ────────────────────────────────────────────────────────────────────
function getOwnerCallVisitForUser(params, user) {
  try {
    if (!user) return { success: false, error: 'Not authenticated' };

    var ss = SpreadsheetApp.openById(SHEET_ID);
    var stats = { total:0, called:0, notCalled:0, visited:0, notVisited:0, callsSum:0, visitsSum:0 };
    var seenGids = {};

    var sheetNames = Object.keys(ZONE_CV_CFG);

    sheetNames.forEach(function(shName) {
      // Zone restriction
      var cfg = ZONE_CV_CFG[shName];
      if (user.zones && user.zones.length && user.zones.indexOf(cfg.zone) === -1) return;

      var sh = ss.getSheetByName(shName);
      if (!sh) return;
      var rows = sh.getDataRange().getValues();

      for (var r = 2; r < rows.length; r++) {
        var row    = rows[r];
        var gidRaw = String(row[1] || '').trim();
        if (!gidRaw) continue;
        var gidKey = gidRaw.toUpperCase();
        if (seenGids[gidKey]) continue;

        var ownerName = String(row[7] || '').trim();
        var ownerRole = String(row[6] || '').trim().toUpperCase();

        // AM sees only their own; SH/RH/RM see all within zone (already filtered)
        var isOwned = false;
        if (['ZH','MASTER'].indexOf(user.role) !== -1) {
          isOwned = true; // sees entire zone
        } else if (user.role === 'AM') {
          isOwned = (ownerName.toUpperCase() === user.name.toUpperCase() && ownerRole === 'AM');
        } else {
          // SH / RH / RM — sees all partners in their zone
          isOwned = true;
        }

        if (!isOwned) continue;
        seenGids[gidKey] = true;

        var calls  = Math.max(0, parseInt(row[cfg.callsCol])  || 0);
        var visits = Math.max(0, parseInt(row[cfg.visitsCol]) || 0);

        stats.total++;
        stats.callsSum  += calls;
        stats.visitsSum += visits;
        if (calls  > 0) stats.called++;  else stats.notCalled++;
        if (visits > 0) stats.visited++; else stats.notVisited++;
      }
    });

    return { success: true, stats: stats };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

// ====================================================================
// END OF v9 ADDITIONS
// ====================================================================
//
// ALSO ADD these two lines inside your doGet/doPost switch(action){...}:
//
//   case 'getCallVisitStats':
//     result = getCallVisitStats(params, user);
//     break;
//
//   case 'getOwnerCallVisit':
//     result = getOwnerCallVisitForUser(params, user);
//     break;
//
// ====================================================================
