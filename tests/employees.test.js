jest.mock("../src/sheetsClient", () => ({ getRows: jest.fn() }));

const { getRows } = require("../src/sheetsClient");
const { getEmployeeByTelegramId, getActiveEmployeesByCategory } = require("../src/employees");

beforeEach(() => jest.clearAllMocks());

test("возвращает сотрудника и нормализует признак активности", async () => {
  getRows.mockResolvedValue([["42", "Анна", "Электрика", " ДА "]]);
  await expect(getEmployeeByTelegramId(42)).resolves.toEqual({
    telegramId: "42",
    name: "Анна",
    category: "Электрика",
    active: true,
  });
});

test("возвращает только активных сотрудников нужной категории", async () => {
  getRows.mockResolvedValue([
    ["1", "Анна", "Электрика", "да"],
    ["2", "Борис", "Электрика", "нет"],
    ["3", "Вера", "Сантехника", "да"],
  ]);
  await expect(getActiveEmployeesByCategory("Электрика")).resolves.toEqual([
    { telegramId: "1", name: "Анна", category: "Электрика" },
  ]);
});
