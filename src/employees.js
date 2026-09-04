const { getSheetData } = require('./sheetsClient');
const { t } = require('./i18n');

const SHEET = t('sheetNames.employees');

function parseList(value) {
  return String(value || '')
    .split(';')
    .map(normalizeValue)
    .filter(Boolean);
}

function normalizeValue(value) {
  return String(value || '')
    .normalize('NFC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase();
}

function matches(value, allowedValues) {
  const normalizedValue = normalizeValue(value);
  return allowedValues.includes('*') || allowedValues.includes(normalizedValue);
}

function isActive(value) {
  if (value === true) return true;
  return ['да', 'так'].includes(normalizeValue(value));
}

function normalizeTelegramId(value) {
  return String(value ?? '')
    .trim()
    .replace(/^'/, '')
    .replace(/\.0$/, '');
}

function normalizeHeader(value) {
  return normalizeValue(value);
}

function activeColumnIndex(headers) {
  return headers.findIndex((header) =>
    ['активний (так/ні)', 'активен (да/нет)'].includes(normalizeHeader(header)),
  );
}

async function getEmployeeByTelegramId(telegramId) {
  const { headers, rows } = await getSheetData(SHEET);
  const activeColumn = activeColumnIndex(headers);
  if (activeColumn === -1) return null;
  const row = rows.find(
    (item) =>
      normalizeTelegramId(item[0]) === normalizeTelegramId(telegramId) &&
      isActive(item[activeColumn]),
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
  const { headers, rows } = await getSheetData(SHEET);
  const activeColumn = activeColumnIndex(headers);
  if (activeColumn === -1) return [];
  return rows
    .filter((row) => {
      const categories = parseList(row[3]);
      const cities = parseList(row[4]);
      return (
        isActive(row[activeColumn]) &&
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
