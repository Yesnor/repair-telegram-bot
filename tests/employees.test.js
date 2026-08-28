jest.mock("../src/sheetsClient", () => ({ getRows: jest.fn() }));

const { getRows } = require("../src/sheetsClient");
const { getEmployeeByTelegramId, getActiveEmployeesByCategory } = require("../src/employees");

beforeEach(() => jest.clearAllMocks());

test("возвращает сотрудника и нормализует признак активности", async () => {
  getRows.mockResolvedValue([["42", "tg-name", "Анна", "Электрика", " ДА ", "Киев"]]);
  await expect(getEmployeeByTelegramId(42)).resolves.toEqual({
    telegramId: "42",
    telegramName: "tg-name",
    name: "Анна",
    category: "Электрика",
    active: true,
    city: "Киев",
    cities: ["Киев"],
  });
});

test("возвращает только активных сотрудников нужной категории и города", async () => {
  getRows.mockResolvedValue([
    ["1", "tg-1", "Анна", "Электрика", "да", "Киев"],
    ["2", "tg-2", "Борис", "Электрика", "нет", "Киев"],
    ["3", "tg-3", "Вера", "Сантехника", "да", "Киев"],
    ["4", "tg-4", "Олег", "Электрика", "да", "Львов"],
  ]);
  await expect(getActiveEmployeesByCategory("Электрика", "Киев")).resolves.toEqual([
    { telegramId: "1", name: "Анна", category: "Электрика", city: "Киев" },
  ]);
});
