jest.mock("../src/sheetsClient", () => ({ getRows: jest.fn() }));

const { getRows } = require("../src/sheetsClient");
const { getActiveCategories } = require("../src/database");

beforeEach(() => jest.clearAllMocks());

test("берет уникальные категории из колонки Database и игнорирует пустые строки", async () => {
  getRows.mockResolvedValue([
    ["Киев", "да", " Электрика ", "electricity"],
    ["Киев", "да", "Сантехника", "plumbing"],
    ["Львов", "нет", "Электрика", "electricity"],
    ["", "", "", ""],
  ]);

  await expect(getActiveCategories()).resolves.toEqual([
    "Электрика",
    "Сантехника",
  ]);
  expect(getRows).toHaveBeenCalledWith("Database");
});
