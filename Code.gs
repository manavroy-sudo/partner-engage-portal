// ====================================================================
// AM and Above Focused Partners — Code.gs v10
// BREAKING CHANGES FROM v9:
//   1. Single source: ONLY "All_Partner List" — all zone sheets removed
//   2. Zone from Column F (index 5) — no more zoneOfState() mapping
//   3. FTD=AD(29), MTD=AE(30), LMTD=AF(31)  ← CRITICAL FIX
//   4. Net Combined Premium = Column Y (24) — new field throughout
//   5. Active Months Count & Business computed from monthly data
//   6. Potential / Projection now absolute — no conversion applied
//   7. Unique Status from Column AI (34)
//   8. ZH zone detection now auto from data — no hardcoded ZH_ZONE_MAP
// ====================================================================

const SHEET_ID     = '1AgPaAik0vjh_9fcxX4NdV33-hWd4S5qNzwuFXb3xOis';
const MASTER_SHEET = 'All_Partner List';   // SINGLE SOURCE — v10
const USERS_SHEET  = 'Users';
const LOG_SHEET    = 'LoginLog';
const DAILY_SHEET  = 'DailyMTD';

// ── COLUMN MAP — All_Partner List (0-indexed for getValues()) ─────────
// A=0 B=1 C=2 D=3 E=4 F=5 G=6 H=7 I=8 J=9 K=10
// L=11 ... X=23 Y=24 Z=25 AA=26 AB=27 AC=28 AD=29 AE=30 AF=31
// AG=32 AH=33 AI=34 AJ=35 AK=36 AL=37
const COL = {
  SN:         0,  // A - Serial Number
  GID:        1,  // B - Partner GID
  NAME:       2,  // C - Partner Name
  CITY:       3,  // D - City
  STATE:      4,  // E - State
  ZONE:       5,  // F - Zone (DIRECT READ — replaces zoneOfState())
  EMP_ID:     6,  // G - Employee ID
  OWNER_ROLE: 7,  // H - Owner Role (ZH / RH / SH / RM / AM)
  OWNER_NAME: 8,  // I - Owner Name
  OWNER_EMP:  9,  // J - Owner Emp ID
  MAX_POTENTIAL: 10, // K - Pre-computed max potential

  // Monthly premiums: Apr'25(L=11) → Apr'26(X=23) = 13 months
  MONTH_START: 11,   // L - Apr 2025
  MONTH_END:   23,   // X - Apr 2026

  NET_COMBINED_PREMIUM: 24, // Y - Sum Apr'25→Apr'26 (NEW)
  OVERALL_POTENTIAL:    25, // Z - Overall potential (absolute value)
  ACTIVE_MONTHS_COUNT:  26, // AA - Months partner was active (NEW)
  ACTIVE_MONTHS_BIZ:    27, // AB - Business in active months (NEW)
  TARGET:               28, // AC - May 2026 projection (absolute value)

  // ── CRITICAL METRIC FIX ──────────────────────────────────────────
  FTD:  29,  // AD - For The Day   ← corrected from v9
  MTD:  30,  // AE - Month To Date ← corrected from v9
  LMTD: 31,  // AF - Last Month TD ← corrected from v9
  // ─────────────────────────────────────────────────────────────────

  ACTIVE:        32, // AG - Active / Inactive status
  GROWTH:        33, // AH - Growth / Degrowth
  UNIQUE_STATUS: 34, // AI - Unique Status (updated field)
  CALLS:         35, // AJ - Total Calls
  VISITS:        36, // AK - Total Visits
  REMARK_SHEET:  37, // AL - Remark (sheet-level)
  REMARK_PARTNER:38  // AM - Remark (partner-level)
};

const ROLE_LEVEL  = { ZH:5, RH:4, SH:3, RM:2, AM:1, MASTER:99 };
const MASTER_GIDS = ['MASTER','IDK-MASTER','CENTRAL'];

// ========================= ENTRY POINT ==============================

function doGet(e) {
  var p = e.parameter || {};
  var result;
  try {
    switch (p.action) {
      case 'login':            result = handleLogin(p.gid, p.password);              break;
      case 'checkPassword':    result = checkPasswordStatus(p.gid);                   break;
      case 'setPassword':      result = setPassword(p.gid, p.oldPassword, p.newPassword); break;
      case 'getDashboard':     result = getDashboard(p.gid);                          break;
      case 'getMaster':        result = getMasterDashboard(p.gid);                    break;
      case 'saveRemark':       result = saveRemark(p.gid, p.partnerGid, p.remark);   break;
      case 'getLoginStats':    result = getLoginStats(p.gid);                         break;
      case 'getDailyTracking': result = getDailyTracking(p.gid);                      break;
      case 'getCallVisitStats':result = getCallVisitStats(p.gid);                     break;
      default:                 result = { success: false, message: 'Unknown action.' };
    }
  } catch(err) {
    result = { success: false, message: 'Server error: ' + err.message + ' | ' + String(err.stack || '') };
  }
  return ContentService.createTextOutput(JSON.stringify(result))
                       .setMimeType(ContentService.MimeType.JSON);
}

// ========================= DATA LOADING (SINGLE SHEET) ==============

function getMasterSheetRows(ss) {
  var sh = ss.getSheetByName(MASTER_SHEET);
  if (!sh) throw new Error('Sheet "' + MASTER_SHEET + '" not found.');
  return sh.getDataRange().getValues();
}

// Load ALL partners from the single master sheet
function loadAllPartners(ss) {
  var rows   = getMasterSheetRows(ss);
  var result = [];
  for (var r = 2; r < rows.length; r++) {  // skip 2 header rows
    var row = rows[r];
    if (!row[COL.GID] || String(row[COL.GID]).trim() === '') continue;
    result.push(buildPartnerObj(row));
  }
  return result;
}

// Load partners visible to a specific user (zone + hierarchy filtered)
function loadUserPartners(ss, user) {
  var rows   = getMasterSheetRows(ss);
  var myZones = getUserZones(user, rows);

  var partners = [];
  for (var r = 2; r < rows.length; r++) {
    var row = rows[r];
    if (!row[COL.GID] || String(row[COL.GID]).trim() === '') continue;
    if (!canUserSeePartner(user, myZones, row)) continue;
    partners.push(buildPartnerObj(row));
  }
  return { partners: partners, myZones: myZones };
}

// ========================= ZONE LOGIC (COL F DIRECT) ================

// Read zone directly from Column F — NO state-mapping function needed
function getZone(row) {
  return String(row[COL.ZONE] || '').trim();
}

// Detect which zones a user covers (auto from data, no hardcoding)
function getUserZones(user, allRows) {
  if (isMasterUser(user)) return [];
  var myName = user.name.toLowerCase();
  var zones  = {};
  for (var r = 2; r < allRows.length; r++) {
    var row = allRows[r];
    if (!row[COL.GID] || String(row[COL.GID]).trim() === '') continue;
    var ownerRole = String(row[COL.OWNER_ROLE] || '').trim().toUpperCase();
    var ownerName = String(row[COL.OWNER_NAME] || '').trim().toLowerCase();
    // For AM: their zone = wherever their partners sit
    if (user.role === 'AM') {
      if (ownerRole === 'AM' && ownerName === myName) {
        var z = getZone(row);
        if (z) zones[z] = true;
      }
      continue;
    }
    // For ZH/SH/RM/RH: find rows where they appear as owner
    if (ownerRole === user.role && ownerName === myName) {
      var z = getZone(row);
      if (z) zones[z] = true;
    }
  }
  return Object.keys(zones);
}

// Visibility check — uses col F zone directly
function canUserSeePartner(user, myZones, row) {
  if (isMasterUser(user)) return true;
  var ownerRole = String(row[COL.OWNER_ROLE] || '').trim().toUpperCase();
  var ownerName = String(row[COL.OWNER_NAME] || '').trim();
  var partnerZone = getZone(row);

  if (user.role === 'AM') {
    return ownerRole === 'AM' && ownerName.toLowerCase() === user.name.toLowerCase();
  }

  // Zone gate
  if (!myZones.length || myZones.indexOf(partnerZone) === -1) return false;
  if (user.role === 'ZH') return true;  // ZH sees everyone in their zone(s)

  // Hierarchy gate (SH/RM/RH see their AMs and each other)
  var myLevel    = ROLE_LEVEL[user.role]    || 0;
  var ownerLevel = ROLE_LEVEL[ownerRole]    || 0;
  if (ownerRole === user.role && ownerName.toLowerCase() === user.name.toLowerCase()) return true;
  if (ownerLevel > 0 && ownerLevel < myLevel) return true;
  return false;
}

// ========================= PARTNER OBJECT ===========================

function buildPartnerObj(row) {
  // Monthly data (13 months Apr'25→Apr'26)
  var monthlyData = [];
  for (var m = COL.MONTH_START; m <= COL.MONTH_END; m++) {
    monthlyData.push(parseNumber(row[m]));
  }

  // Active months metrics (computed from monthly data)
  var activeMonthsCount = 0, activeMonthsBiz = 0;
  for (var i = 0; i < monthlyData.length; i++) {
    if (monthlyData[i] > 0) { activeMonthsCount++; activeMonthsBiz += monthlyData[i]; }
  }
  // Also try to read from sheet if columns present
  var sheetActiveMonths = parseNumber(row[COL.ACTIVE_MONTHS_COUNT]);
  var sheetActiveBiz    = parseNumber(row[COL.ACTIVE_MONTHS_BIZ]);
  if (sheetActiveMonths > 0) activeMonthsCount = sheetActiveMonths;
  if (sheetActiveBiz    > 0) activeMonthsBiz   = sheetActiveBiz;

  // Net Combined Premium — read from col Y, fallback to sum of monthly
  var netCombinedPremium = parseNumber(row[COL.NET_COMBINED_PREMIUM]);
  if (!netCombinedPremium) {
    netCombinedPremium = monthlyData.reduce(function(s, v) { return s + v; }, 0);
  }

  // Key metrics — CORRECTED column references
  var ftd          = parseNumber(row[COL.FTD]);
  var mtd          = parseNumber(row[COL.MTD]);   // AE
  var lmtd         = parseNumber(row[COL.LMTD]);  // AF

  // Potential/Target — absolute values, no conversion
  var overallPotential = parseNumber(row[COL.OVERALL_POTENTIAL]);
  var maxPotential     = parseNumber(row[COL.MAX_POTENTIAL]);
  if (!maxPotential) maxPotential = monthlyData.length ? Math.max.apply(null, monthlyData) : 0;
  var target           = parseNumber(row[COL.TARGET]);

  // Active status
  var activeRaw = String(row[COL.ACTIVE] || '').trim().toLowerCase();
  var isActive  = activeRaw === '1' || activeRaw === 'active' || activeRaw === 'yes' || mtd > 0;

  // Growth status
  var growthRaw = String(row[COL.GROWTH] || '').trim();
  var growthNum = parseFloat(String(growthRaw).replace(/[^\-\d.]/g, ''));
  var isGrowth;
  if (growthRaw.toLowerCase().indexOf('degrowth') !== -1) isGrowth = false;
  else if (growthRaw.toLowerCase().indexOf('growth') !== -1) isGrowth = true;
  else if (!isNaN(growthNum)) isGrowth = growthNum >= 0;
  else isGrowth = mtd >= lmtd;

  var callsRaw  = String(row[COL.CALLS]  || '').trim();
  var visitsRaw = String(row[COL.VISITS] || '').trim();
  var calls     = parseNumber(callsRaw);
  var visits    = parseNumber(visitsRaw);

  return {
    gid:                 String(row[COL.GID]          || '').trim(),
    name:                String(row[COL.NAME]         || '').trim(),
    city:                String(row[COL.CITY]         || '').trim(),
    state:               String(row[COL.STATE]        || '').trim(),
    zone:                getZone(row),
    empId:               String(row[COL.EMP_ID]       || '').trim(),
    ownerRole:           String(row[COL.OWNER_ROLE]   || '').trim().toUpperCase(),
    ownerName:           String(row[COL.OWNER_NAME]   || '').trim(),
    uniqueStatus:        String(row[COL.UNIQUE_STATUS] || '').trim(),

    // Financials
    overallPotential:    overallPotential,
    maxPotential:        maxPotential,
    target:              target,
    netCombinedPremium:  netCombinedPremium,

    // Activity
    activeMonthsCount:   activeMonthsCount,
    activeMonthsBiz:     activeMonthsBiz,

    // Current metrics (CORRECTED columns)
    ftd:          ftd,
    currentMonth: mtd,
    prevMonth:    lmtd,
    monthlyData:  monthlyData,

    // Status flags
    isActive:  isActive,
    isGrowth:  isGrowth,

    // Engagement
    calls:     calls,
    visits:    visits,
    connected: (callsRaw !== '' && callsRaw !== '0') || (visitsRaw !== '' && visitsRaw !== '0'),

    remark: String(row[COL.REMARK_PARTNER] || row[COL.REMARK_SHEET] || '').trim()
  };
}

// ========================= AGGREGATIONS =============================

function buildSummary(partners) {
  var curr = 0, prev = 0, ftdTotal = 0;
  var maxPot = 0, overallPot = 0, target = 0;
  var netCombined = 0, activeBiz = 0;
  var active = 0, growth = 0, connected = 0;
  var calls = 0, visits = 0;
  var total = partners.length;
  var totalActiveMonths = 0;

  for (var i = 0; i < total; i++) {
    var p = partners[i];
    curr          += p.currentMonth;
    prev          += p.prevMonth;
    ftdTotal      += p.ftd;
    maxPot        += p.maxPotential;
    overallPot    += p.overallPotential;
    target        += p.target;
    netCombined   += p.netCombinedPremium;
    activeBiz     += p.activeMonthsBiz;
    totalActiveMonths += p.activeMonthsCount;
    if (p.isActive)    active++;
    if (p.isGrowth)    growth++;
    if (p.connected)   connected++;
    calls  += p.calls;
    visits += p.visits;
  }

  var avgActiveMonths = total > 0 ? Math.round(totalActiveMonths / total * 10) / 10 : 0;

  return {
    totalPartners:       total,
    totalMaxPotential:   maxPot,
    totalOverallPotential: overallPot,
    totalTarget:         target,
    totalNetCombinedPremium: netCombined,
    totalActiveMonthsBiz:    activeBiz,
    avgActiveMonths:     avgActiveMonths,

    ftdTotal:            ftdTotal,
    currentMonthPremium: curr,
    prevMonthPremium:    prev,

    activeCount:         active,
    inactiveCount:       total - active,
    growthCount:         growth,
    degrowthCount:       total - growth,
    connectedCount:      connected,
    notConnectedCount:   total - connected,

    totalCalls:          calls,
    totalVisits:         visits,

    achievementPct:      target  > 0 ? Math.round(curr / target * 100)   : 0,
    momPct:              prev    > 0 ? Math.round((curr - prev) / prev * 100) : 0,
    maxPotAchPct:        maxPot  > 0 ? Math.round(curr / maxPot * 100)   : 0,
    engagementPct:       total   > 0 ? Math.round(connected / total * 100): 0,
    activePct:           total   > 0 ? Math.round(active / total * 100)  : 0,
    growthPct:           total   > 0 ? Math.round(growth / total * 100)  : 0
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

    ftd:                 s.ftdTotal,
    businessGenerated:   s.currentMonthPremium,
    lmtd:                s.prevMonthPremium,
    netCombinedPremium:  s.totalNetCombinedPremium,
    activeMonthsBiz:     s.totalActiveMonthsBiz,
    avgActiveMonths:     s.avgActiveMonths,

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

function buildRolePerformance(partners, role) {
  var map = {};
  partners.filter(function(p) { return p.ownerRole === role; }).forEach(function(p) {
    if (!map[p.ownerName]) map[p.ownerName] = [];
    map[p.ownerName].push(p);
  });
  return Object.keys(map).map(function(name) {
    var pts = map[name];
    return {
      name:         name,
      role:         role,
      zone:         pts[0] ? pts[0].zone : '',
      summary:      buildSummary(pts),
      overallProject: buildOverallProject(pts),
      partnerCount: pts.length
    };
  }).sort(function(a, b) { return b.summary.currentMonthPremium - a.summary.currentMonthPremium; });
}

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
      name:   name, role: 'AM',
      zone:   pts[0] ? pts[0].zone : '',
      states: uniqueSorted(pts.map(function(p) { return p.state; })),
      cities: uniqueSorted(pts.map(function(p) { return p.city; })),
      summary:      buildSummary(pts),
      overallProject: buildOverallProject(pts),
      partners: pts
    };
  }).sort(function(a, b) { return b.summary.currentMonthPremium - a.summary.currentMonthPremium; });
}

function buildTeamBreakdown(partners, user) {
  var myLevel = ROLE_LEVEL[user.role];
  var teamMap = {};
  partners.forEach(function(p) {
    var pLevel = ROLE_LEVEL[p.ownerRole] || 0;
    if (pLevel >= myLevel) return;
    var key = p.ownerRole + '|' + p.ownerName;
    if (!teamMap[key]) teamMap[key] = { role: p.ownerRole, name: p.ownerName, partners: [] };
    teamMap[key].partners.push(p);
  });
  return Object.keys(teamMap).map(function(key) {
    var m = teamMap[key];
    return { role: m.role, name: m.name, summary: buildSummary(m.partners), overallProject: buildOverallProject(m.partners), partners: m.partners };
  }).sort(function(a, b) { return b.summary.currentMonthPremium - a.summary.currentMonthPremium; });
}

// ========================= CALL/VISIT STATS =========================
// Now reads from single master sheet (v10 — no zone sheets)

function getCallVisitStats(gid) {
  try {
    var user = getUser(gid);
    if (!user) return { success: false, message: 'User not found.' };
    var ss   = SpreadsheetApp.openById(SHEET_ID);
    var rows = getMasterSheetRows(ss);

    var allowedZones = null;
    if (!isMasterUser(user) && user.role !== 'AM') {
      var userZones = getUserZones(user, rows);
      if (userZones.length) allowedZones = userZones;
    }

    var overall   = { total:0, called:0, notCalled:0, visited:0, notVisited:0, callsSum:0, visitsSum:0 };
    var byZone    = {};
    var byOwner   = {};

    for (var r = 2; r < rows.length; r++) {
      var row = rows[r];
      if (!row[COL.GID] || String(row[COL.GID]).trim() === '') continue;

      var partnerZone = getZone(row);
      if (allowedZones && allowedZones.indexOf(partnerZone) === -1) continue;
      if (user.role === 'AM') {
        var ownerRole = String(row[COL.OWNER_ROLE]||'').trim().toUpperCase();
        var ownerName = String(row[COL.OWNER_NAME]||'').trim();
        if (!(ownerRole === 'AM' && ownerName.toLowerCase() === user.name.toLowerCase())) continue;
      }

      var calls  = parseNumber(row[COL.CALLS]);
      var visits = parseNumber(row[COL.VISITS]);
      var called  = calls  > 0;
      var visited = visits > 0;
      var oRole   = String(row[COL.OWNER_ROLE]||'').trim();
      var oName   = String(row[COL.OWNER_NAME]||'').trim();

      overall.total++;
      if (called)   { overall.called++;   } else { overall.notCalled++; }
      if (visited)  { overall.visited++;  } else { overall.notVisited++; }
      overall.callsSum  += calls;
      overall.visitsSum += visits;

      if (!byZone[partnerZone]) byZone[partnerZone] = { zone: partnerZone, total:0, called:0, notCalled:0, visited:0, notVisited:0, callsSum:0, visitsSum:0 };
      byZone[partnerZone].total++;
      if (called)  { byZone[partnerZone].called++;  } else { byZone[partnerZone].notCalled++;  }
      if (visited) { byZone[partnerZone].visited++; } else { byZone[partnerZone].notVisited++; }
      byZone[partnerZone].callsSum  += calls;
      byZone[partnerZone].visitsSum += visits;

      var ownerKey = oRole + '|' + oName;
      if (!byOwner[ownerKey]) byOwner[ownerKey] = { role:oRole, name:oName, zone:partnerZone, total:0, called:0, notCalled:0, visited:0, notVisited:0, callsSum:0, visitsSum:0 };
      byOwner[ownerKey].total++;
      if (called)  { byOwner[ownerKey].called++;  } else { byOwner[ownerKey].notCalled++;  }
      if (visited) { byOwner[ownerKey].visited++; } else { byOwner[ownerKey].notVisited++; }
      byOwner[ownerKey].callsSum  += calls;
      byOwner[ownerKey].visitsSum += visits;
    }

    var zoneList  = Object.values(byZone).sort(function(a,b){ return b.callsSum - a.callsSum; });
    var ownerList = Object.values(byOwner).sort(function(a,b){ return b.callsSum - a.callsSum; });

    return { success: true, overall: overall, byZone: zoneList, byOwner: ownerList };
  } catch(err) {
    return { success: false, message: 'Error: ' + err.message };
  }
}

// ========================= DAILY RUN RATE ===========================

function ensureDailySheet(ss) {
  var sh = ss.getSheetByName(DAILY_SHEET);
  if (!sh) {
    sh = ss.insertSheet(DAILY_SHEET);
    sh.appendRow(['Date','TotalFTD','TotalMTD','TotalLMTD','NetCombined','Partners','ActivePartners']);
    sh.getRange(1, 1, 1, 7).setFontWeight('bold');
  }
  return sh;
}

function recordDailySnapshot(ss, allPartners) {
  try {
    var today = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd');
    var sh    = ensureDailySheet(ss);
    var data  = sh.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]).slice(0, 10) === today) return;
    }
    var s    = buildSummary(allPartners);
    sh.appendRow([today, s.ftdTotal, s.currentMonthPremium, s.prevMonthPremium, s.totalNetCombinedPremium, s.totalPartners, s.activeCount]);
  } catch(e) { /* non-critical */ }
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
      date:        String(data[i][0]).slice(0, 10),
      ftd:         Number(data[i][1] || 0),
      totalMTD:    Number(data[i][2] || 0),
      totalLMTD:   Number(data[i][3] || 0),
      netCombined: Number(data[i][4] || 0),
      partners:    Number(data[i][5] || 0),
      active:      Number(data[i][6] || 0)
    });
  }
  history.sort(function(a, b) { return a.date.localeCompare(b.date); });
  var todayMTD     = history.length     ? history[history.length - 1].totalMTD : 0;
  var yesterdayMTD = history.length > 1 ? history[history.length - 2].totalMTD : 0;
  return { success: true, history: history, runRate: todayMTD - yesterdayMTD, todayMTD: todayMTD, yesterdayMTD: yesterdayMTD };
}

function calcDailyRunRate(ss, currentMTD) {
  try {
    var sh   = ss.getSheetByName(DAILY_SHEET);
    if (!sh) return { runRate: 0, yesterdayMTD: 0 };
    var data = sh.getDataRange().getValues();
    if (data.length < 2) return { runRate: 0, yesterdayMTD: 0 };
    var last         = data[data.length - 1];
    var yesterdayMTD = Number(last[2] || 0);  // col C = TotalMTD
    return { runRate: currentMTD - yesterdayMTD, yesterdayMTD: yesterdayMTD };
  } catch(e) { return { runRate: 0, yesterdayMTD: 0 }; }
}

// ========================= AUTH =====================================

function getUser(gid) {
  if (!gid) return null;
  var ss    = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(USERS_SHEET);
  if (!sheet) return null;
  var data  = sheet.getDataRange().getValues();
  var target = String(gid).trim().toUpperCase();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim().toUpperCase() === target) {
      return {
        rowIndex: i + 1,
        gid:      String(data[i][0]).trim().toUpperCase(),
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
  return MASTER_GIDS.some(function(id) { return user.gid.toUpperCase().indexOf(id) !== -1; });
}

function checkPasswordStatus(gid) {
  if (!gid) return { success: false, message: 'Enter your User ID.' };
  var user = getUser(gid);
  if (!user) return { success: false, message: 'User ID not found.' };
  return { success: true, hasPassword: !!(user.password && user.password !== '' && user.password !== 'null') };
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
  SpreadsheetApp.openById(SHEET_ID).getSheetByName(USERS_SHEET).getRange(user.rowIndex, 5).setValue(String(newHash).toLowerCase());
  return { success: true };
}

function logLogin(user) {
  try {
    var ss = SpreadsheetApp.openById(SHEET_ID);
    var ls = ss.getSheetByName(LOG_SHEET);
    if (!ls) { ls = ss.insertSheet(LOG_SHEET); ls.appendRow(['Timestamp','GID','Name','Role','Zone']); }
    ls.appendRow([new Date().toISOString(), user.gid, user.name, user.role, user.zone]);
  } catch(e) {}
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
    if (!stats[k]) stats[k] = { gid: data[i][1], name: data[i][2], role: data[i][3], zone: data[i][4], count: 0, lastLogin: '' };
    stats[k].count++;
    stats[k].lastLogin = data[i][0];
  }
  return { success: true, stats: Object.values(stats), totalLogins: data.length - 1 };
}

// ========================= REMARKS ==================================

function saveRemark(userGid, partnerGid, remark) {
  if (!userGid || !partnerGid) return { success: false, message: 'Missing params.' };
  var ss    = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(MASTER_SHEET);
  if (!sheet) return { success: false, message: 'Master sheet not found.' };
  var data  = sheet.getDataRange().getValues();
  var tgt   = String(partnerGid).trim().toUpperCase();
  for (var i = 2; i < data.length; i++) {
    if (String(data[i][COL.GID]).trim().toUpperCase() === tgt) {
      sheet.getRange(i + 1, COL.REMARK_PARTNER + 1).setValue(remark || '');
      return { success: true };
    }
  }
  return { success: false, message: 'Partner not found.' };
}

// ========================= DASHBOARDS ===============================

function getDashboard(gid) {
  if (!gid) return { success: false, message: 'GID required.' };
  var user = getUser(gid);
  if (!user) return { success: false, message: 'User not found.' };
  var ss = SpreadsheetApp.openById(SHEET_ID);

  var partners, myZones;
  if (isMasterUser(user)) {
    partners = loadAllPartners(ss);
    myZones  = [];
  } else {
    var pd   = loadUserPartners(ss, user);
    partners = pd.partners;
    myZones  = pd.myZones;
  }

  var summary        = buildSummary(partners);
  var overallProject = buildOverallProject(partners);
  var rr             = calcDailyRunRate(ss, summary.currentMonthPremium);

  if (isMasterUser(user)) recordDailySnapshot(ss, partners);

  return {
    success:       true,
    user:          { gid: user.gid, name: user.name, role: user.role, zone: user.zone },
    summary:       summary,
    overallProject:overallProject,
    partners:      partners,
    teamBreakdown: (user.role !== 'AM') ? buildTeamBreakdown(partners, user) : null,
    amPerformance: (user.role !== 'AM') ? buildAmPerformance(partners)       : null,
    myPartners:    (user.role !== 'AM' && !isMasterUser(user))
                     ? partners.filter(function(p) {
                         return p.ownerRole === user.role && p.ownerName.toLowerCase() === user.name.toLowerCase();
                       })
                     : [],
    filterOptions: {
      zones:  uniqueSorted(partners.map(function(p) { return p.zone;  })),
      states: uniqueSorted(partners.map(function(p) { return p.state; })),
      cities: uniqueSorted(partners.map(function(p) { return p.city;  })),
      owners: uniqueSorted(partners.map(function(p) { return p.ownerName; }))
    },
    myZones:       myZones,
    dailyRunRate:  rr.runRate,
    yesterdayMTD:  rr.yesterdayMTD
  };
}

function getMasterDashboard(gid) {
  var user = getUser(gid);
  if (!user) return { success: false, message: 'User not found.' };

  var ss          = SpreadsheetApp.openById(SHEET_ID);
  var allPartners = loadAllPartners(ss);

  // Zone summaries — using col F (direct, accurate)
  var zoneMap = {};
  allPartners.forEach(function(p) {
    var z = p.zone || 'Unknown';
    if (!zoneMap[z]) zoneMap[z] = [];
    zoneMap[z].push(p);
  });

  var zoneSummaries = Object.keys(zoneMap)
    .filter(function(z) { return z !== '' && z !== 'Unknown'; })
    .map(function(zone) {
      var zp = zoneMap[zone];
      var s  = buildSummary(zp);
      return {
        zone:          zone,
        partnerCount:  zp.length,
        summary:       s,
        overallProject:buildOverallProject(zp)
      };
    }).sort(function(a, b) { return b.summary.currentMonthPremium - a.summary.currentMonthPremium; });

  // State summaries
  var stateMap = {};
  allPartners.forEach(function(p) {
    var st = p.state || 'Unknown';
    if (!stateMap[st]) stateMap[st] = [];
    stateMap[st].push(p);
  });
  var stateSummaries = Object.keys(stateMap).map(function(state) {
    return { state: state, partnerCount: stateMap[state].length, summary: buildSummary(stateMap[state]) };
  }).sort(function(a, b) { return b.summary.currentMonthPremium - a.summary.currentMonthPremium; });

  var overallSummary = buildSummary(allPartners);
  var masterRR       = calcDailyRunRate(ss, overallSummary.currentMonthPremium);
  recordDailySnapshot(ss, allPartners);

  return {
    success:         true,
    totalPartners:   allPartners.length,
    overallSummary:  overallSummary,
    overallProject:  buildOverallProject(allPartners),
    zoneSummaries:   zoneSummaries,
    stateSummaries:  stateSummaries,
    zhPerf:  buildRolePerformance(allPartners, 'ZH'),
    rhPerf:  buildRolePerformance(allPartners, 'RH'),
    shPerf:  buildRolePerformance(allPartners, 'SH'),
    rmPerf:  buildRolePerformance(allPartners, 'RM'),
    amPerf:  buildRolePerformance(allPartners, 'AM'),
    dailyRunRate:    masterRR.runRate,
    yesterdayMTD:    masterRR.yesterdayMTD
  };
}

// ========================= HELPERS ==================================

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
