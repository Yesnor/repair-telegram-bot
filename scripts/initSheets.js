require("dotenv").config();
const { google } = require("googleapis");
const { createSheetsAuth } = require("../src/googleAuth");
const { t } = require("../src/i18n");

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

const SHEETS = {
  Заявки: t("sheetHeaders.requests"),
  Сотрудники: t("sheetHeaders.employees"),
  Database: t("sheetHeaders.database"),
  "Оплата та розрахунки": t("sheetHeaders.payments"),
  Sessions: t("sheetHeaders.sessions"),
};

async function main() {
  if (!SPREADSHEET_ID) {
    throw new Error("Set SPREADSHEET_ID in .env before running init-sheets.");
  }

  const auth = createSheetsAuth(); 
  const sheets = google.sheets({ version: "v4", auth });
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const existingTitles = meta.data.sheets.map((s) => s.properties.title);

  const requests = [];
  const createdTitles = [];
  const oldCitiesSheet = meta.data.sheets.find(
    (sheet) => sheet.properties.title === "Города",
  );
  if (oldCitiesSheet && !existingTitles.includes("Database")) {
    requests.push({
      updateSheetProperties: {
        properties: { sheetId: oldCitiesSheet.properties.sheetId, title: "Database" },
        fields: "title",
      },
    });
    existingTitles.splice(existingTitles.indexOf("Города"), 1, "Database");
  }
  for (const title of Object.keys(SHEETS)) {
    if (!existingTitles.includes(title)) {
      requests.push({ addSheet: { properties: { title } } });
      createdTitles.push(title);
    }
  }
  if (requests.length) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests },
    });
    console.log(
      "Созданы листы:",
      createdTitles,
    );
  }

  for (const [title, header] of Object.entries(SHEETS)) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${title}!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [header] },
    });
  }

  console.log("Заголовки листов записаны. Таблица готова к работе.");
  console.log('Не забудьте добавить сотрудников в лист "Сотрудники" вручную.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
