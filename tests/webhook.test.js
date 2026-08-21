jest.mock("../src/bot", () => ({ bot: { handleUpdate: jest.fn() } }));

const { bot } = require("../src/bot");
const webhook = require("../api/webhook");

const response = () => ({
  headersSent: false,
  status: jest.fn().mockReturnThis(),
  send: jest.fn(),
});

beforeEach(() => {
  process.env.WEBHOOK_SECRET = "secret";
  jest.clearAllMocks();
});

test("отвечает 401 при неверном секрете", async () => {
  const res = response();
  await webhook({ method: "POST", query: { secret: "wrong" }, body: {} }, res);
  expect(res.status).toHaveBeenCalledWith(401);
  expect(bot.handleUpdate).not.toHaveBeenCalled();
});

test("передаёт корректный update боту и отвечает OK", async () => {
  const res = response();
  const body = { update_id: 1 };
  await webhook({ method: "POST", query: { secret: "secret" }, body }, res);
  expect(bot.handleUpdate).toHaveBeenCalledWith(body);
  expect(res.status).toHaveBeenCalledWith(200);
  expect(res.send).toHaveBeenCalledWith("OK");
});

test("проверяет endpoint без POST без обращения к боту", async () => {
  const res = response();
  await webhook({ method: "GET", query: {} }, res);
  expect(res.status).toHaveBeenCalledWith(200);
  expect(res.send).toHaveBeenCalledWith("Repair bot webhook is up");
});
