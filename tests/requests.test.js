jest.mock("../src/sheetsClient");
jest.mock("../src/database", () => ({
  incrementCategoryRequestCount: jest.fn(),
}));
const sheetsClient = require("../src/sheetsClient");
const { incrementCategoryRequestCount } = require("../src/database");
const {
  createRequest,
  findRequestById,
  saveRequest,
  STATUS,
  COLUMNS,
} = require("../src/requests");

describe("createRequest", () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date("2024-03-10T12:00:00.000Z"));
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("builds a new request with status NEW and appends it as a row", async () => {
    sheetsClient.appendRow.mockResolvedValue(undefined);
    incrementCategoryRequestCount.mockResolvedValue({ code: "EL", count: 1 });

    const result = await createRequest({
      clientId: 555,
      clientName: "Иван Иванов",
      client: "ООО Ромашка",
      phone: "+79990000000",
      category: "Электрика",
      description: "Не работает розетка",
      address: "ул. Ленина, 1",
      convenientTime: "Завтра утром",
    });

    expect(result.id).toBe("EL20240310_1");
    expect(result.createdAt).toBe("2024-03-10_12:00:00");
    expect(result.status).toBe(STATUS.NEW);
    expect(result.employeeId).toBe("");
    expect(result.client).toBe("ООО Ромашка");
    expect(result.notifiedMessages).toBe("[]");

    expect(sheetsClient.appendRow).toHaveBeenCalledTimes(2);
    expect(sheetsClient.appendRow).toHaveBeenNthCalledWith(
      1,
      "Заявки",
      COLUMNS.map((key) => result[key]),
      { clearFormat: true },
    );
    expect(sheetsClient.appendRow).toHaveBeenNthCalledWith(
      2,
      "Оплата та розрахунки",
      [result.id],
    );
  });

  it("falls back to empty strings for optional client fields", async () => {
    sheetsClient.appendRow.mockResolvedValue(undefined);
    incrementCategoryRequestCount.mockResolvedValue({ code: "DR", count: 2 });
    const result = await createRequest({
      clientId: 1,
      category: "Другое",
      description: "desc",
      address: "addr",
      convenientTime: "time",
    });
    expect(result.clientName).toBe("");
    expect(result.client).toBe("");
    expect(result.phone).toBe("");
  });
});

describe("findRequestById", () => {
  const sampleRows = [
    [
      "R1",
      "2024-01-01_00:00:00",
      "111",
      "Иван",
      "ООО Ромашка",
      "+7900",
      "Электрика",
      "desc1",
      "Киев",
      "addr1",
      "time1",
      STATUS.NEW,
      "",
      "",
      "",
      "",
      "",
      "[]",
    ],
    [
      "R2",
      "2024-01-02_00:00:00",
      "222",
      "Пётр",
      "ООО Строй",
      "+7901",
      "Сантехника",
      "desc2",
      "Львов",
      "addr2",
      "time2",
      STATUS.TAKEN,
      "333",
      "Мастер",
      "t",
      "",
      "",
      "[]",
    ],
  ];

  it("finds a request by id and returns its 1-based sheet row number", async () => {
    sheetsClient.getRows.mockResolvedValue(sampleRows);
    const found = await findRequestById("R2");
    expect(found).not.toBeNull();
    expect(found.rowNumber).toBe(3); // index 1 -> row 1+2
    expect(found.data.id).toBe("R2");
    expect(found.data.status).toBe(STATUS.TAKEN);
    expect(found.data.employeeId).toBe("333");
  });

  it("returns null when no request matches the id", async () => {
    sheetsClient.getRows.mockResolvedValue(sampleRows);
    const found = await findRequestById("R999");
    expect(found).toBeNull();
  });
});

describe("saveRequest", () => {
  it("writes the object back as a row in COLUMNS order", async () => {
    sheetsClient.updateRow.mockResolvedValue(undefined);
    const obj = {
      id: "R1",
      createdAt: "c",
      clientId: 1,
      clientName: "n",
      phone: "p",
      category: "Электрика",
      description: "d",
      address: "a",
      convenientTime: "t",
      status: STATUS.CLOSED,
      employeeId: "9",
      employeeName: "e",
      takenAt: "ta",
      departedAt: "da",
      closedAt: "ca",
      notifiedMessages: "[]",
    };
    await saveRequest(7, obj);
    expect(sheetsClient.updateRow).toHaveBeenCalledWith(
      "Заявки",
      7,
      COLUMNS.map((k) => obj[k]),
    );
  });
});
