jest.mock("../src/sheetsClient", () => ({ getRows: jest.fn() }));

const { getRows } = require("../src/sheetsClient");
const { getActiveCities } = require("../src/cities");

beforeEach(() => jest.clearAllMocks());

test("возвращает города с непустым названием и убирает пробелы вокруг названия", async () => {
  getRows.mockResolvedValue([
    [" Киев ", "Электрика", "ЭЛ", "1"],
    ["Львов", "Сантехника", "СМ", "2"],
    ["", "Мебель", "МР", "3"],
  ]);

  await expect(getActiveCities()).resolves.toEqual(["Киев", "Львов"]);
  expect(getRows).toHaveBeenCalledWith("Database");
});
