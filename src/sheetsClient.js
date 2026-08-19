const { google } = require('googleapis');

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

let cachedSheetsApi = null;

/**
 * Авторизация сервисного аккаунта и получение клиента Google Sheets API.
 * Клиент кэшируется на время жизни серверлесс-инстанса (холодный старт создаёт заново).
 */
async function getSheets() {
  if (cachedSheetsApi) return cachedSheetsApi;

  const auth = new google.auth.JWT(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    null,
    (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    ['https://www.googleapis.com/auth/spreadsheets']
  );
  await auth.authorize();

  cachedSheetsApi = google.sheets({ version: 'v4', auth });
  return cachedSheetsApi;
}

/**
 * Преобразует номер столбца (1-based) в букву столбца A1-нотации (1 -> A, 27 -> AA и т.д.)
 */
function colLetter(n) {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - m) / 26);
  }
  return s;
}

/**
 * Возвращает все строки данных листа (без заголовка), начиная со 2-й строки.
 * Индекс элемента в массиве i соответствует строке листа i + 2.
 */
async function getRows(sheetName) {
  const sheets = await getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A2:Z`,
  });
  return res.data.values || [];
}

/**
 * Добавляет новую строку в конец листа.
 */
async function appendRow(sheetName, row) {
  const sheets = await getSheets();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] },
  });
}

/**
 * Полностью перезаписывает строку с указанным номером (1-based номер строки листа).
 */
async function updateRow(sheetName, rowNumber, row) {
  const sheets = await getSheets();
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A${rowNumber}:${colLetter(row.length)}${rowNumber}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [row] },
  });
}

module.exports = { getSheets, getRows, appendRow, updateRow, colLetter };
