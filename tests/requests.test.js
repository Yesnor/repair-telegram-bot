jest.mock("../src/sheetsClient", () => ({
  getRows: jest.fn(),
  appendRow: jest.fn(),
  updateRow: jest.fn(),
}));

const sheets = require("../src/sheetsClient");
const {
  STATUS,
  COLUMNS,
  createRequest,
  findRequestById,
  saveRequest,
  getNewRequestsByCategory,
  getActiveRequestsByEmployee,
} = require("../src/requests");

const row = (overrides = {}) => {
  const data = {
    id: "R1",
    category: "Электрика",
    status: STATUS.NEW,
    employeeId: "",
    address: "ул. Ленина, 1",
    ...overrides,
  };
  return COLUMNS.map((key) => data[key] || "");
};

beforeEach(() => jest.clearAllMocks());

test("создаёт заявку с новым ID и статусом NEW", async () => {
  const request = await createRequest({
    clientId: 10,
    clientName: "Иван",
    phone: "+380000000000",
    category: "Электрика",
    description: "Не работает розетка",
    address: "ул. Ленина, 1",
    convenientTime: "После 18:00",
  });

  expect(request).toMatchObject({
    clientId: 10,
    category: "Электрика",
    status: STATUS.NEW,
    notifiedMessages: "[]",
  });
  expect(request.id).toMatch(/^R\d+$/);
  expect(sheets.appendRow).toHaveBeenCalledWith("Заявки", expect.any(Array));
});

test("находит заявку и возвращает номер строки Google Sheets", async () => {
  sheets.getRows.mockResolvedValue([row({ id: "R1" }), row({ id: "R2" })]);

  await expect(findRequestById("R2")).resolves.toEqual({
    rowNumber: 3,
    data: expect.objectContaining({ id: "R2", category: "Электрика" }),
  });
});

test("фильтрует новые заявки по категории и активные заявки сотрудника", async () => {
  sheets.getRows.mockResolvedValue([
    row({ id: "new-electric", category: "Электрика" }),
    row({ id: "new-plumbing", category: "Сантехника" }),
    row({ id: "taken", status: STATUS.TAKEN, employeeId: "42" }),
    row({ id: "departed", status: STATUS.DEPARTED, employeeId: "42" }),
    row({ id: "closed", status: STATUS.CLOSED, employeeId: "42" }),
  ]);

  await expect(getNewRequestsByCategory("Электрика")).resolves.toHaveLength(1);
  await expect(getActiveRequestsByEmployee(42)).resolves.toEqual([
    expect.objectContaining({ data: expect.objectContaining({ id: "taken" }) }),
    expect.objectContaining({ data: expect.objectContaining({ id: "departed" }) }),
  ]);
});

test("сохраняет заявку в исходном формате строки", async () => {
  const data = { id: "R1", category: "Электрика", status: STATUS.TAKEN };
  await saveRequest(7, data);
  expect(sheets.updateRow).toHaveBeenCalledWith("Заявки", 7, expect.any(Array));
});
