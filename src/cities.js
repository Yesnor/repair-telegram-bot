const { getRows } = require('./sheetsClient');

const SHEET = 'Города';

function normalize(value) {
  return String(value || '').trim().toLocaleLowerCase();
}

async function getActiveCities() {
  const rows = await getRows(SHEET);
  return rows
    .filter((row) => normalize(row[0]) && normalize(row[1]) === 'да')
    .map((row) => String(row[0]).trim());
}

module.exports = { getActiveCities };
