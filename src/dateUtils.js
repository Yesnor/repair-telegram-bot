// Утилита форматирования дат для записи в Google Таблицу.
// Вместо стандартного ISO 8601 (например, 2026-08-20T08:00:49.672Z)
// пишем более компактный и читаемый в таблице формат:
// 2026-08-20_08:00:49 (без миллисекунд, без "T" и без "Z").

/**
 * Форматирует дату в строку вида YYYY-MM-DD_HH:mm:ss (UTC).
 * @param {Date} [date] — дата для форматирования, по умолчанию текущий момент.
 * @returns {string}
 */
function formatTimestamp(date = new Date()) {
  return date.toISOString().replace('T', '_').replace(/\.\d{3}Z$/, '');
}

module.exports = { formatTimestamp };
