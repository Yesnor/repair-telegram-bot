const { getRows } = require('./sheetsClient');
const { t } = require('./i18n');

const SHEET = t('sheetNames.database');

function normalize(value) {
  return String(value || '').trim().toLocaleLowerCase();
}

async function getActiveCities() {
  const rows = await getRows(SHEET);
  return rows
    .filter((row) => normalize(row[0]))
    .map((row) => String(row[0]).trim());
}

module.exports = { getActiveCities };
