const { getRows } = require('./sheetsClient');

const SHEET = 'Сотрудники';

// Колонки листа "Сотрудники": TelegramID | Имя | Категория | Активен (да/нет)

async function getEmployeeByTelegramId(telegramId) {
  const rows = await getRows(SHEET);
  const row = rows.find((r) => String(r[0]) === String(telegramId));
  if (!row) return null;
  return {
    telegramId: row[0],
    name: row[1] || '',
    category: row[2] || '',
    active: (row[3] || '').trim().toLowerCase() === 'да',
  };
}

async function getActiveEmployeesByCategory(category) {
  const rows = await getRows(SHEET);
  return rows
    .filter((r) => r[2] === category && (r[3] || '').trim().toLowerCase() === 'да')
    .map((r) => ({ telegramId: r[0], name: r[1] || '', category: r[2] }));
}

module.exports = { getEmployeeByTelegramId, getActiveEmployeesByCategory };
