const { getRows } = require('./sheetsClient');

const SHEET = 'Сотрудники';

function parseList(value) {
  return String(value || '')
    .split(';')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function matches(value, allowedValues) {
  const normalizedValue = String(value || '').trim().toLowerCase();
  return allowedValues.includes('*') || allowedValues.includes(normalizedValue);
}

async function getEmployeeByTelegramId(telegramId) {
  const rows = await getRows(SHEET);
  const row = rows.find(
    (item) =>
      String(item[0]) === String(telegramId) &&
      String(item[5] || '').trim().toLowerCase() === 'да',
  );
  if (!row) return null;

  const categories = parseList(row[3]);
  const cities = parseList(row[4]);
  return {
    telegramId: row[0],
    telegramName: row[1] || '',
    name: row[2] || '',
    category: row[3] || '',
    categories,
    active: true,
    city: row[4] || '',
    cities,
  };
}

async function getActiveEmployeesByCategory(category, city) {
  const rows = await getRows(SHEET);
  return rows
    .filter((row) => {
      const categories = parseList(row[3]);
      const cities = parseList(row[4]);
      return (
        String(row[5] || '').trim().toLowerCase() === 'да' &&
        matches(category, categories) &&
        matches(city, cities)
      );
    })
    .map((row) => ({
      telegramId: row[0],
      name: row[2] || '',
      category: row[3] || '',
      city: row[4] || '',
    }));
}

module.exports = { getEmployeeByTelegramId, getActiveEmployeesByCategory };
