require("dotenv").config();
const { google } = require("googleapis");
const { createSheetsAuth } = require("../src/googleAuth");

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

const SHEETS = {
  Заявки: [
    "ID",
    "Дата создания",
    "Client Telegram ID",
    "Client Telegram name",
    "Клиент",
    "Телефон",
    "Категория",
    "Описание",
    "Город",
    "Адрес",
    "Срок исполнения",
    "Статус",
    "Employee Telegram ID",
    "Имя сотрудника",
    "Дата приёма заявки",
    "Дата выезда сотрудника по заявке",
    "Дата закрытия заявки",
    "NotifiedMessages (служебное)",
    "Ссылки на фото документов",
    "Work description added (служебное)",
  ],
  Сотрудники: ["Telegram ID", "Telegram name", "Имя", "Категория", "Активен (да/нет)", "Город"],
  Database: [
    "Город",
    "Активен (да/нет)",
    "Список категорий",
    "Код категории",
    "Количество заявок",
  ],
  "Оплата та розрахунки": [
    "ID",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "Сума затрат на материалы",
  ],
  Sessions: [
    "ChatKey (служебное)",
    "StateJSON (служебное)",
    "UpdatedAt (служебное)",
  ],
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
