// ====================================================================
// Partner Engage Portal — InsuranceDekho v4.2
// Code.gs — Google Apps Script Backend
// Changes: Anil zone fixed (no ROM), LMTD exposed, Growth calculated
// ====================================================================

const SHEET_ID = '1AgPaAik0vjh_9fcxX4NdV33-hWd4S5qNzwuFXb3xOis';
const SHEET_NAME = 'All_Partner List';
const USERS_SHEET = 'Users';
const LOG_SHEET = 'LoginLog';

const COL = {
  SNO: 0, GID: 1, NAME: 2, CITY: 3, STATE: 4, EMP_ID: 5,
  OWNER_ROLE: 6, OWNER_NAME: 7, STATUS: 8,
  IND_POTENTIAL: 9,
  MONTH_START: 10, MONTH_END: 22,
  OVERALL_POTENTIAL: 23,
  TARGET: 24, MTD: 25, LMTD: 26,
  ACTIVE: 27, GROWTH: 28,
  CALLS: 29, VISITS: 30,
  CALLS_R: 31, VISITS_R: 32,
  REMARK_SHEET: 33, REMARK_PARTNER: 34
};

const ROLE_LEVEL = { ZH:5, RH:4, SH:3, RM:2, AM:1, MASTER:99 };
const MASTER_GIDS = ['MASTER','IDK-MASTER','CENTRAL'];

// FIX: Anil Kumar now ONLY covers North states, no ROM/tele-rm
const ZH_ZONE_MAP = {
  'Anil Kumar':                 ['North','North Key','NCR','UP1','UP2','UK1','UK2'],
  'AYUSH GUPTA':                ['West','Gujarat','Rajasthan 1','Rajasthan 2','MP/CG'],
  'Bhagyaraj V':                ['South','Karnataka','Kerala','Tamil Nadu','Telangana','Andhra Pradesh'],
  'Paras Nayak':                ['East','West Bengal','Orissa','North East','Bihar','Jharkhand'],
  'Trivedi Kuldeep Bhanwarlal': ['West','Mumbai','Pune'],
  'Tushar Banerjee':            ['East','Bengal','East Central'],
  'Virendra A Ghuge':           ['RON','ROM 1','ROM 2']
};

// ============================ ENTRY ==================================
function doGet(e) {
  const p = e.parameter || {};
  let result;
  try {
    switch (p.action) {
      case 'login':         result = handleLogin(p.gid, p.password); break;
      case 'checkPassword': result = checkPasswordStatus(p.gid); break;
      case 'setPassword':   result = setPassword(p.gid, p.oldPassword, p.newPassword); break;
      case 'getDashboard':  result = getDashboard(p.gid); break;
      case 'getMaster':     result = getMasterDashboard(p.gid); break;
      case 'saveRemark':    result = saveRemark(p.gid, p.partnerGid, p.remark); break;
      case 'getLoginStats': result = getLoginStats(p.gid); break;
      default: result = { success: false, message: 'Unknown action.' };
    }
  } catch (err) {
    result = { success: false, message: 'Server error: ' + err.message, stack: String(err.stack || '') };
  }
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================ USERS / AUTH ===========================
function getUser(gid) {
  if (!gid) return null;
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(USERS_SHEET);
  if (!sheet) return null;
  const data = sheet.getDataRange().getValues();
  const target = String(gid).trim().toUpperCase();
  for (let i = 1; i < data.length; i++) {
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

function checkPasswordStatus(gid) {
  if (!gid) return { success: false, message: 'Enter your User ID.' };
  const user = getUser(gid);
  if (!user) return { success: false, message: 'User ID not found. Contact your admin.' };
  const has = !!(user.password && user.password !== '' && user.password !== 'null');
  return { success: true, hasPassword: has };
}

function handleLogin(gid, hashedPassword) {
  if (!gid) return { success: false, message: 'Enter your User ID.' };
  const user = getUser(gid);
  if (!user) return { success: false, message: 'User ID not found.' };
  if (!user.password || user.password === '' || user.password === 'null') {
    return { success: false, needsPasswordSet: true, message: 'No password set. Please create your password.' };
  }
  if (user.password !== String(hashedPassword || '').toLowerCase()) {
    return { success: false, message: 'Incorrect password.' };
  }
  logLogin(user);
  return { success: true, user: { gid: user.gid, name: user.name, role: user.role, zone: user.zone } };
}

function setPassword(gid, oldHashedPassword, newHashedPassword) {
  if (!gid || !newHashedPassword) return { success: false, message: 'Missing parameters.' };
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(USERS_SHEET);
  const user = getUser(gid);
  if (!user) return { success: false, message: 'User not found.' };
  const hasExisting = !!(user.password && user.password !== '' && user.password !== 'null');
  if (hasExisting && user.password !== String(oldHashedPassword || '').toLowerCase()) {
    return { success: false, message: 'Current password is incorrect.' };
  }
  sheet.getRange(user.rowIndex, 5).setValue(String(newHashedPassword).toLowerCase());
  return { success: true };
}

function logLogin(user) {
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    let ls = ss.getSheetByName(LOG_SHEET);
    if (!ls) {
      ls = ss.insertSheet(LOG_SHEET);
      ls.appendRow(['Timestamp', 'GID', 'Name', 'Role', 'Zone']);
    }
    ls.appendRow([new Date().toISOString(), user.gid, user.name, user.role, user.zone]);
  } catch (e) { /* ignore */ }
}

function getLoginStats(gid) {
  const user = getUser(gid);
  if (!user || !isMasterUser(user)) return { success: false, message: 'Access denied.' };
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const ls = ss.getSheetByName(LOG_SHEET);
  if (!ls) return { success: true, stats: [], totalLogins: 0 };
  const data = ls.getDataRange().getValues();
  const stats = {};
  for (let i = 1; i < data.length; i++) {
    const k = data[i][1];
    if (!stats[k]) stats[k] = { gid: data[i][1], name: data[i][2], role: data[i][3], zone: data[i][4], count: 0, lastLogin: '' };
    stats[k].count++;
    stats[k].lastLogin = data[i][0];
  }
  return { success: true, stats: Object.values(stats), totalLogins: data.length - 1 };
}

function isMasterUser(user) {
  if (!user) return false;
  if (user.role === 'MASTER') return true;
  return MASTER_GIDS.some(function (id) { return user.gid.toUpperCase().indexOf(id) !== -1; });
}

// ============================ REMARKS =================================
function saveRemark(userGid, partnerGid, remark) {
  if (!userGid || !partnerGid) return { success: false, message: 'Missing params.' };
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) return { success: false, message: 'Data sheet not found (' + SHEET_NAME + ').' };
  const data = sheet.getDataRange().getValues();
  const tgt = String(partnerGid).trim().toUpperCase();
  for (let i = 2; i < data.length; i++) {
    if (String(data[i][COL.GID]).trim().toUpperCase() === tgt) {
      sheet.getRange(i + 1, COL.REMARK_PARTNER + 1).setValue(remark || '');
      return { success: true };
    }
  }
  return { success: false, message: 'Partner not found.' };
}

// ============================ ZONE DETECTION ==========================
function zoneOfState(state) {
  const s = (state || '').toLowerCase().trim();
  if (!s) return 'Other';
  if (['north','north key','ncr','delhi','up1','up2','uk1','uk2','haryana',
       'punjab','chandigarh','himachal pradesh','j&k'].some(function (z) { return s === z || s.indexOf(z) !== -1; })) return 'North';
  if (['gujarat','rajasthan 1','rajasthan 2','rajasthan','mp/cg','madhya',
       'mumbai','pune','mumbai-tele'].some(function (z) { return s.indexOf(z) !== -1; })) return 'West';
  if (['karnataka','kerala','tamil nadu','telangana','andhra pradesh','south'].some(function (z) { return s.indexOf(z) !== -1; })) return 'South';
  if (['west bengal','bengal','orissa','north east','bihar','jharkhand','east central','east'].some(function (z) { return s.indexOf(z) !== -1; })) return 'East';
  if (['ron','rom 1','rom 2','rom','tele-rm'].some(function (z) { return s.indexOf(z) !== -1; })) return 'RON';
  return 'Other';
}

function detectUserZones(user, allRows) {
  const myName = user.name.toLowerCase();
  const zones = {};
  for (let r = 2; r < allRows.length; r++) {
    const row = allRows[r];
    if (!row[COL.GID] || String(row[COL.GID]).trim() === '') continue;
    const ownerRole = String(row[COL.OWNER_ROLE] || '').trim().toUpperCase();
    const ownerName = String(row[COL.OWNER_NAME] || '').trim().toLowerCase();
    if (ownerRole === user.role && ownerName === myName) {
      const z = zoneOfState(row[COL.STATE]);
      zones[z] = true;
    }
  }
  return Object.keys(zones);
}

function getUserZones(user, allRows) {
  if (user.role === 'AM' || user.role === 'MASTER') return [];

  if (user.role === 'ZH') {
    const states = ZH_ZONE_MAP[user.name] || [];
    const zSet = {};
    states.forEach(function (st) { zSet[zoneOfState(st)] = true; });
    states.forEach(function (st) {
      const lc = st.toLowerCase();
      if (['north','south','east','west','ron'].indexOf(lc) !== -1) {
        zSet[lc.charAt(0).toUpperCase() + lc.slice(1)] = true;
      }
    });
    return Object.keys(zSet);
  }

  return detectUserZones(user, allRows);
}

// ============================ DASHBOARD ===============================
function getDashboard(gid) {
  if (!gid) return { success: false, message: 'GID required.' };
  const user = getUser(gid);
  if (!user) return { success: false, message: 'User not found.' };

  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) return { success: false, message: 'Data sheet not found (' + SHEET_NAME + ').' };

  const allRows = sheet.getDataRange().getValues();
  const myZones = getUserZones(user, allRows);

  const partners = [];
  for (let r = 2; r < allRows.length; r++) {
    const row = allRows[r];
    if (!row[COL.GID] || String(row[COL.GID]).trim() === '') continue;
    const state = String(row[COL.STATE] || '').trim();
    const ownerRole = String(row[COL.OWNER_ROLE] || '').trim().toUpperCase();
    const ownerName = String(row[COL.OWNER_NAME] || '').trim();
    if (!canUserSeePartner(user, myZones, state, ownerRole, ownerName)) continue;
    partners.push(buildPartnerObj(row, r));
  }

  const summary = buildSummary(partners);
  const overallProject = buildOverallProject(partners);
  const teamBreakdown = (user.role !== 'AM') ? buildTeamBreakdown(partners, user) : null;
  const amPerformance = (user.role !== 'AM') ? buildAmPerformance(partners) : null;
  const myPartners = (user.role !== 'AM')
    ? partners.filter(function (p) {
        return p.ownerRole === user.role && p.ownerName.toLowerCase() === user.name.toLowerCase();
      })
    : null;

  return {
    success: true,
    user: { gid: user.gid, name: user.name, role: user.role, zone: user.zone },
    summary: summary,
    overallProject: overallProject,
    partners: partners,
    teamBreakdown: teamBreakdown,
    amPerformance: amPerformance,
    myPartners: myPartners,
    filterOptions: {
      states: uniqueSorted(partners.map(function (p) { return p.state; })),
      cities: uniqueSorted(partners.map(function (p) { return p.city; })),
      owners: uniqueSorted(partners.map(function (p) { return p.ownerName; }))
    },
    myZones: myZones
  };
}

function getMasterDashboard(gid) {
  const user = getUser(gid);
  if (!user || !isMasterUser(user)) return { success: false, message: 'Access denied.' };
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) return { success: false, message: 'Data sheet not found.' };

  const allRows = sheet.getDataRange().getValues();
  const allPartners = [];
  for (let r = 2; r < allRows.length; r++) {
    const row = allRows[r];
    if (!row[COL.GID] || String(row[COL.GID]).trim() === '') continue;
    allPartners.push(buildPartnerObj(row, r));
  }

  const zoneMap = {};
  allPartners.forEach(function (p) {
    const z = zoneOfState(p.state);
    if (!zoneMap[z]) zoneMap[z] = [];
    zoneMap[z].push(p);
  });
  const zoneSummaries = Object.keys(zoneMap).map(function (zone) {
    return {
      zone: zone,
      summary: buildSummary(zoneMap[zone]),
      overallProject: buildOverallProject(zoneMap[zone]),
      partnerCount: zoneMap[zone].length
    };
  });

  const stateMap = {};
  allPartners.forEach(function (p) {
    const st = p.state || 'Unknown';
    if (!stateMap[st]) stateMap[st] = [];
    stateMap[st].push(p);
  });
  const stateSummaries = Object.keys(stateMap).map(function (state) {
    return {
      state: state,
      summary: buildSummary(stateMap[state]),
      overallProject: buildOverallProject(stateMap[state]),
      partnerCount: stateMap[state].length
    };
  }).sort(function (a, b) { return b.summary.currentMonthPremium - a.summary.currentMonthPremium; });

  return {
    success: true,
    overallSummary: buildSummary(allPartners),
    overallProject: buildOverallProject(allPartners),
    zoneSummaries: zoneSummaries,
    stateSummaries: stateSummaries,
    zhPerf: buildRolePerformance(allPartners, 'ZH'),
    rhPerf: buildRolePerformance(allPartners, 'RH'),
    shPerf: buildRolePerformance(allPartners, 'SH'),
    rmPerf: buildRolePerformance(allPartners, 'RM'),
    amPerf: buildRolePerformance(allPartners, 'AM'),
    totalPartners: allPartners.length
  };
}

// ============================ ACCESS CONTROL ==========================
function canUserSeePartner(user, myZones, state, ownerRole, ownerName) {
  if (user.role === 'AM') {
    return ownerRole === 'AM' && ownerName.toLowerCase() === user.name.toLowerCase();
  }

  const partnerZone = zoneOfState(state);
  if (myZones.length === 0) return false;
  if (myZones.indexOf(partnerZone) === -1) return false;

  if (user.role === 'ZH') return true;

  const myLevel = ROLE_LEVEL[user.role] || 0;
  const ownerLevel = ROLE_LEVEL[ownerRole] || 0;
  if (ownerRole === user.role && ownerName.toLowerCase() === user.name.toLowerCase()) return true;
  if (ownerLevel > 0 && ownerLevel < myLevel) return true;
  return false;
}

// ============================ PARTNER OBJECT ==========================
function buildPartnerObj(row, rowIndex) {
  const monthlyData = [];
  for (let m = COL.MONTH_START; m <= COL.MONTH_END; m++) {
    monthlyData.push(parseNumber(row[m]));
  }
  const maxPotential = monthlyData.length ? Math.max.apply(null, monthlyData) : 0;
  const currentMonth = parseNumber(row[COL.MTD]);
  const prevMonth = parseNumber(row[COL.LMTD]);

  const activeRaw = String(row[COL.ACTIVE] || '').trim().toLowerCase();
  const isActive = activeRaw === '1' || activeRaw === 'active' || activeRaw === 'yes' || currentMonth > 0;

  const growthRaw = String(row[COL.GROWTH] || '').trim();
  let growthPct = 0;
  const growthNum = parseFloat(String(growthRaw).replace(/[^\-\d.]/g, ''));
  if (!isNaN(growthNum)) growthPct = growthNum;
  let isGrowth;
  if (growthRaw.toLowerCase().indexOf('degrowth') !== -1) isGrowth = false;
  else if (growthRaw.toLowerCase().indexOf('growth') !== -1) isGrowth = true;
  else if (!isNaN(growthNum)) isGrowth = growthNum >= 0;
  else isGrowth = currentMonth >= prevMonth;

  const callsRaw = String(row[COL.CALLS] || '').trim();
  const visitsRaw = String(row[COL.VISITS] || '').trim();
  const calls = parseNumber(callsRaw);
  const visits = parseNumber(visitsRaw);
  const connected = (callsRaw !== '' && callsRaw !== '0') || (visitsRaw !== '' && visitsRaw !== '0');

  return {
    rowIndex: rowIndex,
    gid: String(row[COL.GID] || '').trim(),
    name: String(row[COL.NAME] || '').trim(),
    city: String(row[COL.CITY] || '').trim(),
    state: String(row[COL.STATE] || '').trim(),
    empId: String(row[COL.EMP_ID] || '').trim(),
    ownerRole: String(row[COL.OWNER_ROLE] || '').trim().toUpperCase(),
    ownerName: String(row[COL.OWNER_NAME] || '').trim(),
    statusRaw: String(row[COL.STATUS] || '').trim(),
    indPotential: parseNumber(row[COL.IND_POTENTIAL]),
    overallPotential: parseNumber(row[COL.OVERALL_POTENTIAL]),
    maxPotential: maxPotential,
    target: parseNumber(row[COL.TARGET]),
    currentMonth: currentMonth,
    prevMonth: prevMonth,
    monthlyData: monthlyData,
    isActive: isActive,
    isGrowth: isGrowth,
    growthPct: growthPct,
    calls: calls,
    visits: visits,
    connected: connected,
    remark: String(row[COL.REMARK_PARTNER] || row[COL.REMARK_SHEET] || '').trim()
  };
}

// ============================ AGGREGATIONS ============================
function buildSummary(partners) {
  const total = partners.length;
  let curr = 0, prev = 0, maxPot = 0, overallPot = 0, target = 0;
  let active = 0, growth = 0, connected = 0, calls = 0, visits = 0;
  for (let i = 0; i < total; i++) {
    const p = partners[i];
    curr += p.currentMonth; prev += p.prevMonth;
    maxPot += p.maxPotential; overallPot += p.overallPotential;
    target += p.target;
    if (p.isActive) active++;
    if (p.isGrowth) growth++;
    if (p.connected) connected++;
    calls += p.calls; visits += p.visits;
  }
  return {
    totalPartners: total,
    totalMaxPotential: maxPot,
    totalOverallPotential: overallPot,
    totalTarget: target,
    currentMonthPremium: curr,
    prevMonthPremium: prev,
    activeCount: active,
    inactiveCount: total - active,
    growthCount: growth,
    degrowthCount: total - growth,
    connectedCount: connected,
    notConnectedCount: total - connected,
    totalCalls: calls,
    totalVisits: visits,
    achievementPct: target > 0 ? Math.round(curr / target * 100) : 0,
    momPct: prev > 0 ? Math.round((curr - prev) / prev * 100) : 0,
    maxPotAchPct: maxPot > 0 ? Math.round(curr / maxPot * 100) : 0
  };
}

function buildOverallProject(partners) {
  const s = buildSummary(partners);
  return {
    totalPartners: s.totalPartners,
    activePartners: s.activeCount,
    inactivePartners: s.inactiveCount,
    connectedPartners: s.connectedCount,
    nonConnectedPartners: s.notConnectedCount,
    visits: s.totalVisits,
    calls: s.totalCalls,
    businessGenerated: s.currentMonthPremium,
    maxPotential: s.totalMaxPotential,
    overallPotential: s.totalOverallPotential,
    target: s.totalTarget,
    achievementPct: s.achievementPct,
    maxPotAchPct: s.maxPotAchPct,
    momPct: s.momPct,
    growthCount: s.growthCount,
    degrowthCount: s.degrowthCount
  };
}

function buildTeamBreakdown(partners, user) {
  const myLevel = ROLE_LEVEL[user.role];
  const teamMap = {};
  partners.forEach(function (p) {
    const pLevel = ROLE_LEVEL[p.ownerRole] || 0;
    if (pLevel >= myLevel) return;
    const key = p.ownerRole + '|' + p.ownerName;
    if (!teamMap[key]) teamMap[key] = { role: p.ownerRole, name: p.ownerName, partners: [] };
    teamMap[key].partners.push(p);
  });
  return Object.keys(teamMap).map(function (key) {
    const m = teamMap[key];
    return {
      role: m.role, name: m.name,
      summary: buildSummary(m.partners),
      overallProject: buildOverallProject(m.partners),
      partners: m.partners
    };
  }).sort(function (a, b) { return b.summary.currentMonthPremium - a.summary.currentMonthPremium; });
}

function buildAmPerformance(partners) {
  const amMap = {};
  partners.forEach(function (p) {
    if (p.ownerRole !== 'AM') return;
    if (!amMap[p.ownerName]) amMap[p.ownerName] = [];
    amMap[p.ownerName].push(p);
  });
  return Object.keys(amMap).map(function (name) {
    const pts = amMap[name];
    return {
      name: name,
      role: 'AM',
      states: uniqueSorted(pts.map(function (p) { return p.state; })),
      cities: uniqueSorted(pts.map(function (p) { return p.city; })),
      summary: buildSummary(pts),
      overallProject: buildOverallProject(pts),
      partners: pts
    };
  }).sort(function (a, b) { return b.summary.currentMonthPremium - a.summary.currentMonthPremium; });
}

function buildRolePerformance(partners, role) {
  const map = {};
  partners.filter(function (p) { return p.ownerRole === role; }).forEach(function (p) {
    if (!map[p.ownerName]) map[p.ownerName] = [];
    map[p.ownerName].push(p);
  });
  return Object.keys(map).map(function (name) {
    const pts = map[name];
    return {
      name: name, role: role,
      zone: zoneOfState(pts[0] ? pts[0].state : ''),
      summary: buildSummary(pts),
      overallProject: buildOverallProject(pts),
      partnerCount: pts.length
    };
  }).sort(function (a, b) { return b.summary.currentMonthPremium - a.summary.currentMonthPremium; });
}

// ============================ HELPERS =================================
function uniqueSorted(arr) {
  const seen = {};
  const out = [];
  arr.forEach(function (v) {
    const s = String(v || '').trim();
    if (s && !seen[s]) { seen[s] = true; out.push(s); }
  });
  return out.sort();
}

function parseNumber(val) {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return isFinite(val) ? val : 0;
  const cleaned = String(val).replace(/[₹,%\s]/g, '').replace(/,/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}
