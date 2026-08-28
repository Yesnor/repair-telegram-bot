jest.mock("../src/sheetsClient", () => ({ getRows: jest.fn(), updateCell: jest.fn() }));

const { getRows, updateCell } = require("../src/sheetsClient");
const { getActiveCategories, incrementRequestCount } = require("../src/database");

beforeEach(() => {
  jest.clearAllMocks();
  updateCell.mockResolvedValue(undefined);
});

test("берет уникальные категории из колонки Database и игнорирует пустые строки", async () => {
  getRows.mockResolvedValue([
    ["Киев", " Электрика ", "electricity", "1"],
    ["Киев", "Сантехника", "plumbing", "2"],
    ["Львов", "Электрика", "electricity", "3"],
    ["", "", "", ""],
  ]);

  await expect(getActiveCategories()).resolves.toEqual([
    "Электрика",
    "Сантехника",
  ]);
  expect(getRows).toHaveBeenCalledWith("Database");
});

test("увеличивает общий счетчик заявок и возвращает код категории", async () => {
  getRows.mockResolvedValue([
    ["Киев", "Мебель", "МР", "1"],
    ["Львов", "Электрика", "ЭЛ", ""],
  ]);

  await expect(incrementRequestCount("Мебель")).resolves.toEqual({
    code: "МР",
    count: 2,
  });
  expect(updateCell).toHaveBeenCalledWith("Database", 2, 4, 2);
});
