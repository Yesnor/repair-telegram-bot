jest.mock("../src/sheetsClient", () => ({
  getRows: jest.fn(),
  appendRow: jest.fn(),
  updateRow: jest.fn(),
}));
jest.mock("../src/dateUtils", () => ({
  formatTimestamp: jest.fn(() => "2024-03-10_12:00:00"),
}));

const sheetsClient = require("../src/sheetsClient");
const { sessionStore } = require("../src/sessionStore");

beforeEach(() => {
  jest.clearAllMocks();
});

test("writes UpdatedAt with the shared timestamp formatter when creating a session row", async () => {
  sheetsClient.getRows.mockResolvedValue([]);

  await sessionStore.set("chat-1", { step: 2 });

  expect(sheetsClient.appendRow).toHaveBeenCalledWith("Sessions", [
    "chat-1",
    JSON.stringify({ step: 2 }),
    "2024-03-10_12:00:00",
  ]);
});

test("writes UpdatedAt with the shared timestamp formatter when clearing a session row", async () => {
  sheetsClient.getRows.mockResolvedValue([["chat-1", JSON.stringify({ step: 2 }), "old"]]);

  await sessionStore.delete("chat-1");

  expect(sheetsClient.updateRow).toHaveBeenCalledWith("Sessions", 2, [
    "chat-1",
    "",
    "2024-03-10_12:00:00",
  ]);
});
