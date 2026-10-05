const SPREADSHEET_ID = 'PASTE_YOUR_SPREADSHEET_ID_HERE';
const SHEET_NAME = 'Ranking';
const HEADERS = ['timestamp', 'name', 'score'];
const TOP_LIMIT = 20;

function doGet(e) {
  try {
    const sheet = getRankingSheet_();
    const lastRow = sheet.getLastRow();

    if (lastRow <= 1) {
      return jsonResponse_({ success: true, ranking: [] });
    }

    const rows = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
    const ranking = rows
      .map(function (row, index) {
        return {
          timestamp: row[0],
          name: row[1],
          score: row[2],
          rowIndex: index,
        };
      })
      .filter(function (entry) {
        return (
          entry.timestamp instanceof Date &&
          !isNaN(entry.timestamp.getTime()) &&
          typeof entry.name === 'string' &&
          typeof entry.score === 'number' &&
          isFinite(entry.score)
        );
      })
      .sort(function (a, b) {
        return (
          b.score - a.score ||
          a.timestamp.getTime() - b.timestamp.getTime() ||
          a.rowIndex - b.rowIndex
        );
      })
      .slice(0, TOP_LIMIT)
      .map(function (entry, index) {
        return {
          rank: index + 1,
          name: entry.name,
          score: entry.score,
          timestamp: entry.timestamp.toISOString(),
        };
      });

    return jsonResponse_({ success: true, ranking: ranking });
  } catch (error) {
    console.error(error);
    return jsonResponse_({ success: false, error: getErrorMessage_(error) });
  }
}

function doPost(e) {
  try {
    const payload = parseJsonBody_(e);
    const name = validateName_(payload.name);
    const score = validateScore_(payload.score);

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);

    try {
      const sheet = getRankingSheet_();
      sheet.appendRow([new Date(), name, score]);
    } finally {
      lock.releaseLock();
    }

    return jsonResponse_({ success: true });
  } catch (error) {
    console.error(error);
    return jsonResponse_({ success: false, error: getErrorMessage_(error) });
  }
}

function getRankingSheet_() {
  if (
    !SPREADSHEET_ID ||
    SPREADSHEET_ID === 'PASTE_YOUR_SPREADSHEET_ID_HERE'
  ) {
    throw new Error('SPREADSHEET_ID has not been configured.');
  }

  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  } else {
    const actualHeaders = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
    const hasExpectedHeaders = HEADERS.every(function (header, index) {
      return actualHeaders[index] === header;
    });

    if (!hasExpectedHeaders) {
      throw new Error('Ranking sheet headers must be: timestamp, name, score.');
    }
  }

  return sheet;
}

function parseJsonBody_(e) {
  if (!e || !e.postData || typeof e.postData.contents !== 'string') {
    throw new Error('Request body is required.');
  }

  try {
    const payload = JSON.parse(e.postData.contents);

    if (!payload || Array.isArray(payload) || typeof payload !== 'object') {
      throw new Error('Request body must be a JSON object.');
    }

    return payload;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('Request body must contain valid JSON.');
    }

    throw error;
  }
}

function validateName_(value) {
  if (typeof value !== 'string') {
    throw new Error('name must be a string.');
  }

  const name = value.trim();

  if (!name) {
    throw new Error('name must not be empty.');
  }

  if (Array.from(name).length > 12) {
    throw new Error('name must be 12 characters or fewer.');
  }

  return name;
}

function validateScore_(value) {
  if (typeof value !== 'number' || !isFinite(value)) {
    throw new Error('score must be a finite number.');
  }

  return value;
}

function jsonResponse_(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function getErrorMessage_(error) {
  return error && error.message ? error.message : 'Unexpected server error.';
}
