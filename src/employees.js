const { getRows } = require('./sheetsClient');

const SHEET = 'Сотрудники';

// Колонки листа "Сотрудники": TelegramID | Имя | Категория | Активен (да/нет) | Город

async function getEmployeeByTelegramId(telegramId) {
  const rows = await getRows(SHEET);
  const employeeRows = rows.filter((r) => String(r[0]) === String(telegramId));
  const row = employeeRows.find((r) => (r[4] || '').trim().toLowerCase() === 'да');
  if (!row) return null;
  const cities = [...new Set(employeeRows
    .filter((r) => (r[4] || '').trim().toLowerCase() === 'да')
    .map((r) => String(r[5] || '').trim())
    .filter(Boolean))];
  return {
    telegramId: row[0],
    telegramName: row[1] || '',
    name: row[2] || '',
    category: row[3] || '',
    active: (row[4] || '').trim().toLowerCase() === 'да',
    city: row[5] || '',
    cities,
  };
}

async function getActiveEmployeesByCategory(category, city) {
  const rows = await getRows(SHEET);
  return rows
    .filter(
      (r) =>
        r[3] === category &&
        (r[4] || '').trim().toLowerCase() === 'да' &&
        String(r[5] || '').trim().toLowerCase() === String(city || '').trim().toLowerCase(),
    )
    .map((r) => ({ telegramId: r[0], name: r[2] || '', category: r[3], city: r[5] || '' }));
}

module.exports = { getEmployeeByTelegramId, getActiveEmployeesByCategory };
