const { getRows } = require('./sheetsClient');
const { t } = require('./i18n');

const SHEET = t('sheetNames.employees');

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

function isActive(value) {
  return ['да', 'так'].includes(String(value || '').trim().toLowerCase());
}

function normalizeTelegramId(value) {
  return String(value ?? '')
    .trim()
    .replace(/^'/, '')
    .replace(/\.0$/, '');
}

async function getEmployeeByTelegramId(telegramId) {
  const rows = await getRows(SHEET);
  const row = rows.find(
    (item) =>
      normalizeTelegramId(item[0]) === normalizeTelegramId(telegramId) &&
      isActive(item[5]),
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
        isActive(row[5]) &&
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
