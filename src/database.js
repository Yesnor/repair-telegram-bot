const { getRows } = require("./sheetsClient");

const SHEET = "Database";

function normalize(value) {
  return String(value || "").trim().toLocaleLowerCase();
}

async function getActiveCategories() {
  const rows = (await getRows(SHEET)) || [];
  const categories = rows
    .map((row) => String(row[2] || "").trim())
    .filter(Boolean);

  return [...new Set(categories)];
}

module.exports = { getActiveCategories };
