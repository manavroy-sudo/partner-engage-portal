// ====================================================================
// AM and Above Focused Partners — Code.gs v6
// Multi-sheet data loading (Zone_North authoritative for North)
// Daily run rate tracking in DailyMTD sheet
// Tele-RM fully excluded
// Master sees 2700+ records across all zones
// ====================================================================

const SHEET_ID    = '1AgPaAik0vjh_9fcxX4NdV33-hWd4S5qNzwuFXb3xOis';
const SHEET_NAME  = 'All_Partner List';   // fallback / non-North zones
const NORTH_SHEET = 'Zone_North';         // Sheet2 — authoritative North data
const USERS_SHEET = 'Users';
const LOG_SHEET   = 'LoginLog';
const DAILY_SHEET = 'DailyMTD';          // daily run-rate tracking

const COL = {
  GID:1, NAME:2, CITY:3, STATE:4, EMP_ID:5,
  OWNER_ROLE:6, OWNER_NAME:7, STATUS:8,
  MONTH_START:10, MONTH_END:22,          // Apr'25 → Apr'26 (13 months)
  OVERALL_POTENTIAL:23,
  TARGET:24, MTD:25, LMTD:26,
  ACTIVE:27, GROWTH:28,
  CALLS:29, VISITS:30,
  REMARK_SHEET:33, REMARK_PARTNER:34
};

const ROLE_LEVEL  = { ZH:5, RH:4, SH:3, RM:2, AM:1, MASTER:99 };
const MASTER_GIDS = ['MASTER','IDK-MASTER','CENTRAL'];
const TELE_RM_KW  = ['TELE-RM','TELE RM','TELERM'];
const OTHER_ZONE_SHEETS = ['Zone_South','Zone_East','Zone_West','Zone_RON'];

const ZH_ZONE_MAP = {
  'Anil Kumar':                 ['North','North Key','NCR','UP1','UP2','UK1','UK2'],
  'AYUSH GUPTA':                ['West','Gujarat','Rajasthan 1','Rajasthan 2','MP/CG'],
  'Bhagyaraj V':                ['South','Karnataka','Kerala','Tamil Nadu','Telangana','Andhra Pradesh'],
  'Paras Nayak':                ['East','West Bengal','Orissa','North East','Bihar','Jharkhand'],
  'Trivedi Kuldeep Bhanwarlal': ['West','Mumbai','Pune'],
  'Tushar Banerjee':            ['East','Bengal','East Central'],
  'Virendra A Ghuge':           ['RON','ROM 1','ROM 2']
};

// ========================= ENTRY ====================================
function doGet(e) {
  var p = e.parameter || {};
  var result;
  try {
    switch (p.action) {
      case 'login':            result = handleLogin(p.gid, p.password);                   break;
      case 'checkPassword':    result = checkPasswordStatus(p.gid);                       break;
      case 'setPassword':      result = setPassword(p.gid, p.oldPassword, p.newPassword); break;
      case 'getDashboard':     result = getDashboard(p.gid);                              break;
      case 'getMaster':        result = getMasterDashboard(p.gid);                        break;
      case 'saveRemark':       result = saveRemark(p.gid, p.partnerGid, p.remark);        break;
      case 'getLoginStats':    result = getLoginStats(p.gid);                             break;
      case 'getDailyTracking': result = getDailyTracking(p.gid);                          break;
      default: result = { success: false, message: 'Unknown action.' };
    }
  } catch(err) {
    result = { success: false, message: 'Server error: ' + err.message + ' | ' + String(err.stack||'') };
  }
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ========================= TELE-RM FILTER ===========================
function isTeleRMRow(row) {
  var ownerRole = String(row[COL.OWNER_ROLE] || '').trim().toUpperCase();
  for (var i = 0; i < TELE_RM_KW.length; i++) {
    if (ownerRole.indexOf(TELE_RM_KW[i]) !== -1) return true;
  }
  var state = String(row[COL.STATE] || '').trim().toLowerCase();
  if (state.indexOf('tele') !== -1) return true;
  return false;
}

// ========================= MULTI-SHEET DATA LOADING =================
// Strategy:
// 1. Zone_North (Sheet2) is authoritative for North zone — load it first
// 2. All_Partner List: skip any row whose state maps to North (already loaded)
// 3. Other zone sheets (Zone_South, etc.) if they exist — load and deduplicate
// Result: complete 2700+ partner dataset with correct North data
function loadAllPartners(ss) {
  var allPartners = [];
  var seenGids    = {};
  var northLoaded = false;

  // Step 1: Zone_North (authoritative for North)
  var northSheet = ss.getSheetByName(NORTH_SHEET);
  if (northSheet) {
    northLoaded = true;
    var nRows = northSheet.getDataRange().getValues();
    for (var r = 2; r < nRows.length; r++) {
      var row = nRows[r];
      if (!row[COL.GID] || String(row[COL.GID]).trim() === '') continue;
      if (isTeleRMRow(row)) continue;
      var gid = String(row[COL.GID]).trim().toUpperCase();
      if (!seenGids[gid]) {
        seenGids[gid] = true;
        allPartners.push(buildPartnerObj(row));
      }
    }
  }

  // Step 2: Other dedicated zone sheets (if they exist)
  OTHER_ZONE_SHEETS.forEach(function(sheetName) {
    var sh = ss.getSheetByName(sheetName);
    if (!sh) return;
    var rows = sh.getDataRange().getValues();
    for (var r = 2; r < rows.length; r++) {
      var row = rows[r];
      if (!row[COL.GID] || String(row[COL.GID]).trim() === '') continue;
      if (isTeleRMRow(row)) continue;
      var gid = String(row[COL.GID]).trim().toUpperCase();
      if (!seenGids[gid]) {
        seenGids[gid] = true;
        allPartners.push(buildPartnerObj(row));
      }
    }
  });

  // Step 3: All_Partner List — skip North rows (already from Zone_North) and skip already-seen GIDs
  var mainSheet = ss.getSheetByName(SHEET_NAME);
  if (mainSheet) {
    var mRows = mainSheet.getDataRange().getValues();
    for (var r = 2; r < mRows.length; r++) {
      var row = mRows[r];
      if (!row[COL.GID] || String(row[COL.GID]).trim() === '') continue;
      if (isTeleRMRow(row)) continue;
      var gid = String(row[COL.GID]).trim().toUpperCase();
      if (seenGids[gid]) continue; // already loaded from a zone sheet
      // If North sheet was loaded, skip North-zone rows from All_Partner List (prevent duplicates)
      if (northLoaded && zoneOfState(String(row[COL.STATE] || '').trim()) === 'North') continue;
      seenGids[gid] = true;
      allPartners.push(buildPartnerObj(row));
    }
  }

  return allPartners;
}

// Load partners visible to a specific non-master user (their zone only)
function loadUserPartners(ss, user) {
  var allRows = ss.getSheetByName(SHEET_NAME);
  if (!allRows) return { partners: [], myZones: [] };
  var rows    = allRows.getDataRange().getValues();
  var myZones = getUserZones(user, rows);

  // For North zone users: supplement with Zone_North data
  var northPartners   = {};
  var northSheetObj   = ss.getSheetByName(NORTH_SHEET);
  var northZoneActive = myZones.indexOf('North') !== -1;
  if (northZoneActive && northSheetObj) {
    var nRows = northSheetObj.getDataRange().getValues();
    for (var r = 2; r < nRows.length; r++) {
      var row = nRows[r];
      if (!row[COL.GID] || String(row[COL.GID]).trim() === '') continue;
      if (isTeleRMRow(row)) continue;
      var state     = String(row[COL.STATE]     || '').trim();
      var ownerRole = String(row[COL.OWNER_ROLE]|| '').trim().toUpperCase();
      var ownerName = String(row[COL.OWNER_NAME]|| '').trim();
      if (!canUserSeePartner(user, myZones, state, ownerRole, ownerName)) continue;
      var gid = String(row[COL.GID]).trim().toUpperCase();
      northPartners[gid] = buildPartnerObj(row);
    }
  }

  var partners = [];
  var seenGids = {};

  // Add north partners first
  Object.keys(northPartners).forEach(function(gid) {
    seenGids[gid] = true;
    partners.push(northPartners[gid]);
  });

  // Add from main sheet
  for (var r = 2; r < rows.length; r++) {
    var row       = rows[r];
    if (!row[COL.GID] || String(row[COL.GID]).trim() === '') continue;
    if (isTeleRMRow(row)) continue;
    var gid       = String(row[COL.GID]).trim().toUpperCase();
    if (seenGids[gid]) continue;  // already from north sheet
    var state     = String(row[COL.STATE]     || '').trim();
    var ownerRole = String(row[COL.OWNER_ROLE]|| '').trim().toUpperCase();
    var ownerName = String(row[COL.OWNER_NAME]|| '').trim();
    // Skip North rows if we loaded them from Zone_North
    if (northZoneActive && northSheetObj && zoneOfState(state) === 'North') continue;
    if (!canUserSeePartner(user, myZones, state, ownerRole, ownerName)) continue;
    seenGids[gid] = true;
    partners.push(buildPartnerObj(row));
  }

  return { partners: partners, myZones: myZones };
}

// ========================= DAILY RUN RATE TRACKING ==================
function ensureDailySheet(ss) {
  var sh = ss.getSheetByName(DAILY_SHEET);
  if (!sh) {
    sh = ss.insertSheet(DAILY_SHEET);
    sh.appendRow(['Date','TotalMTD','NorthMTD','SouthMTD','EastMTD','WestMTD','RONMTD','OtherMTD','Partners']);
    sh.getRange(1,1,1,9).setFontWeight('bold');
  }
  return sh;
}

function recordDailySnapshot(ss, allPartners) {
  try {
    var today = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd');
    var sh    = ensureDailySheet(ss);
    var data  = sh.getDataRange().getValues();
    // Check if today already recorded
    for (var i = 1; i < data.length; i++) {
      var d = String(data[i][0]).slice(0, 10);
      if (d === today) return; // already recorded today
    }
    // Record today
    var zMap = {};
    allPartners.forEach(function(p) {
      var z = zoneOfState(p.state);
      if (!zMap[z]) zMap[z] = 0;
      zMap[z] += p.currentMonth;
    });
    var total = allPartners.reduce(function(s,p){ return s+p.currentMonth; }, 0);
    sh.appendRow([today, total,
      zMap['North']||0, zMap['South']||0, zMap['East']||0,
      zMap['West']||0,  zMap['RON']||0,   zMap['Other']||0,
      allPartners.length
    ]);
  } catch(e) { /* non-critical */ }
}

function getDailyTracking(gid) {
  var user = getUser(gid);
  if (!user) return { success:false, message:'User not found.' };
  var ss   = SpreadsheetApp.openById(SHEET_ID);
  var sh   = ss.getSheetByName(DAILY_SHEET);
  if (!sh) return { success:true, history:[], runRate:0, todayMTD:0, yesterdayMTD:0 };
  var data = sh.getDataRange().getValues();
  var history = [];
  for (var i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    history.push({
      date:       String(data[i][0]).slice(0,10),
      totalMTD:   Number(data[i][1]||0),
      northMTD:   Number(data[i][2]||0),
      southMTD:   Number(data[i][3]||0),
      eastMTD:    Number(data[i][4]||0),
      westMTD:    Number(data[i][5]||0),
      ronMTD:     Number(data[i][6]||0),
      partners:   Number(data[i][8]||0)
    });
  }
  history.sort(function(a,b){ return a.date.localeCompare(b.date); });
  var todayMTD     = history.length ? history[history.length-1].totalMTD : 0;
  var yesterdayMTD = history.length > 1 ? history[history.length-2].totalMTD : 0;
  return { success:true, history:history, runRate: todayMTD-yesterdayMTD, todayMTD:todayMTD, yesterdayMTD:yesterdayMTD };
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
      return { rowIndex:i+1, gid:String(data[i][0]).trim().toUpperCase(),
               name:String(data[i][1]||'').trim(), role:String(data[i][2]||'').trim().toUpperCase(),
               zone:String(data[i][3]||'').trim(), password:String(data[i][4]||'').trim().toLowerCase() };
    }
  }
  return null;
}
function isMasterUser(user) {
  if (!user) return false;
  if (user.role === 'MASTER') return true;
  return MASTER_GIDS.some(function(id){ return user.gid.toUpperCase().indexOf(id) !== -1; });
}
function checkPasswordStatus(gid) {
  if (!gid) return { success:false, message:'Enter your User ID.' };
  var user = getUser(gid);
  if (!user) return { success:false, message:'User ID not found.' };
  return { success:true, hasPassword:!!(user.password && user.password !== '' && user.password !== 'null') };
}
function handleLogin(gid, hashedPassword) {
  if (!gid) return { success:false, message:'Enter your User ID.' };
  var user = getUser(gid);
  if (!user) return { success:false, message:'User ID not found.' };
  if (!user.password || user.password === '' || user.password === 'null')
    return { success:false, needsPasswordSet:true, message:'No password set. Please create your password.' };
  if (user.password !== String(hashedPassword||'').toLowerCase())
    return { success:false, message:'Incorrect password.' };
  logLogin(user);
  return { success:true, user:{ gid:user.gid, name:user.name, role:user.role, zone:user.zone } };
}
function setPassword(gid, oldHash, newHash) {
  if (!gid || !newHash) return { success:false, message:'Missing parameters.' };
  var user = getUser(gid);
  if (!user) return { success:false, message:'User not found.' };
  var has = !!(user.password && user.password !== '' && user.password !== 'null');
  if (has && user.password !== String(oldHash||'').toLowerCase())
    return { success:false, message:'Current password is incorrect.' };
  var ss = SpreadsheetApp.openById(SHEET_ID);
  ss.getSheetByName(USERS_SHEET).getRange(user.rowIndex,5).setValue(String(newHash).toLowerCase());
  return { success:true };
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
  if (!user) return { success:false, message:'Access denied.' };
  var ss   = SpreadsheetApp.openById(SHEET_ID);
  var ls   = ss.getSheetByName(LOG_SHEET);
  if (!ls) return { success:true, stats:[], totalLogins:0 };
  var data = ls.getDataRange().getValues();
  var stats = {};
  for (var i = 1; i < data.length; i++) {
    var k = data[i][1];
    if (!stats[k]) stats[k] = { gid:data[i][1], name:data[i][2], role:data[i][3], zone:data[i][4], count:0, lastLogin:'' };
    stats[k].count++; stats[k].lastLogin = data[i][0];
  }
  return { success:true, stats:Object.values(stats), totalLogins:data.length-1 };
}

// ========================= REMARKS ==================================
function saveRemark(userGid, partnerGid, remark) {
  if (!userGid || !partnerGid) return { success:false, message:'Missing params.' };
  var ss    = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) return { success:false, message:'Data sheet not found.' };
  var data  = sheet.getDataRange().getValues();
  var tgt   = String(partnerGid).trim().toUpperCase();
  for (var i = 2; i < data.length; i++) {
    if (String(data[i][COL.GID]).trim().toUpperCase() === tgt) {
      sheet.getRange(i+1, COL.REMARK_PARTNER+1).setValue(remark||'');
      return { success:true };
    }
  }
  return { success:false, message:'Partner not found.' };
}

// ========================= ZONE LOGIC ===============================
function zoneOfState(state) {
  var s = (state||'').toLowerCase().trim();
  if (!s) return 'Other';
  if (['north','north key','ncr','delhi','up1','up2','uk1','uk2','haryana',
       'punjab','chandigarh','himachal','j&k','uttarakhand'].some(function(z){ return s===z||s.indexOf(z)!==-1; })) return 'North';
  if (['gujarat','rajasthan','mp/cg','madhya','mumbai','pune','maharashtra',
       'goa'].some(function(z){ return s.indexOf(z)!==-1; })) return 'West';
  if (['karnataka','kerala','tamil','telangana','andhra','south',
       'chennai','bangalore','hyderabad'].some(function(z){ return s.indexOf(z)!==-1; })) return 'South';
  if (['bengal','orissa','north east','bihar','jharkhand','east central',
       'assam','odisha'].some(function(z){ return s.indexOf(z)!==-1; })) return 'East';
  if (['ron','rom'].some(function(z){ return s.indexOf(z)!==-1; })) return 'RON';
  return 'Other';
}

function detectUserZones(user, allRows) {
  var myName = user.name.toLowerCase();
  var zones  = {};
  for (var r = 2; r < allRows.length; r++) {
    var row = allRows[r];
    if (!row[COL.GID] || String(row[COL.GID]).trim() === '') continue;
    if (isTeleRMRow(row)) continue;
    if (String(row[COL.OWNER_ROLE]||'').trim().toUpperCase() === user.role &&
        String(row[COL.OWNER_NAME]||'').trim().toLowerCase() === myName) {
      zones[zoneOfState(row[COL.STATE])] = true;
    }
  }
  return Object.keys(zones);
}

function getUserZones(user, allRows) {
  if (user.role === 'AM' || user.role === 'MASTER') return [];
  if (user.role === 'ZH') {
    var states = ZH_ZONE_MAP[user.name] || [];
    var zSet = {};
    states.forEach(function(st) {
      zSet[zoneOfState(st)] = true;
      var lc = st.toLowerCase();
      if (['north','south','east','west','ron'].indexOf(lc) !== -1)
        zSet[lc.charAt(0).toUpperCase()+lc.slice(1)] = true;
    });
    return Object.keys(zSet);
  }
  return detectUserZones(user, allRows);
}

// ========================= ACCESS ===================================
function canUserSeePartner(user, myZones, state, ownerRole, ownerName) {
  if (isMasterUser(user)) return true;
  if (user.role === 'AM') return ownerRole==='AM' && ownerName.toLowerCase()===user.name.toLowerCase();
  var z = zoneOfState(state);
  if (!myZones.length || myZones.indexOf(z) === -1) return false;
  if (user.role === 'ZH') return true;
  var myLevel = ROLE_LEVEL[user.role]||0, ownerLevel = ROLE_LEVEL[ownerRole]||0;
  if (ownerRole===user.role && ownerName.toLowerCase()===user.name.toLowerCase()) return true;
  if (ownerLevel > 0 && ownerLevel < myLevel) return true;
  return false;
}

// ========================= PARTNER OBJECT ===========================
function buildPartnerObj(row) {
  var monthlyData = [];
  for (var m = COL.MONTH_START; m <= COL.MONTH_END; m++) monthlyData.push(parseNumber(row[m]));
  var maxPotential = monthlyData.length ? Math.max.apply(null, monthlyData) : 0;
  var currentMonth = parseNumber(row[COL.MTD]);
  var prevMonth    = parseNumber(row[COL.LMTD]);
  var activeRaw    = String(row[COL.ACTIVE]||'').trim().toLowerCase();
  var isActive     = activeRaw==='1'||activeRaw==='active'||activeRaw==='yes'||currentMonth>0;
  var growthRaw    = String(row[COL.GROWTH]||'').trim();
  var growthNum    = parseFloat(String(growthRaw).replace(/[^\-\d.]/g,''));
  var isGrowth;
  if (growthRaw.toLowerCase().indexOf('degrowth')!==-1) isGrowth=false;
  else if (growthRaw.toLowerCase().indexOf('growth')!==-1) isGrowth=true;
  else if (!isNaN(growthNum)) isGrowth=growthNum>=0;
  else isGrowth=currentMonth>=prevMonth;
  var callsRaw  = String(row[COL.CALLS] ||'').trim();
  var visitsRaw = String(row[COL.VISITS]||'').trim();
  var calls     = parseNumber(callsRaw);
  var visits    = parseNumber(visitsRaw);
  return {
    gid:              String(row[COL.GID]   ||'').trim(),
    name:             String(row[COL.NAME]  ||'').trim(),
    city:             String(row[COL.CITY]  ||'').trim(),
    state:            String(row[COL.STATE] ||'').trim(),
    empId:            String(row[COL.EMP_ID]||'').trim(),
    ownerRole:        String(row[COL.OWNER_ROLE]||'').trim().toUpperCase(),
    ownerName:        String(row[COL.OWNER_NAME]||'').trim(),
    overallPotential: parseNumber(row[COL.OVERALL_POTENTIAL]),
    maxPotential:     maxPotential,
    target:           parseNumber(row[COL.TARGET]),
    currentMonth:     currentMonth,
    prevMonth:        prevMonth,
    monthlyData:      monthlyData,
    isActive:         isActive,
    isGrowth:         isGrowth,
    calls:            calls,
    visits:           visits,
    connected:        (callsRaw!==''&&callsRaw!=='0')||(visitsRaw!==''&&visitsRaw!=='0'),
    remark:           String(row[COL.REMARK_PARTNER]||row[COL.REMARK_SHEET]||'').trim()
  };
}

// ========================= AGGREGATIONS =============================
function buildSummary(partners) {
  var curr=0,prev=0,maxPot=0,overallPot=0,target=0,active=0,growth=0,connected=0,calls=0,visits=0;
  var total=partners.length;
  for (var i=0;i<total;i++) {
    var p=partners[i];
    curr+=p.currentMonth; prev+=p.prevMonth; maxPot+=p.maxPotential;
    overallPot+=p.overallPotential; target+=p.target;
    if(p.isActive)active++; if(p.isGrowth)growth++; if(p.connected)connected++;
    calls+=p.calls; visits+=p.visits;
  }
  return {
    totalPartners:total, totalMaxPotential:maxPot, totalOverallPotential:overallPot,
    totalTarget:target, currentMonthPremium:curr, prevMonthPremium:prev,
    activeCount:active, inactiveCount:total-active,
    growthCount:growth, degrowthCount:total-growth,
    connectedCount:connected, notConnectedCount:total-connected,
    totalCalls:calls, totalVisits:visits,
    achievementPct:target>0?Math.round(curr/target*100):0,
    momPct:prev>0?Math.round((curr-prev)/prev*100):0,
    maxPotAchPct:maxPot>0?Math.round(curr/maxPot*100):0,
    engagementPct:total>0?Math.round(connected/total*100):0,
    activePct:total>0?Math.round(active/total*100):0,
    growthPct:total>0?Math.round(growth/total*100):0
  };
}

function buildOverallProject(partners) {
  var s=buildSummary(partners);
  return { totalPartners:s.totalPartners, activePartners:s.activeCount, inactivePartners:s.inactiveCount,
    connectedPartners:s.connectedCount, nonConnectedPartners:s.notConnectedCount,
    calls:s.totalCalls, visits:s.totalVisits, businessGenerated:s.currentMonthPremium, lmtd:s.prevMonthPremium,
    maxPotential:s.totalMaxPotential, overallPotential:s.totalOverallPotential, target:s.totalTarget,
    achievementPct:s.achievementPct, maxPotAchPct:s.maxPotAchPct, momPct:s.momPct,
    growthCount:s.growthCount, degrowthCount:s.degrowthCount,
    engagementPct:s.engagementPct, activePct:s.activePct, growthPct:s.growthPct };
}

function buildTeamBreakdown(partners, user) {
  var myLevel=ROLE_LEVEL[user.role]; var teamMap={};
  partners.forEach(function(p){
    var pLevel=ROLE_LEVEL[p.ownerRole]||0; if(pLevel>=myLevel) return;
    var key=p.ownerRole+'|'+p.ownerName;
    if(!teamMap[key]) teamMap[key]={role:p.ownerRole,name:p.ownerName,partners:[]};
    teamMap[key].partners.push(p);
  });
  return Object.keys(teamMap).map(function(key){
    var m=teamMap[key];
    return {role:m.role,name:m.name,summary:buildSummary(m.partners),overallProject:buildOverallProject(m.partners),partners:m.partners};
  }).sort(function(a,b){return b.summary.currentMonthPremium-a.summary.currentMonthPremium;});
}

function buildAmPerformance(partners) {
  var amMap={};
  partners.forEach(function(p){
    if(p.ownerRole!=='AM') return;
    if(!amMap[p.ownerName]) amMap[p.ownerName]=[];
    amMap[p.ownerName].push(p);
  });
  return Object.keys(amMap).map(function(name){
    var pts=amMap[name];
    return {name:name,role:'AM',states:uniqueSorted(pts.map(function(p){return p.state;})),
      cities:uniqueSorted(pts.map(function(p){return p.city;})),
      summary:buildSummary(pts),overallProject:buildOverallProject(pts),partners:pts};
  }).sort(function(a,b){return b.summary.currentMonthPremium-a.summary.currentMonthPremium;});
}

function buildRolePerformance(partners, role) {
  var map={};
  partners.filter(function(p){return p.ownerRole===role;}).forEach(function(p){
    if(!map[p.ownerName]) map[p.ownerName]=[];
    map[p.ownerName].push(p);
  });
  return Object.keys(map).map(function(name){
    var pts=map[name];
    return {name:name,role:role,zone:zoneOfState(pts[0]?pts[0].state:''),
      summary:buildSummary(pts),overallProject:buildOverallProject(pts),partnerCount:pts.length};
  }).sort(function(a,b){return b.summary.currentMonthPremium-a.summary.currentMonthPremium;});
}

// ========================= DAILY RUN RATE HELPER ====================
function calcDailyRunRate(ss, currentMTD, zone) {
  try {
    var sh = ss.getSheetByName(DAILY_SHEET);
    if (!sh) return { runRate:0, yesterdayMTD:0, runRatePct:0 };
    var data = sh.getDataRange().getValues();
    if (data.length < 2) return { runRate:0, yesterdayMTD:0, runRatePct:0 };
    // Get last entry
    var last = data[data.length-1];
    var colIdx = zone ? ({'North':2,'South':3,'East':4,'West':5,'RON':6}[zone]||1) : 1;
    var yesterdayMTD = Number(last[colIdx]||0);
    var runRate = currentMTD - yesterdayMTD;
    return { runRate:runRate, yesterdayMTD:yesterdayMTD, runRatePct:currentMTD>0?Math.round(runRate/currentMTD*100):0 };
  } catch(e) { return { runRate:0, yesterdayMTD:0, runRatePct:0 }; }
}

// ========================= DASHBOARD ================================
function getDashboard(gid) {
  if (!gid) return { success:false, message:'GID required.' };
  var user = getUser(gid);
  if (!user) return { success:false, message:'User not found.' };
  var ss   = SpreadsheetApp.openById(SHEET_ID);

  var partnerData, partners, myZones, displayZones;

  if (isMasterUser(user)) {
    // MASTER: load everything from all sheets
    partners    = loadAllPartners(ss);
    myZones     = [];
    displayZones = ['North','South','East','West','RON'];
  } else {
    partnerData  = loadUserPartners(ss, user);
    partners     = partnerData.partners;
    myZones      = partnerData.myZones;
    displayZones = myZones;
  }

  var summary        = buildSummary(partners);
  var overallProject = buildOverallProject(partners);
  var rr             = calcDailyRunRate(ss, summary.currentMonthPremium, null);

  // Record snapshot (once per day)
  if (isMasterUser(user)) recordDailySnapshot(ss, partners);

  return {
    success:true,
    user:{ gid:user.gid, name:user.name, role:user.role, zone:user.zone },
    summary:summary, overallProject:overallProject,
    partners:partners,
    teamBreakdown:  (user.role!=='AM') ? buildTeamBreakdown(partners,user) : null,
    amPerformance:  (user.role!=='AM') ? buildAmPerformance(partners)      : null,
    myPartners: (user.role!=='AM' && !isMasterUser(user))
      ? partners.filter(function(p){ return p.ownerRole===user.role && p.ownerName.toLowerCase()===user.name.toLowerCase(); })
      : [],
    filterOptions:{
      states: uniqueSorted(partners.map(function(p){return p.state;})),
      cities: uniqueSorted(partners.map(function(p){return p.city;})),
      owners: uniqueSorted(partners.map(function(p){return p.ownerName;}))
    },
    myZones:      displayZones,
    dailyRunRate: rr.runRate,
    yesterdayMTD: rr.yesterdayMTD
  };
}

// ========================= MASTER DASHBOARD =========================
function getMasterDashboard(gid) {
  var user = getUser(gid);
  if (!user) return { success:false, message:'User not found.' };
  var ss   = SpreadsheetApp.openById(SHEET_ID);

  // Load complete dataset from all sheets (2700+ records)
  var allPartners = loadAllPartners(ss);

  // Zone summaries
  var zoneMap = {};
  allPartners.forEach(function(p) {
    var z=zoneOfState(p.state); if(!zoneMap[z])zoneMap[z]=[];
    zoneMap[z].push(p);
  });

  var zoneSummaries = Object.keys(zoneMap)
    .filter(function(z){return z!=='Other';})
    .map(function(zone) {
      var zp=zoneMap[zone];
      var s=buildSummary(zp);
      var rr=calcDailyRunRate(ss, s.currentMonthPremium, zone);
      return { zone:zone, partnerCount:zp.length, summary:s, overallProject:buildOverallProject(zp),
               dailyRunRate:rr.runRate, yesterdayMTD:rr.yesterdayMTD };
    }).sort(function(a,b){return b.summary.currentMonthPremium-a.summary.currentMonthPremium;});

  // State summaries
  var stateMap={};
  allPartners.forEach(function(p){ var st=p.state||'Unknown'; if(!stateMap[st])stateMap[st]=[]; stateMap[st].push(p); });
  var stateSummaries=Object.keys(stateMap).map(function(state){
    return {state:state, partnerCount:stateMap[state].length, summary:buildSummary(stateMap[state])};
  }).sort(function(a,b){return b.summary.currentMonthPremium-a.summary.currentMonthPremium;});

  var overallSummary = buildSummary(allPartners);
  var masterRR       = calcDailyRunRate(ss, overallSummary.currentMonthPremium, null);

  recordDailySnapshot(ss, allPartners);

  return {
    success:true, totalPartners:allPartners.length,
    overallSummary:overallSummary, overallProject:buildOverallProject(allPartners),
    zoneSummaries:zoneSummaries, stateSummaries:stateSummaries,
    zhPerf:buildRolePerformance(allPartners,'ZH'),
    rhPerf:buildRolePerformance(allPartners,'RH'),
    shPerf:buildRolePerformance(allPartners,'SH'),
    rmPerf:buildRolePerformance(allPartners,'RM'),
    amPerf:buildRolePerformance(allPartners,'AM'),
    dailyRunRate:masterRR.runRate, yesterdayMTD:masterRR.yesterdayMTD
  };
}

// ========================= HELPERS ==================================
function uniqueSorted(arr) {
  var seen={},out=[];
  arr.forEach(function(v){ var s=String(v||'').trim(); if(s&&!seen[s]){seen[s]=true;out.push(s);} });
  return out.sort();
}
function parseNumber(val) {
  if(val===null||val===undefined||val==='') return 0;
  if(typeof val==='number') return isFinite(val)?val:0;
  var n=parseFloat(String(val).replace(/[₹,%\s]/g,'').replace(/,/g,''));
  return isNaN(n)?0:n;
}
