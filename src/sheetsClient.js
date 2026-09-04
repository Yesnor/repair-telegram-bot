const { google } = require("googleapis");
const { createSheetsAuth } = require("./googleAuth");

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

let cachedSheetsApi = null;
let cachedSheetIds = null;

/**
 * Авторизация сервисного аккаунта и получение клиента Google Sheets API.
 * Клиент кэшируется на время жизни серверлесс-инстанса (холодный старт создаёт заново).
 */
async function getSheets() {
  if (cachedSheetsApi) return cachedSheetsApi;

  const auth = createSheetsAuth();
  await auth.authorize();

  cachedSheetsApi = google.sheets({ version: "v4", auth });
  return cachedSheetsApi;
}

/**
 * Преобразует номер столбца (1-based) в букву столбца A1-нотации (1 -> A, 27 -> AA и т.д.)
 */
function colLetter(n) {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - m) / 26);
  }
  return s;
}

async function getSheetId(sheets, sheetName) {
  if (!cachedSheetIds) {
    const meta = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID,
      fields: "sheets.properties(sheetId,title)",
    });
    cachedSheetIds = new Map(
      meta.data.sheets.map((sheet) => [sheet.properties.title, sheet.properties.sheetId]),
    );
  }
  const sheetId = cachedSheetIds.get(sheetName);
  if (sheetId === undefined) throw new Error(`Sheet not found: ${sheetName}`);
  return sheetId;
}

function rowNumberFromRange(range) {
  const cellsRange = range.split("!").pop();
  const match = cellsRange && cellsRange.match(/^[A-Z]+(\d+)(?::[A-Z]+\d+)?$/);
  return match ? Number(match[1]) : null;
}

async function clearRowFormat(sheets, sheetName, rowNumber, columnCount) {
  const sheetId = await getSheetId(sheets, sheetName);
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [
        {
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: rowNumber - 1,
              endRowIndex: rowNumber,
              startColumnIndex: 0,
              endColumnIndex: columnCount,
            },
            cell: { userEnteredFormat: {} },
            fields: "userEnteredFormat",
          },
        },
      ],
    },
  });
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
async function appendRow(sheetName, row, options = {}) {
  const sheets = await getSheets();
  const res = await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A1`,
    // RAW — записываем строки как есть, без автораспознавания Google Sheets.
    // USER_ENTERED ломает строки с двоеточиями (ключи сессий вида "chatId:userId",
    // ISO-даты, JSON), интерпретируя их как время/дату.
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [row] },
  });
  if (options.clearFormat) {
    const updatedRange = res.data.updates.updatedRange;
    const rowNumber = rowNumberFromRange(updatedRange);
    if (!rowNumber) throw new Error(`Could not detect appended row from range: ${updatedRange}`);
    await clearRowFormat(sheets, sheetName, rowNumber, row.length);
  }
}

async function getSheetData(sheetName) {
  const sheets = await getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A1:Z`,
  });
  const values = res.data.values || [];
  return { headers: values[0] || [], rows: values.slice(1) };
}

/**
 * Полностью перезаписывает строку с указанным номером (1-based номер строки листа).
 */
async function updateRow(sheetName, rowNumber, row) {
  const sheets = await getSheets();
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A${rowNumber}:${colLetter(row.length)}${rowNumber}`,
    valueInputOption: "RAW",
    requestBody: { values: [row] },
  });
}

async function updateCell(sheetName, rowNumber, columnNumber, value) {
  const sheets = await getSheets();
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!${colLetter(columnNumber)}${rowNumber}`,
    valueInputOption: "RAW",
    requestBody: { values: [[value]] },
  });
}

module.exports = { getSheets, getRows, getSheetData, appendRow, updateRow, updateCell, colLetter };
