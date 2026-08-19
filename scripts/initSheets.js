require('dotenv').config();
const { google } = require('googleapis');

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

const SHEETS = {
  'Заявки': [
    'ID', 'Дата создания', 'Client Telegram ID', 'Имя клиента', 'Телефон',
    'Категория', 'Описание', 'Адрес', 'Удобное время', 'Статус',
    'Employee Telegram ID', 'Имя сотрудника', 'Дата взятия', 'Дата выезда',
    'Дата закрытия', 'NotifiedMessages (служебное)',
  ],
  'Сотрудники': ['Telegram ID', 'Имя', 'Категория', 'Активен (да/нет)'],
  'Sessions': ['ChatKey (служебное)', 'StateJSON (служебное)', 'UpdatedAt (служебное)'],
};

async function main() {
  const auth = new google.auth.JWT(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    null,
    (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    ['https://www.googleapis.com/auth/spreadsheets']
  );
  await auth.authorize();
  const sheets = google.sheets({ version: 'v4', auth });

  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const existingTitles = meta.data.sheets.map((s) => s.properties.title);

  const requests = [];
  for (const title of Object.keys(SHEETS)) {
    if (!existingTitles.includes(title)) {
      requests.push({ addSheet: { properties: { title } } });
    }
  }
  if (requests.length) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests },
    });
    console.log('Созданы листы:', requests.map((r) => r.addSheet.properties.title));
  }

  for (const [title, header] of Object.entries(SHEETS)) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${title}!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [header] },
    });
  }

  console.log('Заголовки листов записаны. Таблица готова к работе.');
  console.log('Не забудьте добавить сотрудников в лист "Сотрудники" вручную.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
