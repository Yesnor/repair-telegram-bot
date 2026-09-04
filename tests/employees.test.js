jest.mock("../src/sheetsClient", () => ({ getSheetData: jest.fn() }));

const { getSheetData } = require("../src/sheetsClient");
const { getEmployeeByTelegramId, getActiveEmployeesByCategory } = require("../src/employees");

const headers = ["Telegram ID", "Telegram name", "Ім'я", "Категорії", "Міста", "Активний (так/ні)"];

beforeEach(() => jest.clearAllMocks());

test("возвращает сотрудника со списками категорий и городов", async () => {
  getSheetData.mockResolvedValue({ headers, rows: [
    ["42", "tg-name", "Анна", " Электрика; Сантехника ", " Киев; Львов ", " ДА "],
  ] });

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
  expect(getSheetData).toHaveBeenCalledWith("Співробітники");
});

test("возвращает только активных сотрудников с совпадающими категорией и городом", async () => {
  getSheetData.mockResolvedValue({ headers, rows: [
    ["1", "tg-1", "Анна", "Электрика; Сантехника", "Киев; Львов", "да"],
    ["2", "tg-2", "Борис", "*", "*", "да"],
    ["3", "tg-3", "Вера", "Сантехника", "Киев", "нет"],
    ["4", "tg-4", "Олег", "Электрика", "Одесса", "да"],
  ] });

  await expect(getActiveEmployeesByCategory("Сантехника", "Львов")).resolves.toEqual([
    { telegramId: "1", name: "Анна", category: "Электрика; Сантехника", city: "Киев; Львов" },
    { telegramId: "2", name: "Борис", category: "*", city: "*" },
  ]);
});

test("распознает украинское значение активного сотрудника Так", async () => {
  getSheetData.mockResolvedValue({ headers, rows: [
    ["'42.0", "tg-name", "Анна", "Електрика", "Київ", "Так"],
  ] });

  await expect(getEmployeeByTelegramId(42)).resolves.toEqual(
    expect.objectContaining({ telegramId: "'42.0", active: true }),
  );
});

test("читает Так именно из колонки Активний (так/ні)", async () => {
  const shiftedHeaders = [...headers.slice(0, 5), "Дополнительное поле", headers[5]];
  getSheetData.mockResolvedValue({ headers: shiftedHeaders, rows: [
    ["42", "tg-name", "Анна", "Електрика", "Київ", "Так", "Ні"],
    ["43", "tg-name", "Борис", "Електрика", "Київ", "Ні", "Так"],
  ] });

  await expect(getEmployeeByTelegramId(43)).resolves.toEqual(
    expect.objectContaining({ telegramId: "43", active: true }),
  );
});
