// ====================================================================
// AM and Above Focused Partners — Code.gs v9
// CHANGES FROM v8:
//  1.  AM partner loading FIXED — reads ALL zone sheets (not just All_Partner List)
//      Root cause: getUserZones() returned [] for AM, so Zone_North partners
//      of an AM were never loaded. Now AM has its own multi-sheet scan.
//  2.  myPartners FIXED for AM — was always returning [] for AM users.
//      Now returns the full partners array (all of the AM's own partners).
//  3.  getPartnerDetail — new action: fetches one partner's full history
//      across all sheets. Used by the VIEW button / trend modal in app.js.
//  4.  buildHierarchyTree — new helper: flat list of every owner at every
//      role level with summary + partner count. Returned in getDashboard
//      as `hierarchyTree` for ZH/RH/SH drill-down.
//  5.  buildTeamBreakdown — now includes `partnerList` array per member
//      (partner GID, name, metrics, monthlyData) for in-modal drill-down.
//  6.  buildAmPerformance & buildRolePerformance — now include `partnerList`.
//  7.  getDashboard — TELE_RM zone partners merged for mixed-zone users;
//      monthLabels array added to response so frontend can label trend charts.
//  8.  getMasterDashboard — `teleRMPerf` added (AM-level perf inside TELE_RM);
//      stateSummaries now include `zone` field.
//  9.  MONTH_LABELS constant added (14 months, Apr'25 → May'26).
//  10. buildPartnerObj — FTD field now extracted and stored.
//  11. loadUserPartners — also loads from dedicated zone sheets (South, East,
//      West, RON) when user has those zones, not just All_Partner List.
// ====================================================================

const SHEET_ID      = '1AgPaAik0vjh_9fcxX4NdV33-hWd4S5qNzwuFXb3xOis';
const SHEET_NAME    = 'All_Partner List';
const NORTH_SHEET   = 'Zone_North';
const USERS_SHEET   = 'Users';
const LOG_SHEET     = 'LoginLog';
const DAILY_SHEET   = 'DailyMTD';
const TELE_RM_SHEET = 'TELE_RM';

// Zone-specific sheets loaded in priority order (before All_Partner List)
const OTHER_ZONE_SHEETS = ['Zone_South', 'Zone_East & Central', 'Zone_West', 'Zone_RON'];

// All sheets searched for a single partner lookup (getPartnerDetail)
const ALL_DATA_SHEETS = [
  'Zone_North', 'Zone_South', 'Zone_East & Central', 'Zone_West', 'Zone_RON',
  'TELE_RM', 'All_Partner List'
];

// 14-month trend labels — adjust to match your actual spreadsheet column headers
const MONTH_LABELS = [
  "Apr'25","May'25","Jun'25","Jul'25","Aug'25","Sep'25","Oct'25",
  "Nov'25","Dec'25","Jan'26","Feb'26","Mar'26","Apr'26","May'26"
];

// ── Per-sheet column maps (ALL 0-BASED INDICES) ──────────────────────

// Standard zone sheets: Zone_North / Zone_RON / Zone_East & Central / Zone_West
// No "Zone" column, so owner cols start at 6.
const COL = {
  GID:1, NAME:2, CITY:3, STATE:4, EMP_ID:5,
  OWNER_ROLE:6, OWNER_NAME:7,
  MONTH_START:10, MONTH_END:22,          // Apr'25 → Apr'26 (13 months)
  OVERALL_POTENTIAL:23,
  TARGET:24, MTD:25, LMTD:26,            // Z=25 ✓
  ACTIVE:27, GROWTH:28,
  CALLS:29, VISITS:30,
  REMARK_SHEET:33, REMARK_PARTNER:34
};

// Zone_South: MTD at AB (index 27). All cols shift +2 from standard.
const COL_SOUTH = {
  GID:1, NAME:2, CITY:3, STATE:4, EMP_ID:5,
  OWNER_ROLE:6, OWNER_NAME:7,
  MONTH_START:10, MONTH_END:22,
  OVERALL_POTENTIAL:23,
  TARGET:24, FTD:25, UNKNOWN:26, MTD:27, LMTD:28, // AB=27 ✓
  ACTIVE:29, GROWTH:30,
  CALLS:31, VISITS:32,
  REMARK_SHEET:35, REMARK_PARTNER:36
};

// All_Partner List & TELE_RM: has "Zone" column at F(5).
// Owner cols shift +1, monthly data shifts +1, FTD exists before MTD.
// MTD at AC (index 28) ✓
const COL_MAIN = {
  GID:1, NAME:2, CITY:3, STATE:4,
  EMP_ID:6,           // col G
  OWNER_ROLE:7,       // col H
  OWNER_NAME:8,       // col I
  MONTH_START:11, MONTH_END:23,  // 13 months Apr'25–Apr'26
  OVERALL_POTENTIAL:25,          // col Z
  TARGET:26,                     // col AA
  FTD:27,                        // col AB
  MTD:28, LMTD:29,               // col AC ✓
  ACTIVE:30, GROWTH:31,
  CALLS:32, VISITS:33,
  REMARK_SHEET:36, REMARK_PARTNER:37
};

// TELE_RM ZHs — these users see ONLY the TELE_RM sheet
const TELE_RM_ZHS  = ['AYUSH GUPTA'];

const ROLE_LEVEL   = { ZH:5, RH:4, SH:3, RM:2, AM:1, MASTER:99 };
const MASTER_GIDS  = ['MASTER', 'IDK-MASTER', 'CENTRAL'];
const TELE_RM_KW   = ['TELE-RM', 'TELE RM', 'TELERM'];

// ZH → zone-states map.  AYUSH GUPTA handled separately via TELE_RM_ZHS.
const ZH_ZONE_MAP = {
  'Anil Kumar':                  ['North','North Key','NCR','UP1','UP2','UK1','UK2'],
  'Bhagyaraj V':                 ['South','Karnataka','Kerala','Tamil Nadu','Telangana','Andhra Pradesh'],
  'Paras Nayak':                 ['East','West Bengal','Orissa','North East','Bihar','Jharkhand'],
  'Trivedi Kuldeep Bhanwarlal':  ['West','Mumbai','Pune','Gujarat','Rajasthan 1','Rajasthan 2','MP/CG'],
  'Tushar Banerjee':             ['East','Bengal','East Central'],
  'Virendra A Ghuge':            ['RON','ROM 1','ROM 2']
};

// Zone sheet lookup (used in loadUserPartners to know which sheet to use per zone)
const ZONE_SHEET_MAP = {
  'South': 'Zone_South',
  'East':  'Zone_East & Central',
  'West':  'Zone_West',
  'RON':   'Zone_RON'
};

// ====================================================================
// ENTRY POINT
// ====================================================================
function doGet(e) {
  var p = e.parameter || {};
  var result;
  try {
    switch (p.action) {
      case 'login':            result = handleLogin(p.gid, p.password);                       break;
      case 'checkPassword':    result = checkPasswordStatus(p.gid);                            break;
      case 'setPassword':      result = setPassword(p.gid, p.oldPassword, p.newPassword);      break;
      case 'getDashboard':     result = getDashboard(p.gid);                                   break;
      case 'getMaster':        result = getMasterDashboard(p.gid);                             break;
      case 'saveRemark':       result = saveRemark(p.gid, p.partnerGid, p.remark);             break;
      case 'getLoginStats':    result = getLoginStats(p.gid);                                  break;
      case 'getDailyTracking': result = getDailyTracking(p.gid);                               break;
      case 'getPartnerDetail': result = getPartnerDetail(p.gid, p.partnerGid);                 break; // v9 NEW
      default:                 result = { success:false, message:'Unknown action.' };
    }
  } catch (err) {
    result = { success:false, message:'Server error: ' + err.message + ' | ' + String(err.stack || '') };
  }
  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ====================================================================
// TELE-RM ROW FILTER
// Only used when excluding TELE rows from regular zone sheets / All_Partner List.
// NOT applied when reading the TELE_RM sheet itself.
// ====================================================================
function isTeleRMRow(row, col) {
  var c         = col || COL;
  var ownerRole = String(row[c.OWNER_ROLE] || '').trim().toUpperCase();
  for (var i = 0; i < TELE_RM_KW.length; i++) {
    if (ownerRole.indexOf(TELE_RM_KW[i]) !== -1) return true;
  }
  // Also exclude if state contains 'tele'
  var state = String(row[COL.STATE] || '').trim().toLowerCase();
  if (state.indexOf('tele') !== -1) return true;
  return false;
}

// ====================================================================
// PARTNER OBJECT BUILDER  (v9: FTD field added, monthLabels attached)
// ====================================================================
function buildPartnerObj(row, col) {
  var c           = col || COL;
  var monthlyData = [];
  for (var m = c.MONTH_START; m <= c.MONTH_END; m++) {
    monthlyData.push(parseNumber(row[m]));
  }
  var maxPotential = monthlyData.length ? Math.max.apply(null, monthlyData) : 0;
  var currentMonth = parseNumber(row[c.MTD]);
  var prevMonth    = parseNumber(row[c.LMTD]);
  var ftd          = (c.FTD !== undefined) ? parseNumber(row[c.FTD]) : 0;

  var activeRaw = String(row[c.ACTIVE] || '').trim().toLowerCase();
  var isActive  = activeRaw === '1' || activeRaw === 'active' ||
                  activeRaw === 'yes' || currentMonth > 0;

  var growthRaw = String(row[c.GROWTH] || '').trim();
  var growthNum = parseFloat(String(growthRaw).replace(/[^\-\d.]/g, ''));
  var isGrowth;
  if      (growthRaw.toLowerCase().indexOf('degrowth') !== -1) isGrowth = false;
  else if (growthRaw.toLowerCase().indexOf('growth')   !== -1) isGrowth = true;
  else if (!isNaN(growthNum))                                   isGrowth = growthNum >= 0;
  else                                                          isGrowth = currentMonth >= prevMonth;

  var callsRaw  = String(row[c.CALLS]  || '').trim();
  var visitsRaw = String(row[c.VISITS] || '').trim();

  return {
    gid:              String(row[c.GID]          || '').trim(),
    name:             String(row[c.NAME]         || '').trim(),
    city:             String(row[c.CITY]         || '').trim(),
    state:            String(row[c.STATE]        || '').trim(),
    ownerRole:        String(row[c.OWNER_ROLE]   || '').trim().toUpperCase(),
    ownerName:        String(row[c.OWNER_NAME]   || '').trim(),
    overallPotential: parseNumber(row[c.OVERALL_POTENTIAL]),
    maxPotential:     maxPotential,
    target:           parseNumber(row[c.TARGET]),
    ftd:              ftd,
    currentMonth:     currentMonth,
    prevMonth:        prevMonth,
    monthlyData:      monthlyData,
    monthLabels:      MONTH_LABELS.slice(0, monthlyData.length),  // v9: always attached
    isActive:         isActive,
    isGrowth:         isGrowth,
    calls:            parseNumber(callsRaw),
    visits:           parseNumber(visitsRaw),
    connected:        (callsRaw !== '' && callsRaw !== '0') || (visitsRaw !== '' && visitsRaw !== '0'),
    remark:           String(row[c.REMARK_PARTNER] || row[c.REMARK_SHEET] || '').trim()
  };
}

// ====================================================================
// COLUMN MAP SELECTOR
// ====================================================================
function getColForSheet(sheetName) {
  if (sheetName === 'Zone_South')                                  return COL_SOUTH;
  if (sheetName === TELE_RM_SHEET || sheetName === SHEET_NAME)    return COL_MAIN;
  return COL; // Zone_North, Zone_RON, Zone_East & Central, Zone_West
}

// ====================================================================
// TELE_RM SHEET LOADER
// ====================================================================
function loadTeleRMPartners(ss) {
  var sh = ss.getSheetByName(TELE_RM_SHEET);
  if (!sh) return [];
  var rows     = sh.getDataRange().getValues();
  var partners = [];
  for (var r = 2; r < rows.length; r++) {
    var row = rows[r];
    if (!row[COL_MAIN.GID] || String(row[COL_MAIN.GID]).trim() === '') continue;
    var p  = buildPartnerObj(row, COL_MAIN);
    p.zone = 'TELE_RM';
    partners.push(p);
  }
  return partners;
}

// ====================================================================
// LOAD ALL PARTNERS  (master / pan-India view, excludes TELE_RM)
// ====================================================================
function loadAllPartners(ss) {
  var allPartners = [];
  var seenGids    = {};

  // 1. Zone_North (authoritative for North zone data)
  var northSheet = ss.getSheetByName(NORTH_SHEET);
  if (northSheet) {
    var nRows = northSheet.getDataRange().getValues();
    for (var r = 2; r < nRows.length; r++) {
      var row = nRows[r];
      if (!row[COL.GID] || String(row[COL.GID]).trim() === '') continue;
      if (isTeleRMRow(row, COL)) continue;
      var gid = String(row[COL.GID]).trim().toUpperCase();
      if (!seenGids[gid]) { seenGids[gid] = true; allPartners.push(buildPartnerObj(row, COL)); }
    }
  }

  // 2. Other dedicated zone sheets
  OTHER_ZONE_SHEETS.forEach(function(sheetName) {
    var sh = ss.getSheetByName(sheetName);
    if (!sh) return;
    var col  = getColForSheet(sheetName);
    var rows = sh.getDataRange().getValues();
    for (var r = 2; r < rows.length; r++) {
      var row = rows[r];
      if (!row[col.GID] || String(row[col.GID]).trim() === '') continue;
      if (isTeleRMRow(row, col)) continue;
      var gid = String(row[col.GID]).trim().toUpperCase();
      if (!seenGids[gid]) { seenGids[gid] = true; allPartners.push(buildPartnerObj(row, col)); }
    }
  });

  // 3. All_Partner List — fill any remaining gaps (skip dupes & TELE_RM rows)
  var mainSheet = ss.getSheetByName(SHEET_NAME);
  if (mainSheet) {
    var mRows = mainSheet.getDataRange().getValues();
    for (var r = 2; r < mRows.length; r++) {
      var row = mRows[r];
      if (!row[COL_MAIN.GID] || String(row[COL_MAIN.GID]).trim() === '') continue;
      if (isTeleRMRow(row, COL_MAIN)) continue;
      var gid = String(row[COL_MAIN.GID]).trim().toUpperCase();
      if (seenGids[gid]) continue;
      if (northSheet && zoneOfState(String(row[COL_MAIN.STATE] || '').trim()) === 'North') continue;
      seenGids[gid] = true;
      allPartners.push(buildPartnerObj(row, COL_MAIN));
    }
  }
  return allPartners;
}

// ====================================================================
// LOAD PARTNERS FOR A SPECIFIC USER  (v9: FIXED for AM + zone sheets)
// ====================================================================
function loadUserPartners(ss, user) {
  var partners = [];
  var seenGids = {};
  var myZones  = [];

  // ── v9 FIX: AM users scan ALL sheets for ownerRole=AM + ownerName match ─
  // Previously only All_Partner List was scanned for AM, so Zone_North partners
  // of an AM were invisible. Now we hit every sheet.
  if (user.role === 'AM') {
    var sheetsToScan = [NORTH_SHEET]
      .concat(OTHER_ZONE_SHEETS)
      .concat([TELE_RM_SHEET, SHEET_NAME]);

    sheetsToScan.forEach(function(shName) {
      var sh = ss.getSheetByName(shName);
      if (!sh) return;
      var col  = getColForSheet(shName);
      var rows = sh.getDataRange().getValues();
      for (var r = 2; r < rows.length; r++) {
        var row = rows[r];
        if (!row[col.GID] || String(row[col.GID]).trim() === '') continue;
        var ownerRole = String(row[col.OWNER_ROLE] || '').trim().toUpperCase();
        var ownerName = String(row[col.OWNER_NAME] || '').trim().toLowerCase();
        if (ownerRole !== 'AM' || ownerName !== user.name.toLowerCase()) continue;
        var gid = String(row[col.GID]).trim().toUpperCase();
        if (seenGids[gid]) continue;
        seenGids[gid] = true;
        var p  = buildPartnerObj(row, col);
        p.zone = (shName === TELE_RM_SHEET) ? 'TELE_RM' : zoneOfState(p.state);
        partners.push(p);
        var z  = p.zone || zoneOfState(p.state);
        if (z && z !== 'Other' && myZones.indexOf(z) === -1) myZones.push(z);
      }
    });
    return { partners: partners, myZones: myZones };
  }

  // ── Non-AM users: zone-based filtering ──────────────────────────────
  var mainSheet = ss.getSheetByName(SHEET_NAME);
  if (!mainSheet) return { partners: [], myZones: [] };
  var rows = mainSheet.getDataRange().getValues();
  myZones  = getUserZones(user, rows);

  // North supplement — load from Zone_North sheet when user covers North zone
  var northPartners   = {};
  var northSheet      = ss.getSheetByName(NORTH_SHEET);
  var northZoneActive = myZones.indexOf('North') !== -1;
  if (northZoneActive && northSheet) {
    var nRows = northSheet.getDataRange().getValues();
    for (var r = 2; r < nRows.length; r++) {
      var row = nRows[r];
      if (!row[COL.GID] || String(row[COL.GID]).trim() === '') continue;
      if (isTeleRMRow(row, COL)) continue;
      var state     = String(row[COL.STATE]      || '').trim();
      var ownerRole = String(row[COL.OWNER_ROLE] || '').trim().toUpperCase();
      var ownerName = String(row[COL.OWNER_NAME] || '').trim();
      if (!canUserSeePartner(user, myZones, state, ownerRole, ownerName)) continue;
      var gid = String(row[COL.GID]).trim().toUpperCase();
      northPartners[gid] = buildPartnerObj(row, COL);
    }
  }

  // v9 FIX: Load other zone-specific sheets when user covers those zones
  // Previously only All_Partner List was used — this missed zone-sheet-only rows.
  var otherZonePartners = {};
  Object.keys(ZONE_SHEET_MAP).forEach(function(zone) {
    if (myZones.indexOf(zone) === -1) return;
    var sh = ss.getSheetByName(ZONE_SHEET_MAP[zone]);
    if (!sh) return;
    var col    = getColForSheet(ZONE_SHEET_MAP[zone]);
    var shRows = sh.getDataRange().getValues();
    for (var r = 2; r < shRows.length; r++) {
      var row = shRows[r];
      if (!row[col.GID] || String(row[col.GID]).trim() === '') continue;
      if (isTeleRMRow(row, col)) continue;
      var gid = String(row[col.GID]).trim().toUpperCase();
      if (northPartners[gid] || otherZonePartners[gid]) continue;
      var state     = String(row[col.STATE]      || '').trim();
      var ownerRole = String(row[col.OWNER_ROLE] || '').trim().toUpperCase();
      var ownerName = String(row[col.OWNER_NAME] || '').trim();
      if (!canUserSeePartner(user, myZones, state, ownerRole, ownerName)) continue;
      otherZonePartners[gid] = buildPartnerObj(row, col);
    }
  });

  // Merge North + dedicated zone sheets first
  Object.keys(northPartners).forEach(function(gid) {
    seenGids[gid] = true;
    partners.push(northPartners[gid]);
  });
  Object.keys(otherZonePartners).forEach(function(gid) {
    if (!seenGids[gid]) { seenGids[gid] = true; partners.push(otherZonePartners[gid]); }
  });

  // All_Partner List — fill remaining gaps
  for (var r = 2; r < rows.length; r++) {
    var row = rows[r];
    if (!row[COL_MAIN.GID] || String(row[COL_MAIN.GID]).trim() === '') continue;
    if (isTeleRMRow(row, COL_MAIN)) continue;
    var gid = String(row[COL_MAIN.GID]).trim().toUpperCase();
    if (seenGids[gid]) continue;
    var state     = String(row[COL_MAIN.STATE]      || '').trim();
    var ownerRole = String(row[COL_MAIN.OWNER_ROLE] || '').trim().toUpperCase();
    var ownerName = String(row[COL_MAIN.OWNER_NAME] || '').trim();
    if (northZoneActive && northSheet && zoneOfState(state) === 'North') continue;
    if (!canUserSeePartner(user, myZones, state, ownerRole, ownerName)) continue;
    seenGids[gid] = true;
    partners.push(buildPartnerObj(row, COL_MAIN));
  }

  return { partners: partners, myZones: myZones };
}

// ====================================================================
// ZONE LOGIC
// ====================================================================
function zoneOfState(state) {
  var s = (state || '').toLowerCase().trim();
  if (!s) return 'Other';
  if (['north','north key','ncr','delhi','up1','up2','uk1','uk2','haryana',
       'punjab','chandigarh','himachal','j&k','uttarakhand']
      .some(function(z){ return s === z || s.indexOf(z) !== -1; })) return 'North';
  if (['gujarat','rajasthan','mp/cg','madhya','mumbai','pune','maharashtra','goa']
      .some(function(z){ return s.indexOf(z) !== -1; })) return 'West';
  if (['karnataka','kerala','tamil','telangana','andhra','south',
       'chennai','bangalore','hyderabad']
      .some(function(z){ return s.indexOf(z) !== -1; })) return 'South';
  if (['bengal','orissa','north east','bihar','jharkhand','east central','assam','odisha']
      .some(function(z){ return s.indexOf(z) !== -1; })) return 'East';
  if (['ron','rom'].some(function(z){ return s.indexOf(z) !== -1; })) return 'RON';
  if (['tele'].some(function(z){ return s.indexOf(z) !== -1; }))      return 'TELE_RM';
  return 'Other';
}

function detectUserZones(user, allRows) {
  var myName = user.name.toLowerCase();
  var zones  = {};
  for (var r = 2; r < allRows.length; r++) {
    var row = allRows[r];
    if (!row[COL_MAIN.GID] || String(row[COL_MAIN.GID]).trim() === '') continue;
    if (isTeleRMRow(row, COL_MAIN)) continue;
    if (String(row[COL_MAIN.OWNER_ROLE] || '').trim().toUpperCase() === user.role &&
        String(row[COL_MAIN.OWNER_NAME] || '').trim().toLowerCase() === myName) {
      zones[zoneOfState(String(row[COL_MAIN.STATE] || '').trim())] = true;
    }
  }
  return Object.keys(zones).filter(function(z){ return z && z !== 'Other'; });
}

function getUserZones(user, allRows) {
  if (user.role === 'MASTER') return [];
  // AM: loadUserPartners handles zone detection internally — no pre-detection needed
  if (user.role === 'AM')     return [];
  if (user.role === 'ZH') {
    if (TELE_RM_ZHS.indexOf(user.name.toUpperCase()) !== -1) return ['TELE_RM'];
    var states = ZH_ZONE_MAP[user.name] || [];
    var zSet   = {};
    states.forEach(function(st) {
      zSet[zoneOfState(st)] = true;
      var lc = st.toLowerCase();
      if (['north','south','east','west','ron'].indexOf(lc) !== -1)
        zSet[lc.charAt(0).toUpperCase() + lc.slice(1)] = true;
    });
    return Object.keys(zSet);
  }
  return detectUserZones(user, allRows);
}

// ====================================================================
// ACCESS CONTROL
// ====================================================================
function canUserSeePartner(user, myZones, state, ownerRole, ownerName) {
  if (isMasterUser(user)) return true;
  // AM: only their own directly assigned partners
  if (user.role === 'AM') {
    return ownerRole === 'AM' && ownerName.toLowerCase() === user.name.toLowerCase();
  }
  var z = zoneOfState(state);
  if (!myZones.length || myZones.indexOf(z) === -1) return false;
  if (user.role === 'ZH') return true;  // ZH sees everyone in their zone
  var myLevel    = ROLE_LEVEL[user.role]  || 0;
  var ownerLevel = ROLE_LEVEL[ownerRole]  || 0;
  // Can see own partners AND those managed by lower-level staff
  if (ownerRole === user.role && ownerName.toLowerCase() === user.name.toLowerCase()) return true;
  if (ownerLevel > 0 && ownerLevel < myLevel) return true;
  return false;
}

// ====================================================================
// AGGREGATIONS
// ====================================================================
function buildSummary(partners) {
  var curr = 0, prev = 0, maxPot = 0, overallPot = 0, target = 0;
  var active = 0, growth = 0, connected = 0, calls = 0, visits = 0;
  var total = partners.length;
  for (var i = 0; i < total; i++) {
    var p = partners[i];
    curr       += p.currentMonth;
    prev       += p.prevMonth;
    maxPot     += p.maxPotential;
    overallPot += p.overallPotential;
    target     += p.target;
    if (p.isActive)  active++;
    if (p.isGrowth)  growth++;
    if (p.connected) connected++;
    calls  += p.calls;
    visits += p.visits;
  }
  var mom    = prev   > 0 ? Math.round((curr - prev) / prev * 100)   : 0;
  var ach    = target > 0 ? Math.round(curr / target * 100)           : 0;
  var maxAch = maxPot > 0 ? Math.round(curr / maxPot * 100)          : 0;
  return {
    totalPartners:         total,
    activeCount:           active,
    inactiveCount:         total - active,
    currentMonthPremium:   curr,
    prevMonthPremium:      prev,
    totalMaxPotential:     maxPot,
    totalOverallPotential: overallPot,
    totalTarget:           target,
    growthCount:           growth,
    degrowthCount:         total - growth,
    connectedCount:        connected,
    notConnectedCount:     total - connected,
    totalCalls:            calls,
    totalVisits:           visits,
    achievementPct:        ach,
    momPct:                mom,
    maxPotAchPct:          maxAch,
    engagementPct:         total > 0 ? Math.round(connected / total * 100) : 0,
    activePct:             total > 0 ? Math.round(active    / total * 100) : 0,
    growthPct:             total > 0 ? Math.round(growth    / total * 100) : 0
  };
}

function buildOverallProject(partners) {
  var s = buildSummary(partners);
  return {
    totalPartners:       s.totalPartners,
    activePartners:      s.activeCount,
    inactivePartners:    s.inactiveCount,
    connectedPartners:   s.connectedCount,
    nonConnectedPartners:s.notConnectedCount,
    calls:               s.totalCalls,
    visits:              s.totalVisits,
    businessGenerated:   s.currentMonthPremium,
    lmtd:                s.prevMonthPremium,
    maxPotential:        s.totalMaxPotential,
    overallPotential:    s.totalOverallPotential,
    target:              s.totalTarget,
    achievementPct:      s.achievementPct,
    maxPotAchPct:        s.maxPotAchPct,
    momPct:              s.momPct,
    growthCount:         s.growthCount,
    degrowthCount:       s.degrowthCount,
    engagementPct:       s.engagementPct,
    activePct:           s.activePct,
    growthPct:           s.growthPct
  };
}

// Helper: build a lightweight partner summary row (for partnerList arrays)
function partnerRow(p) {
  return {
    gid:             p.gid,
    name:            p.name,
    city:            p.city,
    state:           p.state,
    ownerRole:       p.ownerRole,
    ownerName:       p.ownerName,
    currentMonth:    p.currentMonth,
    prevMonth:       p.prevMonth,
    ftd:             p.ftd,
    target:          p.target,
    maxPotential:    p.maxPotential,
    overallPotential:p.overallPotential,
    isActive:        p.isActive,
    isGrowth:        p.isGrowth,
    connected:       p.connected,
    calls:           p.calls,
    visits:          p.visits,
    monthlyData:     p.monthlyData,
    monthLabels:     p.monthLabels,
    remark:          p.remark,
    zone:            p.zone || zoneOfState(p.state)
  };
}

// v9: includes partnerList per team member for in-modal drill-down
function buildTeamBreakdown(partners, user) {
  var myLevel = ROLE_LEVEL[user.role] || 0;
  var teamMap = {};
  partners.forEach(function(p) {
    var pLevel = ROLE_LEVEL[p.ownerRole] || 0;
    if (pLevel >= myLevel) return;  // exclude same/higher level
    var key = p.ownerRole + '|' + p.ownerName;
    if (!teamMap[key]) teamMap[key] = { role: p.ownerRole, name: p.ownerName, partners: [] };
    teamMap[key].partners.push(p);
  });
  return Object.keys(teamMap).map(function(key) {
    var m = teamMap[key];
    var s = buildSummary(m.partners);
    return {
      role:         m.role,
      name:         m.name,
      summary:      s,
      overallProject: buildOverallProject(m.partners),
      partnerCount: m.partners.length,
      states:       uniqueSorted(m.partners.map(function(p){ return p.state; })),
      partnerList:  m.partners.map(partnerRow)  // v9: full list for drill-down
    };
  }).sort(function(a, b){ return b.summary.currentMonthPremium - a.summary.currentMonthPremium; });
}

// v9: includes partnerList for VIEW drill-down
function buildAmPerformance(partners) {
  var amMap = {};
  partners.forEach(function(p) {
    if (p.ownerRole !== 'AM') return;
    if (!amMap[p.ownerName]) amMap[p.ownerName] = [];
    amMap[p.ownerName].push(p);
  });
  return Object.keys(amMap).map(function(name) {
    var pts = amMap[name];
    return {
      name:          name,
      role:          'AM',
      states:        uniqueSorted(pts.map(function(p){ return p.state; })),
      cities:        uniqueSorted(pts.map(function(p){ return p.city; })),
      summary:       buildSummary(pts),
      overallProject:buildOverallProject(pts),
      partnerCount:  pts.length,
      partnerList:   pts.map(partnerRow)  // v9
    };
  }).sort(function(a, b){ return b.summary.currentMonthPremium - a.summary.currentMonthPremium; });
}

// v9: includes partnerList + zone field per member
function buildRolePerformance(partners, role) {
  var map = {};
  partners
    .filter(function(p){ return p.ownerRole === role; })
    .forEach(function(p) {
      if (!map[p.ownerName]) map[p.ownerName] = [];
      map[p.ownerName].push(p);
    });
  return Object.keys(map).map(function(name) {
    var pts = map[name];
    var zones = uniqueSorted(pts.map(function(p){ return p.zone || zoneOfState(p.state); }));
    return {
      name:          name,
      role:          role,
      zone:          zones.join(', '),
      zones:         zones,
      states:        uniqueSorted(pts.map(function(p){ return p.state; })),
      summary:       buildSummary(pts),
      overallProject:buildOverallProject(pts),
      partnerCount:  pts.length,
      partnerList:   pts.map(partnerRow)  // v9
    };
  }).sort(function(a, b){ return b.summary.currentMonthPremium - a.summary.currentMonthPremium; });
}

// v9 NEW: flat hierarchy tree — every owner at every level with summary
// Returned as `hierarchyTree` for ZH/RH/SH drill-down views in app.js
function buildHierarchyTree(partners) {
  var tree = {};
  partners.forEach(function(p) {
    if (!p.ownerRole || !p.ownerName) return;
    var key = p.ownerRole + '|' + p.ownerName;
    if (!tree[key]) tree[key] = { role: p.ownerRole, name: p.ownerName, partners: [] };
    tree[key].partners.push(p);
  });
  return Object.keys(tree).map(function(key) {
    var m = tree[key];
    var s = buildSummary(m.partners);
    return {
      role:         m.role,
      name:         m.name,
      summary:      s,
      partnerCount: m.partners.length,
      states:       uniqueSorted(m.partners.map(function(p){ return p.state; })),
      zones:        uniqueSorted(m.partners.map(function(p){ return p.zone || zoneOfState(p.state); }))
    };
  }).sort(function(a, b) {
    var la = ROLE_LEVEL[a.role] || 0, lb = ROLE_LEVEL[b.role] || 0;
    if (lb !== la) return lb - la;  // higher role level first
    return b.summary.currentMonthPremium - a.summary.currentMonthPremium;
  });
}

// v9 NEW: single-partner full detail for VIEW / trend modal
// Searched across ALL sheets in priority order.
function getPartnerDetail(userGid, partnerGid) {
  if (!userGid || !partnerGid) return { success: false, message: 'Missing params.' };
  var user = getUser(userGid);
  if (!user) return { success: false, message: 'User not found.' };

  var ss     = SpreadsheetApp.openById(SHEET_ID);
  var target = String(partnerGid).trim().toUpperCase();

  for (var si = 0; si < ALL_DATA_SHEETS.length; si++) {
    var shName = ALL_DATA_SHEETS[si];
    var sh     = ss.getSheetByName(shName);
    if (!sh) continue;
    var col  = getColForSheet(shName);
    var rows = sh.getDataRange().getValues();
    for (var r = 2; r < rows.length; r++) {
      var row = rows[r];
      if (!row[col.GID]) continue;
      var gid = String(row[col.GID]).trim().toUpperCase();
      if (gid !== target) continue;
      var p       = buildPartnerObj(row, col);
      p.zone      = (shName === TELE_RM_SHEET) ? 'TELE_RM' : zoneOfState(p.state);
      p.sourceSheet = shName;
      return { success: true, partner: p };
    }
  }
  return { success: false, message: 'Partner not found.' };
}

// ====================================================================
// DASHBOARD  (v9: AM fix + TELE_RM merge + hierarchyTree)
// ====================================================================
function getDashboard(gid) {
  if (!gid) return { success: false, message: 'GID required.' };
  var user = getUser(gid);
  if (!user) return { success: false, message: 'User not found.' };

  var ss           = SpreadsheetApp.openById(SHEET_ID);
  var partners, myZones, displayZones;

  if (isMasterUser(user)) {
    partners     = loadAllPartners(ss);
    myZones      = [];
    displayZones = ['North', 'East', 'South', 'West', 'RON'];

  } else if (isTeleRMZH(user)) {
    partners     = loadTeleRMPartners(ss);
    myZones      = ['TELE_RM'];
    displayZones = ['TELE_RM'];

  } else {
    var pd       = loadUserPartners(ss, user);
    partners     = pd.partners;
    myZones      = pd.myZones;
    displayZones = myZones;

    // v9: if user's territory includes TELE_RM zone, merge TELE_RM partners
    if (myZones.indexOf('TELE_RM') !== -1 && !isTeleRMZH(user)) {
      var seenGids  = {};
      partners.forEach(function(p){ seenGids[p.gid] = true; });
      var myLevel   = ROLE_LEVEL[user.role] || 0;
      loadTeleRMPartners(ss).forEach(function(tp) {
        if (seenGids[tp.gid]) return;
        var tpLevel = ROLE_LEVEL[tp.ownerRole] || 0;
        var visible = user.role === 'ZH' ||
                      tpLevel < myLevel  ||
                      (tp.ownerRole === user.role && tp.ownerName.toLowerCase() === user.name.toLowerCase());
        if (visible) { seenGids[tp.gid] = true; partners.push(tp); }
      });
    }
  }

  var summary        = buildSummary(partners);
  var overallProject = buildOverallProject(partners);
  var rr             = calcDailyRunRate(ss, summary.currentMonthPremium, null);

  if (isMasterUser(user)) recordDailySnapshot(ss, partners);

  // v9 FIX: myPartners now correct for ALL roles ─────────────────────
  var myPartners;
  if (isMasterUser(user) || isTeleRMZH(user)) {
    myPartners = [];
  } else if (user.role === 'AM') {
    // All loaded partners ARE this AM's partners (scan already filtered them)
    myPartners = partners;
  } else {
    myPartners = partners.filter(function(p) {
      return p.ownerRole === user.role &&
             p.ownerName.toLowerCase() === user.name.toLowerCase();
    });
  }

  var isNotAM        = user.role !== 'AM';
  var teamBreakdown  = isNotAM ? buildTeamBreakdown(partners, user) : null;
  var amPerformance  = isNotAM ? buildAmPerformance(partners)        : null;
  // v9: hierarchy tree only for ZH/RH/SH (role level > 2)
  var hierarchyTree  = (ROLE_LEVEL[user.role] || 0) >= 3
                       ? buildHierarchyTree(partners) : null;

  return {
    success:        true,
    user:           { gid: user.gid, name: user.name, role: user.role, zone: user.zone },
    summary:        summary,
    overallProject: overallProject,
    partners:       partners,
    teamBreakdown:  teamBreakdown,
    amPerformance:  amPerformance,
    myPartners:     myPartners,
    hierarchyTree:  hierarchyTree,            // v9 new
    filterOptions: {
      states: uniqueSorted(partners.map(function(p){ return p.state;     })),
      cities: uniqueSorted(partners.map(function(p){ return p.city;      })),
      owners: uniqueSorted(partners.map(function(p){ return p.ownerName; }))
    },
    myZones:      displayZones,
    dailyRunRate: rr.runRate,
    yesterdayMTD: rr.yesterdayMTD,
    monthLabels:  MONTH_LABELS             // v9 new: for trend charts in frontend
  };
}

// ====================================================================
// MASTER DASHBOARD  (v9: teleRMPerf + zone field in stateSummaries)
// ====================================================================
function getMasterDashboard(gid) {
  var user = getUser(gid);
  if (!user) return { success: false, message: 'User not found.' };
  var ss = SpreadsheetApp.openById(SHEET_ID);

  var allPartners    = loadAllPartners(ss);
  var teleRMPartners = loadTeleRMPartners(ss);
  var grandTotal     = allPartners.concat(teleRMPartners);

  // Zone summaries — 5 regular zones from allPartners
  var zoneMap = {};
  allPartners.forEach(function(p) {
    var z = zoneOfState(p.state);
    if (!zoneMap[z]) zoneMap[z] = [];
    zoneMap[z].push(p);
  });

  var zoneSummaries = Object.keys(zoneMap)
    .filter(function(z){ return z !== 'Other'; })
    .map(function(zone) {
      var zp = zoneMap[zone];
      var s  = buildSummary(zp);
      var rr = calcDailyRunRate(ss, s.currentMonthPremium, zone);
      return {
        zone:        zone,
        partnerCount:zp.length,
        summary:     s,
        overallProject: buildOverallProject(zp),
        dailyRunRate:rr.runRate,
        yesterdayMTD:rr.yesterdayMTD
      };
    })
    .sort(function(a, b){ return b.summary.currentMonthPremium - a.summary.currentMonthPremium; });

  // Add TELE_RM as 6th zone entry
  if (teleRMPartners.length > 0) {
    var teleS  = buildSummary(teleRMPartners);
    var teleRR = calcDailyRunRate(ss, teleS.currentMonthPremium, 'TELE_RM');
    zoneSummaries.push({
      zone:        'TELE_RM',
      partnerCount:teleRMPartners.length,
      summary:     teleS,
      overallProject: buildOverallProject(teleRMPartners),
      dailyRunRate:teleRR.runRate,
      yesterdayMTD:teleRR.yesterdayMTD
    });
  }

  // State summaries (from regular partners; v9: zone field added)
  var stateMap = {};
  allPartners.forEach(function(p) {
    var st = p.state || 'Unknown';
    if (!stateMap[st]) stateMap[st] = [];
    stateMap[st].push(p);
  });
  var stateSummaries = Object.keys(stateMap).map(function(state) {
    var ps = stateMap[state];
    return {
      state:        state,
      zone:         zoneOfState(state),   // v9 new
      partnerCount: ps.length,
      summary:      buildSummary(ps)
    };
  }).sort(function(a, b){ return b.summary.currentMonthPremium - a.summary.currentMonthPremium; });

  var overallSummary = buildSummary(grandTotal);
  var masterRR       = calcDailyRunRate(ss, overallSummary.currentMonthPremium, null);
  recordDailySnapshot(ss, grandTotal);

  return {
    success:          true,
    totalPartners:    grandTotal.length,
    overallSummary:   overallSummary,
    overallProject:   buildOverallProject(grandTotal),
    zoneSummaries:    zoneSummaries,
    stateSummaries:   stateSummaries,
    teleRMPartners:   teleRMPartners,
    zhPerf:           buildRolePerformance(allPartners, 'ZH'),
    rhPerf:           buildRolePerformance(allPartners, 'RH'),
    shPerf:           buildRolePerformance(allPartners, 'SH'),
    rmPerf:           buildRolePerformance(allPartners, 'RM'),
    amPerf:           buildRolePerformance(allPartners, 'AM'),
    teleRMPerf:       buildRolePerformance(teleRMPartners, 'AM'),  // v9 new: TELE_RM agents
    hierarchyTree:    buildHierarchyTree(grandTotal),              // v9 new
    dailyRunRate:     masterRR.runRate,
    yesterdayMTD:     masterRR.yesterdayMTD,
    monthLabels:      MONTH_LABELS  // v9 new
  };
}

// ====================================================================
// DAILY RUN RATE
// ====================================================================
function ensureDailySheet(ss) {
  var sh = ss.getSheetByName(DAILY_SHEET);
  if (!sh) {
    sh = ss.insertSheet(DAILY_SHEET);
    sh.appendRow(['Date','TotalMTD','NorthMTD','SouthMTD','EastMTD','WestMTD','RONMTD','TeleRMMTD','Partners']);
    sh.getRange(1, 1, 1, 9).setFontWeight('bold');
  }
  return sh;
}

function recordDailySnapshot(ss, allPartners) {
  try {
    var today = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd');
    var sh    = ensureDailySheet(ss);
    var data  = sh.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]).slice(0, 10) === today) return;  // already snapshotted today
    }
    var zMap = {};
    allPartners.forEach(function(p) {
      var z = p.zone || zoneOfState(p.state);
      if (!zMap[z]) zMap[z] = 0;
      zMap[z] += p.currentMonth;
    });
    var total = allPartners.reduce(function(s, p){ return s + p.currentMonth; }, 0);
    sh.appendRow([
      today, total,
      zMap['North']   || 0, zMap['South']  || 0, zMap['East'] || 0,
      zMap['West']    || 0, zMap['RON']    || 0, zMap['TELE_RM'] || 0,
      allPartners.length
    ]);
  } catch (e) {}
}

function getDailyTracking(gid) {
  var user = getUser(gid);
  if (!user) return { success: false, message: 'User not found.' };
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName(DAILY_SHEET);
  if (!sh) return { success: true, history: [], runRate: 0, todayMTD: 0, yesterdayMTD: 0 };
  var data    = sh.getDataRange().getValues();
  var history = [];
  for (var i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    history.push({
      date:      String(data[i][0]).slice(0, 10),
      totalMTD:  Number(data[i][1] || 0),
      northMTD:  Number(data[i][2] || 0),
      southMTD:  Number(data[i][3] || 0),
      eastMTD:   Number(data[i][4] || 0),
      westMTD:   Number(data[i][5] || 0),
      ronMTD:    Number(data[i][6] || 0),
      teleRMMTD: Number(data[i][7] || 0),
      partners:  Number(data[i][8] || 0)
    });
  }
  history.sort(function(a, b){ return a.date.localeCompare(b.date); });
  var todayMTD     = history.length       ? history[history.length - 1].totalMTD : 0;
  var yesterdayMTD = history.length > 1   ? history[history.length - 2].totalMTD : 0;
  return {
    success:      true,
    history:      history,
    runRate:      todayMTD - yesterdayMTD,
    todayMTD:     todayMTD,
    yesterdayMTD: yesterdayMTD
  };
}

function calcDailyRunRate(ss, currentMTD, zone) {
  try {
    var sh = ss.getSheetByName(DAILY_SHEET);
    if (!sh) return { runRate: 0, yesterdayMTD: 0, runRatePct: 0 };
    var data = sh.getDataRange().getValues();
    if (data.length < 2) return { runRate: 0, yesterdayMTD: 0, runRatePct: 0 };
    var last    = data[data.length - 1];
    var colIdx  = zone
      ? ({'North':2,'South':3,'East':4,'West':5,'RON':6,'TELE_RM':7}[zone] || 1)
      : 1;
    var yesterdayMTD = Number(last[colIdx] || 0);
    var runRate      = currentMTD - yesterdayMTD;
    return {
      runRate:      runRate,
      yesterdayMTD: yesterdayMTD,
      runRatePct:   currentMTD > 0 ? Math.round(runRate / currentMTD * 100) : 0
    };
  } catch (e) {
    return { runRate: 0, yesterdayMTD: 0, runRatePct: 0 };
  }
}

// ====================================================================
// AUTH
// ====================================================================
function getUser(gid) {
  if (!gid) return null;
  var ss    = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(USERS_SHEET);
  if (!sheet) return null;
  var data   = sheet.getDataRange().getValues();
  var target = String(gid).trim().toUpperCase();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim().toUpperCase() === target) {
      return {
        rowIndex: i + 1,
        gid:      String(data[i][0] || '').trim().toUpperCase(),
        name:     String(data[i][1] || '').trim(),
        role:     String(data[i][2] || '').trim().toUpperCase(),
        zone:     String(data[i][3] || '').trim(),
        password: String(data[i][4] || '').trim().toLowerCase()
      };
    }
  }
  return null;
}

function isMasterUser(user) {
  if (!user) return false;
  if (user.role === 'MASTER') return true;
  return MASTER_GIDS.some(function(id){ return user.gid.toUpperCase().indexOf(id) !== -1; });
}

function isTeleRMZH(user) {
  return user.role === 'ZH' && TELE_RM_ZHS.indexOf(user.name.toUpperCase()) !== -1;
}

function checkPasswordStatus(gid) {
  if (!gid) return { success: false, message: 'Enter your User ID.' };
  var user = getUser(gid);
  if (!user) return { success: false, message: 'User ID not found.' };
  return {
    success:     true,
    hasPassword: !!(user.password && user.password !== '' && user.password !== 'null')
  };
}

function handleLogin(gid, hashedPassword) {
  if (!gid) return { success: false, message: 'Enter your User ID.' };
  var user = getUser(gid);
  if (!user) return { success: false, message: 'User ID not found.' };
  if (!user.password || user.password === '' || user.password === 'null')
    return { success: false, needsPasswordSet: true, message: 'No password set. Please create your password.' };
  if (user.password !== String(hashedPassword || '').toLowerCase())
    return { success: false, message: 'Incorrect password.' };
  logLogin(user);
  return { success: true, user: { gid: user.gid, name: user.name, role: user.role, zone: user.zone } };
}

function setPassword(gid, oldHash, newHash) {
  if (!gid || !newHash) return { success: false, message: 'Missing parameters.' };
  var user = getUser(gid);
  if (!user) return { success: false, message: 'User not found.' };
  var has = !!(user.password && user.password !== '' && user.password !== 'null');
  if (has && user.password !== String(oldHash || '').toLowerCase())
    return { success: false, message: 'Current password is incorrect.' };
  var ss = SpreadsheetApp.openById(SHEET_ID);
  ss.getSheetByName(USERS_SHEET).getRange(user.rowIndex, 5).setValue(String(newHash).toLowerCase());
  return { success: true };
}

function logLogin(user) {
  try {
    var ss = SpreadsheetApp.openById(SHEET_ID);
    var ls = ss.getSheetByName(LOG_SHEET);
    if (!ls) {
      ls = ss.insertSheet(LOG_SHEET);
      ls.appendRow(['Timestamp', 'GID', 'Name', 'Role', 'Zone']);
    }
    ls.appendRow([new Date().toISOString(), user.gid, user.name, user.role, user.zone]);
  } catch (e) {}
}

function getLoginStats(gid) {
  var user = getUser(gid);
  if (!user) return { success: false, message: 'Access denied.' };
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var ls = ss.getSheetByName(LOG_SHEET);
  if (!ls) return { success: true, stats: [], totalLogins: 0 };
  var data  = ls.getDataRange().getValues();
  var stats = {};
  for (var i = 1; i < data.length; i++) {
    var k = data[i][1];
    if (!stats[k]) stats[k] = {
      gid:       data[i][1], name:  data[i][2],
      role:      data[i][3], zone:  data[i][4],
      count:     0,          lastLogin: ''
    };
    stats[k].count++;
    stats[k].lastLogin = data[i][0];
  }
  return { success: true, stats: Object.values(stats), totalLogins: data.length - 1 };
}

// ====================================================================
// REMARKS
// ====================================================================
function saveRemark(userGid, partnerGid, remark) {
  if (!userGid || !partnerGid) return { success: false, message: 'Missing params.' };
  var ss    = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) return { success: false, message: 'Data sheet not found.' };
  var data  = sheet.getDataRange().getValues();
  var tgt   = String(partnerGid).trim().toUpperCase();
  for (var i = 2; i < data.length; i++) {
    if (String(data[i][COL_MAIN.GID]).trim().toUpperCase() === tgt) {
      sheet.getRange(i + 1, COL_MAIN.REMARK_PARTNER + 1).setValue(remark || '');
      return { success: true };
    }
  }
  return { success: false, message: 'Partner not found.' };
}

// ====================================================================
// HELPERS
// ====================================================================
function uniqueSorted(arr) {
  var seen = {}, out = [];
  arr.forEach(function(v) {
    var s = String(v || '').trim();
    if (s && !seen[s]) { seen[s] = true; out.push(s); }
  });
  return out.sort();
}

function parseNumber(val) {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return isFinite(val) ? val : 0;
  var n = parseFloat(String(val).replace(/[₹,%\s]/g, '').replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}
