const REQUIRED_SYNC_SECRET_KEY = 'SYNC_SECRET';
const DEFAULT_HEADER_ROW = ['Date', 'Gig', 'Amount', 'Miles'];

function getSyncSecret() {
  return PropertiesService.getScriptProperties().getProperty(REQUIRED_SYNC_SECRET_KEY) || '';
}

function getSheetHeaders(sheet) {
  const lastColumn = Math.max(sheet.getLastColumn(), DEFAULT_HEADER_ROW.length);
  const rawHeaders = sheet.getRange(1, 1, 1, lastColumn).getValues()[0] || [];
  const headers = rawHeaders.map(header => header ? header.toString().trim() : '');

  if (headers.slice(0, DEFAULT_HEADER_ROW.length).some((value, index) => value !== DEFAULT_HEADER_ROW[index])) {
    sheet.getRange(1, 1, 1, DEFAULT_HEADER_ROW.length).setValues([DEFAULT_HEADER_ROW]);
    return DEFAULT_HEADER_ROW.reduce((map, header, index) => {
      map[header] = index + 1;
      return map;
    }, {});
  }

  return headers.reduce((map, header, index) => {
    if (header) map[header] = index + 1;
    return map;
  }, {});
}

function findRowForEntry(sheet, date, gig, columnMap) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;

  const dateCol = columnMap['Date'];
  const gigCol = columnMap['Gig'];
  const range = sheet.getRange(2, 1, lastRow - 1, Math.max(dateCol, gigCol));
  const rows = range.getValues();

  for (let i = 0; i < rows.length; i++) {
    if (rows[i][dateCol - 1].toString().trim() === date && rows[i][gigCol - 1].toString().trim() === gig) {
      return i + 2;
    }
  }

  return -1;
}

function parseNumber(value) {
  const parsed = parseFloat(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function doPost(e) {
  const secret = getSyncSecret();
  if (!secret) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'Sync secret not configured.' })).setMimeType(ContentService.MimeType.JSON);
  }

  try {
    const payload = JSON.parse(e.postData.contents || '{}');
    const token = payload.token || '';
    if (token !== secret) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'Unauthorized.' })).setMimeType(ContentService.MimeType.JSON);
    }

    const entries = Array.isArray(payload.entries) ? payload.entries : [];
    if (entries.length === 0) {
      return ContentService.createTextOutput(JSON.stringify({ success: true, message: 'No entries to sync.' })).setMimeType(ContentService.MimeType.JSON);
    }

    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const results = [];

    entries.forEach(entry => {
      const gig = (entry.gig || '').toString().trim();
      const date = (entry.date || '').toString().trim();
      const amount = parseNumber(entry.amount);
      const miles = parseNumber(entry.miles);
      const tabName = (entry.tabName || '').toString().trim();

      if (!gig || !date || !tabName) {
        results.push({ gig, date, ok: false, reason: 'Missing required fields.' });
        return;
      }

      const sheet = spreadsheet.getSheetByName(tabName) || spreadsheet.insertSheet(tabName);
      const columnMap = getSheetHeaders(sheet);
      const rowNumber = findRowForEntry(sheet, date, gig, columnMap);
      const targetRow = rowNumber !== -1 ? rowNumber : sheet.getLastRow() + 1;

      if (rowNumber === -1) {
        sheet.getRange(targetRow, columnMap['Date']).setValue(date);
        sheet.getRange(targetRow, columnMap['Gig']).setValue(gig);
      }

      sheet.getRange(targetRow, columnMap['Amount']).setValue(amount);
      sheet.getRange(targetRow, columnMap['Miles']).setValue(miles);
      results.push({ gig, date, ok: true, row: targetRow });
    });

    return ContentService.createTextOutput(JSON.stringify({ success: true, results })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'Invalid payload.' })).setMimeType(ContentService.MimeType.JSON);
  }
}
