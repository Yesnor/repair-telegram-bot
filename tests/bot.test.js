process.env.BOT_TOKEN = "test-token";

jest.mock("../src/sessionStore", () => ({
  sessionStore: { get: jest.fn(), set: jest.fn(), delete: jest.fn() },
}));
jest.mock("../src/dateUtils", () => ({
  formatTimestamp: jest.fn(() => "2024-03-10_12:00:00"),
}));
jest.mock("../src/sheetsClient", () => ({
  getRows: jest.fn(),
  appendRow: jest.fn(),
  updateRow: jest.fn(),
}));

const mockFindRequestById = jest.fn();
const mockSaveRequest = jest.fn();
jest.mock("../src/requests", () => {
  const actual = jest.requireActual("../src/requests");
  return {
    ...actual,
    findRequestById: mockFindRequestById,
    saveRequest: mockSaveRequest,
  };
});

const mockGetEmployeeByTelegramId = jest.fn();
const mockGetActiveEmployeesByCategory = jest.fn();
jest.mock("../src/employees", () => ({
  getEmployeeByTelegramId: mockGetEmployeeByTelegramId,
  getActiveEmployeesByCategory: mockGetActiveEmployeesByCategory,
}));

const { bot, categoryKeyboard, configureBotMenu, BOT_COMMANDS } = require("../src/bot");
const { COLUMNS, STATUS } = require("../src/requests");
const { sessionStore } = require("../src/sessionStore");
const sheetsClient = require("../src/sheetsClient");
const Telegram = require("../node_modules/telegraf/lib/telegram").default;

const telegramCallApiSpy = jest.spyOn(Telegram.prototype, "callApi");

test("показывает каждую категорию отдельной строкой без обрезания текста", () => {
  const rows = categoryKeyboard().reply_markup.inline_keyboard;

  expect(rows).toHaveLength(11);
  expect(rows.every((row) => row.length === 1)).toBe(true);
  expect(rows.map(([button]) => button.text)).toContain("Холодильное оборудование");
});

test("registers start command in the bot menu", async () => {
  await configureBotMenu();

  expect(BOT_COMMANDS).toEqual([{ command: "start", description: "Старт" }]);
  expect(telegramCallApiSpy).toHaveBeenCalledWith("setMyCommands", {
    commands: BOT_COMMANDS,
  });
});

const employee = { telegramId: "42", name: "Анна", category: "Электрика" };
const request = () => ({
  id: "R1",
  clientId: "100",
  category: "Электрика",
  address: "ул. Ленина, 1",
  description: "Не работает розетка",
  phone: "+380000000000",
  status: STATUS.NEW,
  employeeId: "",
  employeeName: "",
  notifiedMessages: "[]",
});

function callback(data, fromId = 42) {
  return {
    update_id: Date.now(),
    callback_query: {
      id: "callback-1",
      from: { id: fromId, first_name: "Анна" },
      message: { message_id: 7, chat: { id: fromId }, text: "Заявка R1" },
      data,
    },
  };
}

function message(text, fromId = 100) {
  return {
    update_id: Date.now(),
    message: {
      message_id: Date.now(),
      from: { id: fromId, first_name: "Иван" },
      chat: { id: fromId, type: "private" },
      date: 1710000000,
      text,
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  const sessions = new Map();
  sessionStore.get.mockImplementation(async (key) => sessions.get(key));
  sessionStore.set.mockImplementation(async (key, value) => {
    sessions.set(key, value);
  });
  sessionStore.delete.mockImplementation(async (key) => {
    sessions.delete(key);
  });
  telegramCallApiSpy.mockImplementation(async (method) =>
    method === "sendMessage" ? { message_id: 99 } : {},
  );
  mockGetEmployeeByTelegramId.mockResolvedValue(employee);
  mockGetActiveEmployeesByCategory.mockResolvedValue([]);
});

test("клиент указывает город перед адресом, и город добавляется к адресу заявки", async () => {
  const category = categoryKeyboard().reply_markup.inline_keyboard[0][0].text;

  await bot.handleUpdate(callback("new_request", 100));
  await bot.handleUpdate(callback(`cat:${category}`, 100));
  await bot.handleUpdate(message("ООО Ромашка", 100));
  await bot.handleUpdate(message("Не работает розетка", 100));
  await bot.handleUpdate(message("Киев", 100));
  await bot.handleUpdate(message("ул. Ленина, 1", 100));
  await bot.handleUpdate(message("Завтра после 12:00", 100));
  await bot.handleUpdate(message("+380000000000", 100));

  const savedRow = sheetsClient.appendRow.mock.calls[0][1];
  expect(savedRow[COLUMNS.indexOf("client")]).toBe("ООО Ромашка");
  expect(savedRow[COLUMNS.indexOf("address")]).toBe("Киев, ул. Ленина, 1");
  expect(
    telegramCallApiSpy.mock.calls.some(
      ([method, payload]) =>
        method === "sendMessage" && payload.text === "Укажите свой город",
    ),
  ).toBe(true);
  expect(
    telegramCallApiSpy.mock.calls.some(
      ([method, payload]) =>
        method === "sendMessage" &&
        payload.text === "Назовите имя заказчика согласно договору",
    ),
  ).toBe(true);
});

test("первый сотрудник берёт новую заявку, а повторное взятие отклоняется", async () => {
  const found = { rowNumber: 2, data: request() };
  mockFindRequestById.mockResolvedValue(found);

  await bot.handleUpdate(callback("take:R1"));
  expect(found.data).toMatchObject({
    status: STATUS.TAKEN,
    employeeId: "42",
    employeeName: "Анна",
    takenAt: "2024-03-10_12:00:00",
  });
  expect(mockSaveRequest).toHaveBeenCalledWith(2, found.data);

  found.data.status = STATUS.TAKEN;
  await bot.handleUpdate(callback("take:R1", 43));
  expect(mockSaveRequest).toHaveBeenCalledTimes(1);
});

test("сотрудник проходит статусы выезда и закрытия", async () => {
  const found = { rowNumber: 2, data: { ...request(), status: STATUS.TAKEN, employeeId: "42" } };
  mockFindRequestById.mockResolvedValue(found);

  await bot.handleUpdate(callback("depart:R1"));
  expect(found.data.status).toBe(STATUS.DEPARTED);
  expect(found.data.departedAt).toBe("2024-03-10_12:00:00");
  await bot.handleUpdate(callback("close:R1"));
  expect(found.data.status).toBe(STATUS.CLOSED);
  expect(found.data.closedAt).toBe("2024-03-10_12:00:00");
  expect(mockSaveRequest).toHaveBeenCalledTimes(2);
});

test("отказ возвращает заявку в общий пул и очищает сотрудника", async () => {
  const found = { rowNumber: 2, data: { ...request(), status: STATUS.TAKEN, employeeId: "42", employeeName: "Анна", takenAt: "date" } };
  mockFindRequestById.mockResolvedValue(found);

  await bot.handleUpdate(callback("decline:R1"));
  expect(found.data).toMatchObject({ status: STATUS.NEW, employeeId: "", employeeName: "", takenAt: "" });
  expect(mockSaveRequest).toHaveBeenCalledWith(2, found.data);
});
