const { formatTimestamp } = require("./dateUtils");
const { getRows, appendRow, updateRow, updateCell } = require("./sheetsClient");
const { incrementRequestCount } = require("./database");
const { t } = require("./i18n");

const SHEET = "Заявки";
const PAYMENTS_SHEET = "Оплата та розрахунки";

const STATUS = {
  NEW: t("status.new"),
  TAKEN: t("status.taken"),
  DEPARTED: t("status.departed"),
  CLOSED: t("status.closed"),
};

// Порядок колонок листа "Заявки" — должен совпадать с заголовком в таблице.
const COLUMNS = [
  "id",
  "createdAt",
  "clientId",
  "clientName",
  "client",
  "phone",
  "category",
  "description",
  "city",
  "address",
  "convenientTime",
  "status",
  "employeeId",
  "employeeName",
  "takenAt",
  "departedAt",
  "closedAt",
  "photosLink",
  "notifiedMessages",
  "workDescriptionEntered",
];

function rowToObject(row) {
  const obj = {};
  COLUMNS.forEach((key, i) => {
    obj[key] = row[i] !== undefined ? row[i] : "";
  });
  return obj;
}

function objectToRow(obj) {
  return COLUMNS.map((key) => obj[key]);
}

async function generateId(category, date = new Date()) {
  const { code, count } = await incrementRequestCount(category);
  const datePart = [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("");

  return `${code}${datePart}_${count}`;
}

async function createRequest(data) {
  const obj = {
    id: await generateId(data.category),
    createdAt: formatTimestamp(),
    clientId: data.clientId,
    clientName: data.clientName || "",
    client: data.client || "",
    phone: data.phone || "",
    category: data.category,
    description: data.description,
    city: data.city || "",
    address: data.address,
    convenientTime: data.convenientTime,
    status: STATUS.NEW,
    employeeId: "",
    employeeName: "",
    takenAt: "",
    departedAt: "",
    closedAt: "",
    notifiedMessages: "[]",
    photosLink: "",
    workDescriptionEntered: "",
  };
  await appendRow(SHEET, objectToRow(obj), { clearFormat: true });
  await appendRow(PAYMENTS_SHEET, [obj.id]);
  return obj;
}

/**
 * Находит заявку по ID. Возвращает { rowNumber, data } либо null.
 * rowNumber — номер строки в самом листе (для последующего updateRow).
 */
async function findRequestById(id) {
  const rows = await getRows(SHEET);
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][0] === id) {
      return { rowNumber: i + 2, data: rowToObject(rows[i]) };
    }
  }
  return null;
}

async function saveRequest(rowNumber, obj) {
  await updateRow(SHEET, rowNumber, objectToRow(obj));
}

async function getMaterialCost(requestId) {
  const rows = (await getRows(PAYMENTS_SHEET)) || [];
  const row = rows.find((item) => String(item[0]) === String(requestId));
  return row ? row[9] || "" : "";
}

async function saveMaterialCost(requestId, amount) {
  const rows = (await getRows(PAYMENTS_SHEET)) || [];
  const index = rows.findIndex((item) => String(item[0]) === String(requestId));
  if (index === -1) throw new Error(`Payment row not found for request ${requestId}`);
  const numericAmount = Number(String(amount).trim().replace(",", "."));
  if (!Number.isFinite(numericAmount)) {
    throw new Error("Material cost must be a number");
  }
  await updateCell(PAYMENTS_SHEET, index + 2, 10, numericAmount);
}

// Возвращает { rowNumber, data } для всех новых (ещё не взятых) заявок категории.
async function getNewRequestsByCategory(category, city) {
  const rows = await getRows(SHEET);
  const categories = (Array.isArray(category) ? category : [category])
    .flatMap((value) => String(value || '').split(';'))
    .map((value) => String(value).trim().toLowerCase())
    .filter(Boolean);
  const cities = (Array.isArray(city) ? city : [city])
    .flatMap((value) => String(value || '').split(';'))
    .map((value) => String(value).trim().toLowerCase())
    .filter(Boolean);
  const result = [];
  rows.forEach((row, i) => {
    const data = rowToObject(row);
    if (
      (categories.includes('*') || categories.includes(String(data.category || '').trim().toLowerCase())) &&
      (cities.includes('*') || cities.includes(String(data.city || '').trim().toLowerCase())) &&
      data.status === STATUS.NEW
    ) {
      result.push({ rowNumber: i + 2, data });
    }
  });
  return result;
}

// Возвращает { rowNumber, data } для заявок, взятых сотрудником и ещё не закрытых.
async function getActiveRequestsByEmployee(employeeId) {
  const rows = await getRows(SHEET);
  const result = [];
  rows.forEach((row, i) => {
    const data = rowToObject(row);
    if (
      String(data.employeeId) === String(employeeId) &&
      (data.status === STATUS.TAKEN || data.status === STATUS.DEPARTED)
    ) {
      result.push({ rowNumber: i + 2, data });
    }
  });
  return result;
}

module.exports = {
  STATUS,
  COLUMNS,
  createRequest,
  findRequestById,
  saveRequest,
  getMaterialCost,
  saveMaterialCost,
  generateId,
  getNewRequestsByCategory,
  getActiveRequestsByEmployee,
};
