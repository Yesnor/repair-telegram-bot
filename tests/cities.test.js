jest.mock("../src/sheetsClient", () => ({ getRows: jest.fn() }));

const { getRows } = require("../src/sheetsClient");
const { getActiveCities } = require("../src/cities");

beforeEach(() => jest.clearAllMocks());

test("возвращает только активные города и убирает пробелы вокруг названия", async () => {
  getRows.mockResolvedValue([
    [" Киев ", " да "],
    ["Львов", "нет"],
    ["", "да"],
  ]);

  await expect(getActiveCities()).resolves.toEqual(["Киев"]);
  expect(getRows).toHaveBeenCalledWith("Database");
});
