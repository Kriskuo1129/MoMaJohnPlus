const SPREADSHEET_ID = '1molsZ3WG-6fjPzIDSwqGBd0txyHshcBAQaEU5mDqN-A';
const LEGACY_SHEET_NAME = 'Ranking';
const RANKING_SHEET_NAMES = Object.freeze({ highest: 'HighestRanking', lowest: 'LowestRanking' });
const HEADERS = ['timestamp', 'name', 'score'];
const TOP_LIMIT = 20;

function doGet(e) {
  try {
    const mode = getRankingMode_(e);
    const sheet = getRankingSheet_(mode, false);
    return jsonResponse_({ success: true, ranking: sheet ? readRankingSheet_(sheet, mode) : [] });
  } catch (error) {
    console.error(error);
    return jsonResponse_({ success: false, error: getErrorMessage_(error) });
  }
}

function doPost(e) {
  try {
    const payload = parseJsonBody_(e);
    const mode = validateMode_(payload.mode);
    const name = validateName_(payload.name);
    const score = validateScore_(payload.score);
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const sheet = getRankingSheet_(mode, true);
      sheet.appendRow([new Date(), name, score]);
      rewriteRankingSheet_(sheet, readValidEntries_(sheet), mode);
    } finally {
      lock.releaseLock();
    }
    return jsonResponse_({ success: true });
  } catch (error) {
    console.error(error);
    return jsonResponse_({ success: false, error: getErrorMessage_(error) });
  }
}

// Run manually from the Apps Script editor. Never called by GET or POST.
function initializeDualLeaderboards() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const spreadsheet = getSpreadsheet_();
    const legacySheet = spreadsheet.getSheetByName(LEGACY_SHEET_NAME);
    if (!legacySheet) throw new Error('Ranking seed sheet does not exist.');
    validateHeaders_(legacySheet, LEGACY_SHEET_NAME);
    const seedRows = readValidEntries_(legacySheet);
    const rankings = buildMigrationRankings_(seedRows);
    rewriteRankingSheet_(getRankingSheet_('highest', true), rankings.highest, 'highest');
    rewriteRankingSheet_(getRankingSheet_('lowest', true), rankings.lowest, 'lowest');
  } finally {
    lock.releaseLock();
  }
}

function readRankingSheet_(sheet, mode) {
  return rankEntries_(readValidEntries_(sheet), mode).map(function (entry, index) {
    return { rank: index + 1, name: entry.name, score: entry.score, timestamp: entry.timestamp.toISOString() };
  });
}

function readValidEntries_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];
  return sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues()
    .map(function (row, index) { return { timestamp: row[0], name: row[1], score: row[2], rowIndex: index }; })
    .filter(function (entry) {
      return entry.timestamp instanceof Date && !isNaN(entry.timestamp.getTime()) &&
        typeof entry.name === 'string' && entry.name.trim() !== '' &&
        typeof entry.score === 'number' && isFinite(entry.score);
    });
}

function rankEntries_(entries, mode) {
  return entries.slice().sort(function (a, b) { return compareRankingEntries_(a, b, mode); }).slice(0, TOP_LIMIT);
}

function buildMigrationRankings_(entries) {
  return { highest: rankEntries_(entries, 'highest'), lowest: rankEntries_(entries, 'lowest') };
}

function rewriteRankingSheet_(sheet, entries, mode) {
  const ranked = rankEntries_(entries, mode);
  sheet.clearContents();
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  if (ranked.length) {
    sheet.getRange(2, 1, ranked.length, HEADERS.length).setValues(ranked.map(function (entry) {
      return [entry.timestamp, entry.name, entry.score];
    }));
  }
  sheet.setFrozenRows(1);
}

function getRankingMode_(e) {
  const mode = e && e.parameter ? e.parameter.mode : '';
  return mode === 'lowest' ? 'lowest' : 'highest';
}

function validateMode_(mode) {
  if (mode !== 'highest' && mode !== 'lowest') throw new Error('mode must be highest or lowest.');
  return mode;
}

function compareRankingEntries_(a, b, mode) {
  const scoreOrder = mode === 'lowest' ? a.score - b.score : b.score - a.score;
  return scoreOrder || b.timestamp.getTime() - a.timestamp.getTime() || b.rowIndex - a.rowIndex;
}

function getSpreadsheet_() {
  if (!SPREADSHEET_ID || SPREADSHEET_ID === 'PASTE_YOUR_SPREADSHEET_ID_HERE') throw new Error('SPREADSHEET_ID has not been configured.');
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function getRankingSheet_(mode, createIfMissing) {
  validateMode_(mode);
  const spreadsheet = getSpreadsheet_();
  const sheetName = RANKING_SHEET_NAMES[mode];
  let sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet && createIfMissing) sheet = spreadsheet.insertSheet(sheetName);
  if (!sheet) return null;
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  } else validateHeaders_(sheet, sheetName);
  return sheet;
}

function validateHeaders_(sheet, sheetName) {
  if (sheet.getLastRow() === 0) throw new Error(sheetName + ' sheet is missing headers.');
  const actual = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  if (!HEADERS.every(function (header, index) { return actual[index] === header; })) {
    throw new Error(sheetName + ' sheet headers must be: timestamp, name, score.');
  }
}

function parseJsonBody_(e) {
  if (!e || !e.postData || typeof e.postData.contents !== 'string') throw new Error('Request body is required.');
  try {
    const payload = JSON.parse(e.postData.contents);
    if (!payload || Array.isArray(payload) || typeof payload !== 'object') throw new Error('Request body must be a JSON object.');
    return payload;
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('Request body must contain valid JSON.');
    throw error;
  }
}

function validateName_(value) {
  if (typeof value !== 'string') throw new Error('name must be a string.');
  const name = value.trim();
  if (!name) throw new Error('name must not be empty.');
  if (Array.from(name).length > 12) throw new Error('name must be 12 characters or fewer.');
  return name;
}

function validateScore_(value) {
  if (typeof value !== 'number' || !isFinite(value)) throw new Error('score must be a finite number.');
  return value;
}

function jsonResponse_(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}

function getErrorMessage_(error) {
  return error && error.message ? error.message : 'Unexpected server error.';
}
