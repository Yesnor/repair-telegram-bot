jest.mock("../src/sheetsClient", () => ({ getRows: jest.fn() }));

const { getRows } = require("../src/sheetsClient");
const { getEmployeeByTelegramId, getActiveEmployeesByCategory } = require("../src/employees");

beforeEach(() => jest.clearAllMocks());

test("возвращает сотрудника со списками категорий и городов", async () => {
  getRows.mockResolvedValue([
    ["42", "tg-name", "Анна", " Электрика; Сантехника ", " Киев; Львов ", " ДА "],
  ]);

  await expect(getEmployeeByTelegramId(42)).resolves.toEqual({
    telegramId: "42",
    telegramName: "tg-name",
    name: "Анна",
    category: " Электрика; Сантехника ",
    categories: ["электрика", "сантехника"],
    active: true,
    city: " Киев; Львов ",
    cities: ["киев", "львов"],
  });
  expect(getRows).toHaveBeenCalledWith("Співробітники");
});

test("возвращает только активных сотрудников с совпадающими категорией и городом", async () => {
  getRows.mockResolvedValue([
    ["1", "tg-1", "Анна", "Электрика; Сантехника", "Киев; Львов", "да"],
    ["2", "tg-2", "Борис", "*", "*", "да"],
    ["3", "tg-3", "Вера", "Сантехника", "Киев", "нет"],
    ["4", "tg-4", "Олег", "Электрика", "Одесса", "да"],
  ]);

  await expect(getActiveEmployeesByCategory("Сантехника", "Львов")).resolves.toEqual([
    { telegramId: "1", name: "Анна", category: "Электрика; Сантехника", city: "Киев; Львов" },
    { telegramId: "2", name: "Борис", category: "*", city: "*" },
  ]);
});

test("распознает украинское значение активного сотрудника Так", async () => {
  getRows.mockResolvedValue([
    ["42", "tg-name", "Анна", "Електрика", "Київ", "Так"],
  ]);

  await expect(getEmployeeByTelegramId(42)).resolves.toEqual(
    expect.objectContaining({ telegramId: "42", active: true }),
  );
});
