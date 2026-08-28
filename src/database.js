const { getRows, updateCell } = require("./sheetsClient");

const SHEET = "Database";

function normalize(value) {
  return String(value || "").trim().toLocaleLowerCase();
}

async function getActiveCategories() {
  const rows = (await getRows(SHEET)) || [];
  const categories = rows
    .map((row) => String(row[1] || "").trim())
    .filter(Boolean);

  return [...new Set(categories)];
}

async function incrementCategoryRequestCount(category) {
  const rows = (await getRows(SHEET)) || [];
  const rowIndex = rows.findIndex(
    (row) => String(row[1] || "").trim() === String(category).trim(),
  );

  if (rowIndex === -1) {
    throw new Error(`Category not found in Database: ${category}`);
  }

  const row = rows[rowIndex];
  const code = String(row[2] || "").trim();
  const currentCount = Number(row[3] || 0);

  if (!code) {
    throw new Error(`Category code not found in Database: ${category}`);
  }
  if (!Number.isInteger(currentCount) || currentCount < 0) {
    throw new Error(`Invalid request count in Database for category: ${category}`);
  }

  const nextCount = currentCount + 1;
  await updateCell(SHEET, rowIndex + 2, 4, nextCount);

  return { code, count: nextCount };
}

module.exports = { getActiveCategories, incrementCategoryRequestCount };
