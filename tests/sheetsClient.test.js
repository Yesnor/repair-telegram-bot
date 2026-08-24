jest.mock("googleapis", () => ({
  google: {
    auth: { JWT: jest.fn(() => ({ authorize: jest.fn() })) },
    sheets: jest.fn(),
  },
}));

const { google } = require("googleapis");
const { colLetter, getRows, appendRow, updateRow } = require("../src/sheetsClient");

const originalEnv = {
  GOOGLE_SERVICE_ACCOUNT_EMAIL: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  GOOGLE_PRIVATE_KEY: process.env.GOOGLE_PRIVATE_KEY,
  GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS,
};

beforeEach(() => {
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = "service-account@example.com";
  process.env.GOOGLE_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----";
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
});

afterAll(() => {
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = originalEnv.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  process.env.GOOGLE_PRIVATE_KEY = originalEnv.GOOGLE_PRIVATE_KEY;
  process.env.GOOGLE_APPLICATION_CREDENTIALS = originalEnv.GOOGLE_APPLICATION_CREDENTIALS;
});

test.each([[1, "A"], [26, "Z"], [27, "AA"], [52, "AZ"], [53, "BA"]])(
  "преобразует номер столбца %i в %s",
  (number, expected) => expect(colLetter(number)).toBe(expected),
);

test("использует правильные диапазоны Google Sheets для чтения и записи", async () => {
  const values = { get: jest.fn().mockResolvedValue({ data: { values: [["R1"]] } }), append: jest.fn().mockResolvedValue({}), update: jest.fn().mockResolvedValue({}) };
  google.sheets.mockReturnValue({ spreadsheets: { values } });

  await expect(getRows("Заявки")).resolves.toEqual([["R1"]]);
  await appendRow("Заявки", ["R2"]);
  await updateRow("Заявки", 4, ["R3", "value"]);

  expect(values.get).toHaveBeenCalledWith(expect.objectContaining({ range: "Заявки!A2:Z" }));
  expect(values.append).toHaveBeenCalledWith(expect.objectContaining({ range: "Заявки!A1" }));
  expect(values.update).toHaveBeenCalledWith(expect.objectContaining({ range: "Заявки!A4:B4" }));
});
