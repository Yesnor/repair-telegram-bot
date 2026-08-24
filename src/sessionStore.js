// В serverless-окружении процесс не хранит состояние между вызовами,
// поэтому состояние диалога с клиентом (Telegraf Scenes/Wizard) храним
// в отдельном листе "Sessions" той же Google Таблицы.
// Колонки листа: ChatKey | StateJSON | UpdatedAt

const { getRows, appendRow, updateRow } = require('./sheetsClient');

const SHEET = 'Sessions';

async function findRow(key) {
  const rows = await getRows(SHEET);
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0]) === String(key)) {
      return { rowNumber: i + 2, row: rows[i] };
    }
  }
  return null;
}

const sessionStore = {
  async get(key) {
    const found = await findRow(key);
    if (!found || !found.row[1]) return undefined;
    try {
      return JSON.parse(found.row[1]);
    } catch {
      return undefined;
    }
  },

  async set(key, value) {
    const row = [key, JSON.stringify(value), new Date().toISOString()];
    const found = await findRow(key);
    if (found) {
      await updateRow(SHEET, found.rowNumber, row);
    } else {
      await appendRow(SHEET, row);
    }
  },

  async delete(key) {
    const found = await findRow(key);
    if (found) {
      await updateRow(SHEET, found.rowNumber, [key, '', new Date().toISOString()]);
    }
  },
};

module.exports = { sessionStore };
