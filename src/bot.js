const { Telegraf, Scenes, session, Markup } = require("telegraf");
const { sessionStore } = require("./sessionStore");
const { formatTimestamp } = require("./dateUtils");
const { createRequestFolder, uploadFileToDrive } = require("./driveClient");
const {
  createRequest,
  findRequestById,
  saveRequest,
  getActiveRequestsByEmployee,
  getNewRequestsByCategory,
  STATUS,
} = require("./requests");
const {
  getEmployeeByTelegramId,
  getActiveEmployeesByCategory,
} = require("./employees");

const CATEGORIES = [
  "Электрика",
  "Сантехника",
  "Мебель",
  "Металлоконструкции",
  "Отделка",
  "Реклама",
  "Отопление",
  "Генератор",
  "Холодильное оборудование",
  "Отопление",
  "Другое",
];

const BOT_COMMANDS = [{ command: "start", description: "Старт" }];

function categoryKeyboard() {
  return Markup.inlineKeyboard(
    CATEGORIES.map((category) => [
      Markup.button.callback(category, `cat:${category}`),
    ]),
  );
}

// ---------------------------------------------------------------------------
// Сцена (FSM) оформления заявки клиентом
// ---------------------------------------------------------------------------

const requestWizard = new Scenes.WizardScene(
  "new-request",

  // Шаг 1: выбор категории
  async (ctx) => {
    await ctx.reply("Выберите категорию услуги:", categoryKeyboard());
    return ctx.wizard.next();
  },

  // Шаг 2: категория выбрана -> просим имя заказчика
  async (ctx) => {
    if (!ctx.callbackQuery || !ctx.callbackQuery.data?.startsWith("cat:")) {
      await ctx.reply(
        "Пожалуйста, выберите категорию, нажав на одну из кнопок выше.",
      );
      return;
    }
    const category = ctx.callbackQuery.data.replace("cat:", "");
    ctx.wizard.state.data = { category };
    await ctx.answerCbQuery();
    await ctx.reply("Назовите имя заказчика согласно договору");
    return ctx.wizard.next();
  },

  // Шаг 3: имя заказчика -> просим описание
  async (ctx) => {
    if (!ctx.message?.text) {
      await ctx.reply("Пожалуйста, укажите имя заказчика.");
      return;
    }
    ctx.wizard.state.data.client = ctx.message.text;
    await ctx.reply("Опишите проблему коротко:");
    return ctx.wizard.next();
  },

  // Шаг 4: описание -> просим город
  async (ctx) => {
    if (!ctx.message?.text) {
      await ctx.reply("Пожалуйста, опишите проблему.");
      return;
    }
    ctx.wizard.state.data.description = ctx.message.text;
    await ctx.reply("Укажите свой город");
    return ctx.wizard.next();
  },

  // Шаг 5: город -> просим адрес
  async (ctx) => {
    if (!ctx.message?.text) {
      await ctx.reply("Пожалуйста, укажите свой город.");
      return;
    }
    ctx.wizard.state.data.city = ctx.message.text;
    await ctx.reply("Укажите адрес, куда нужно приехать мастеру:");
    return ctx.wizard.next();
  },

  // Шаг 6: адрес -> просим срок исполнения
  async (ctx) => {
    if (!ctx.message?.text) {
      await ctx.reply("Пожалуйста, укажите адрес.");
      return;
    }
    ctx.wizard.state.data.address = ctx.message.text;
    await ctx.reply("Укажите крайний срок выполнения работ");
    return ctx.wizard.next();
  },

  // Шаг 7: срок исполнения -> просим телефон
  async (ctx) => {
    if (!ctx.message?.text) {
      await ctx.reply("Пожалуйста, укажите удобное время.");
      return;
    }
    ctx.wizard.state.data.convenientTime = ctx.message.text;
    await ctx.reply(
      "Укажите контактный телефон (можно отправить кнопкой ниже):",
      Markup.keyboard([Markup.button.contactRequest("📱 Отправить мой номер")])
        .oneTime()
        .resize(),
    );
    return ctx.wizard.next();
  },

  // Шаг 7: телефон -> сохраняем заявку и уведомляем сотрудников
  async (ctx) => {
    const phone = ctx.message?.contact?.phone_number || ctx.message?.text;
    if (!phone) {
      await ctx.reply(
        'Пожалуйста, укажите телефон текстом или кнопкой "Отправить мой номер".',
      );
      return;
    }

    const data = ctx.wizard.state.data;
    const clientName = [ctx.from.first_name, ctx.from.last_name]
      .filter(Boolean)
      .join(" ");

    const request = await createRequest({
      clientId: ctx.from.id,
      clientName,
      client: data.client,
      phone,
      category: data.category,
      description: data.description,
      address: `${data.city}, ${data.address}`,
      convenientTime: data.convenientTime,
    });

    await ctx.reply(
      `Заявка №${request.id} принята!\n` +
        `Категория: ${request.category}\n` +
        `Адрес: ${request.address}\n\n` +
        `Мы сообщим вам, как только мастер возьмёт заявку в работу.`,
      Markup.removeKeyboard(),
    );

    await notifyEmployees(ctx, request);

    return ctx.scene.leave();
  },
);

const stage = new Scenes.Stage([requestWizard]);

// ---------------------------------------------------------------------------
// Рассылка уведомлений сотрудникам категории (при создании заявки и при отказе)
// ---------------------------------------------------------------------------

async function notifyEmployees(ctx, requestData, excludeEmployeeIds = []) {
  const allEmployees = await getActiveEmployeesByCategory(requestData.category);
  const employees = allEmployees.filter(
    (e) =>
      !excludeEmployeeIds.some((id) => String(id) === String(e.telegramId)),
  );

  const notified = [];
  for (const emp of employees) {
    try {
      const msg = await ctx.telegram.sendMessage(
        emp.telegramId,
        `🆕 Новая заявка №${requestData.id}\n` +
          `Категория: ${requestData.category}\n` +
          `Адрес: ${requestData.address}\n` +
          `Описание: ${requestData.description}\n` +
          `Удобное время: ${requestData.convenientTime}\n` +
          `Телефон клиента: ${requestData.phone}`,
        Markup.inlineKeyboard([
          Markup.button.callback("Взять в работу", `take:${requestData.id}`),
        ]),
      );
      notified.push({ chatId: emp.telegramId, messageId: msg.message_id });
    } catch (err) {
      console.error(
        `Не удалось отправить уведомление сотруднику ${emp.telegramId}:`,
        err.message,
      );
    }
  }

  const found = await findRequestById(requestData.id);
  if (found) {
    found.data.notifiedMessages = JSON.stringify(notified);
    await saveRequest(found.rowNumber, found.data);
  }
}

function requestCompletionKeyboard(requestId) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(
        "\u{1F4CE} Отправить файлы",
        `upload:${requestId}`,
      ),
    ],
    [
      Markup.button.callback(
        "\u2611\uFE0F Закрыть заявку",
        `close:${requestId}`,
      ),
    ],
  ]);
}

function employeeMenuKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("🆕 Заявки моей категории", "menu:new")],
    [Markup.button.callback("✅ Мои принятые заявки", "menu:mine")],
  ]);
}

// Показывает необработанные заявки категории сотрудника с кнопкой "Взять в работу".
async function showNewCategoryRequests(ctx, employee) {
  const found = await getNewRequestsByCategory(employee.category);
  if (!found.length) {
    await ctx.reply("Новых заявок в вашей категории пока нет.");
    return;
  }

  for (const { rowNumber, data } of found) {
    const msg = await ctx.telegram.sendMessage(
      ctx.chat.id,
      `🆕 Заявка №${data.id}\n` +
        `Категория: ${data.category}\n` +
        `Адрес: ${data.address}\n` +
        `Описание: ${data.description}\n` +
        `Удобное время: ${data.convenientTime}\n` +
        `Телефон клиента: ${data.phone}`,
      Markup.inlineKeyboard([
        Markup.button.callback("Взять в работу", `take:${data.id}`),
      ]),
    );

    // Регистрируем сообщение, чтобы его можно было пометить неактуальным,
    // если заявку возьмёт другой сотрудник (см. markOtherNotifications).
    let notified = [];
    try {
      notified = JSON.parse(data.notifiedMessages || "[]");
    } catch {
      notified = [];
    }
    notified.push({ chatId: ctx.chat.id, messageId: msg.message_id });
    data.notifiedMessages = JSON.stringify(notified);
    await saveRequest(rowNumber, data);
  }
}

// Показывает заявки, уже взятые сотрудником, с кнопками в зависимости от статуса.
async function showMyAcceptedRequests(ctx, employee) {
  const found = await getActiveRequestsByEmployee(employee.telegramId);
  if (!found.length) {
    await ctx.reply("У вас нет принятых заявок в работе.");
    return;
  }

  for (const { data } of found) {
    const text =
      `Заявка №${data.id}\n` +
      `Статус: ${data.status}\n` +
      `Категория: ${data.category}\n` +
      `Адрес: ${data.address}\n` +
      `Описание: ${data.description}\n` +
      `Телефон клиента: ${data.phone}`;

    const buttons =
      data.status === STATUS.TAKEN
        ? [
            [Markup.button.callback("🚗 Выехал на место", `depart:${data.id}`)],
            [
              Markup.button.callback(
                "↩️ Отказаться от заявки",
                `decline:${data.id}`,
              ),
            ],
          ]
        : [[Markup.button.callback("☑️ Закрыть заявку", `close:${data.id}`)]];

    if (data.status === STATUS.DEPARTED) {
      buttons.unshift([
        Markup.button.callback(
          "\u{1F4CE} Отправить файлы",
          `upload:${data.id}`,
        ),
      ]);
    }

    await ctx.telegram.sendMessage(
      ctx.chat.id,
      text,
      Markup.inlineKeyboard(buttons),
    );
  }
}

async function notifyClient(ctx, requestData, text) {
  try {
    await ctx.telegram.sendMessage(requestData.clientId, text);
  } catch (err) {
    console.error("Не удалось уведомить клиента:", err.message);
  }
}

// Помечает уведомления у остальных сотрудников как неактуальные (заявка уже взята/отменена)
async function markOtherNotifications(
  ctx,
  requestData,
  exceptEmployeeId,
  note,
) {
  let notified = [];
  try {
    notified = JSON.parse(requestData.notifiedMessages || "[]");
  } catch {
    notified = [];
  }
  for (const item of notified) {
    if (String(item.chatId) === String(exceptEmployeeId)) continue;
    try {
      await ctx.telegram.editMessageText(
        item.chatId,
        item.messageId,
        undefined,
        note,
      );
    } catch {
      // Сообщение могло быть уже изменено/удалено пользователем — просто пропускаем
    }
  }
}

// ---------------------------------------------------------------------------
// Инициализация бота
// ---------------------------------------------------------------------------

const bot = new Telegraf(process.env.BOT_TOKEN);
bot.use(session({ store: sessionStore }));
bot.use(stage.middleware());

async function configureBotMenu() {
  await bot.telegram.setMyCommands(BOT_COMMANDS);
}

bot.start(async (ctx) => {
  const employee = await getEmployeeByTelegramId(ctx.from.id);
  if (employee) {
    await ctx.reply(
      `Здравствуйте, ${employee.name}!\n` +
        `Вы закреплены за категорией «${employee.category}». ` +
        `Новые заявки этой категории будут приходить сюда автоматически.\n\n` +
        `Также можно посмотреть заявки вручную:`,
      employeeMenuKeyboard(),
    );
    return;
  }

  await ctx.reply(
    "Здравствуйте! Я помогу оформить заявку на ремонт (электрика, сантехника, другое).",
    Markup.inlineKeyboard([
      Markup.button.callback("📝 Оставить заявку", "new_request"),
    ]),
  );
});

bot.action("new_request", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.scene.enter("new-request");
});

// --- Кнопки сотрудника -------------------------------------------------
bot.action("menu:new", async (ctx) => {
  const employee = await getEmployeeByTelegramId(ctx.from.id);
  if (!employee) {
    await ctx.answerCbQuery("Вы не зарегистрированы как сотрудник.", {
      show_alert: true,
    });
    return;
  }
  await ctx.answerCbQuery();
  await showNewCategoryRequests(ctx, employee);
});

bot.action("menu:mine", async (ctx) => {
  const employee = await getEmployeeByTelegramId(ctx.from.id);
  if (!employee) {
    await ctx.answerCbQuery("Вы не зарегистрированы как сотрудник.", {
      show_alert: true,
    });
    return;
  }
  await ctx.answerCbQuery();
  await showMyAcceptedRequests(ctx, employee);
});

// Текстовые команды-алиасы для тех же двух списков.
bot.command("newrequests", async (ctx) => {
  const employee = await getEmployeeByTelegramId(ctx.from.id);
  if (!employee) {
    await ctx.reply(
      "Эта команда доступна только зарегистрированным сотрудникам.",
    );
    return;
  }
  await showNewCategoryRequests(ctx, employee);
});

bot.command("myrequests", async (ctx) => {
  const employee = await getEmployeeByTelegramId(ctx.from.id);
  if (!employee) {
    await ctx.reply(
      "Эта команда доступна только зарегистрированным сотрудникам.",
    );
    return;
  }
  await showMyAcceptedRequests(ctx, employee);
});

bot.action(/^take:(.+)$/, async (ctx) => {
  const requestId = ctx.match[1];
  const employee = await getEmployeeByTelegramId(ctx.from.id);
  if (!employee) {
    await ctx.answerCbQuery("Вы не зарегистрированы как сотрудник.", {
      show_alert: true,
    });
    return;
  }

  const found = await findRequestById(requestId);
  if (!found) {
    await ctx.answerCbQuery("Заявка не найдена.", { show_alert: true });
    return;
  }

  if (found.data.status !== STATUS.NEW) {
    await ctx.answerCbQuery("Заявка уже взята другим сотрудником.", {
      show_alert: true,
    });
    try {
      await ctx.editMessageText(
        `${ctx.callbackQuery.message.text}\n\n⛔ Заявка уже взята другим сотрудником.`,
      );
    } catch {}
    return;
  }

  found.data.status = STATUS.TAKEN;
  found.data.employeeId = employee.telegramId;
  found.data.employeeName = employee.name;
  found.data.takenAt = formatTimestamp();
  await saveRequest(found.rowNumber, found.data);

  await ctx.answerCbQuery("Заявка взята в работу!");
  await ctx.editMessageText(
    `${ctx.callbackQuery.message.text}\n\n✅ Вы взяли заявку в работу.`,
    Markup.inlineKeyboard([
      [Markup.button.callback("🚗 Выехал на место", `depart:${requestId}`)],
      [
        Markup.button.callback(
          "↩️ Отказаться от заявки",
          `decline:${requestId}`,
        ),
      ],
    ]),
  );

  await notifyClient(
    ctx,
    found.data,
    `Ваша заявка №${requestId} взята в работу мастером ${employee.name}.`,
  );
  await markOtherNotifications(
    ctx,
    found.data,
    employee.telegramId,
    "Заявка уже взята другим сотрудником.",
  );
});

bot.action(/^depart:(.+)$/, async (ctx) => {
  const requestId = ctx.match[1];
  const employee = await getEmployeeByTelegramId(ctx.from.id);
  const found = await findRequestById(requestId);

  if (
    !found ||
    !employee ||
    String(found.data.employeeId) !== String(employee.telegramId)
  ) {
    await ctx.answerCbQuery("Недоступно.", { show_alert: true });
    return;
  }

  found.data.status = STATUS.DEPARTED;
  found.data.departedAt = formatTimestamp();
  await saveRequest(found.rowNumber, found.data);

  await ctx.answerCbQuery("Отмечено: выехал на место.");
  await ctx.editMessageText(
    `${ctx.callbackQuery.message.text}\n\n🚗 Мастер выехал на место.`,
    Markup.inlineKeyboard([
      [Markup.button.callback("☑️ Закрыть заявку", `close:${requestId}`)],
    ]),
  );
  await ctx.reply(
    "Можно добавить документы к заявке:",
    requestCompletionKeyboard(requestId),
  );

  await notifyClient(
    ctx,
    found.data,
    `Мастер выехал на адрес по заявке №${requestId}.`,
  );
});

bot.action(/^upload:(.+)$/, async (ctx) => {
  const requestId = ctx.match[1];
  const employee = await getEmployeeByTelegramId(ctx.from.id);
  const found = await findRequestById(requestId);

  if (
    !found ||
    !employee ||
    String(found.data.employeeId) !== String(employee.telegramId) ||
    found.data.status !== STATUS.DEPARTED
  ) {
    await ctx.answerCbQuery("Недоступно.", { show_alert: true });
    return;
  }

  ctx.session.uploadRequestId = requestId;
  ctx.session.uploadFolderId = "";
  await ctx.answerCbQuery();
  await ctx.reply(
    `Отправьте фотографии или документы по заявке №${requestId}. Можно отправить несколько файлов подряд.`,
  );
});

bot.on(["photo", "document"], async (ctx) => {
  const requestId = ctx.session?.uploadRequestId;
  if (!requestId) return;

  const employee = await getEmployeeByTelegramId(ctx.from.id);
  const found = await findRequestById(requestId);
  if (
    !found ||
    !employee ||
    String(found.data.employeeId) !== String(employee.telegramId) ||
    found.data.status !== STATUS.DEPARTED
  ) {
    delete ctx.session.uploadRequestId;
    delete ctx.session.uploadFolderId;
    await ctx.reply("Загрузка файлов недоступна для этой заявки.");
    return;
  }

  const document = ctx.message.document;
  const photo = ctx.message.photo?.at(-1);
  const fileId = document?.file_id || photo?.file_id;
  const filename = document?.file_name || `${requestId}_${fileId}.jpg`;
  const mimeType = document?.mime_type || "image/jpeg";

  try {
    const fileLink = await ctx.telegram.getFileLink(fileId);
    const response = await fetch(String(fileLink));
    if (!response.ok)
      throw new Error(`Telegram file download failed: ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());

    if (!ctx.session.uploadFolderId) {
      const folderName = `${new Date().toISOString().slice(0, 10)}_${requestId}`;
      const folder = await createRequestFolder(folderName);
      ctx.session.uploadFolderId = folder.id;
      found.data.photosLink =
        folder.webViewLink ||
        `https://drive.google.com/drive/folders/${folder.id}`;
      await saveRequest(found.rowNumber, found.data);
    }

    await uploadFileToDrive(
      buffer,
      filename,
      mimeType,
      ctx.session.uploadFolderId,
    );

    await ctx.reply(
      "Файл загружен. Отправьте следующий файл или нажмите «Закрыть заявку».",
      requestCompletionKeyboard(requestId),
    );
  } catch (err) {
    console.error("Не удалось загрузить файл в Google Drive:", {
      message: err.message,
      code: err.code,
      response: err.response?.data,
      stack: err.stack,
    });
    await ctx.reply("Не удалось загрузить файл. Попробуйте ещё раз.");
  }
});

bot.action(/^close:(.+)$/, async (ctx) => {
  const requestId = ctx.match[1];
  const employee = await getEmployeeByTelegramId(ctx.from.id);
  const found = await findRequestById(requestId);

  if (
    !found ||
    !employee ||
    String(found.data.employeeId) !== String(employee.telegramId)
  ) {
    await ctx.answerCbQuery("Недоступно.", { show_alert: true });
    return;
  }

  found.data.status = STATUS.CLOSED;
  found.data.closedAt = formatTimestamp();
  await saveRequest(found.rowNumber, found.data);

  await ctx.answerCbQuery("Заявка закрыта.");
  delete ctx.session.uploadRequestId;
  delete ctx.session.uploadFolderId;
  await ctx.editMessageText(
    `${ctx.callbackQuery.message.text}\n\n☑️ Заявка закрыта.`,
  );

  await notifyClient(
    ctx,
    found.data,
    `Заявка №${requestId} выполнена и закрыта. Спасибо, что обратились к нам!`,
  );
});

bot.action(/^decline:(.+)$/, async (ctx) => {
  const requestId = ctx.match[1];
  const employee = await getEmployeeByTelegramId(ctx.from.id);
  const found = await findRequestById(requestId);

  if (
    !found ||
    !employee ||
    String(found.data.employeeId) !== String(employee.telegramId)
  ) {
    await ctx.answerCbQuery("Недоступно.", { show_alert: true });
    return;
  }

  found.data.status = STATUS.NEW;
  found.data.employeeId = "";
  found.data.employeeName = "";
  found.data.takenAt = "";
  await saveRequest(found.rowNumber, found.data);

  await ctx.answerCbQuery("Вы отказались от заявки.");
  await ctx.editMessageText(
    `${ctx.callbackQuery.message.text}\n\n↩️ Вы отказались от заявки. Она возвращена в общий пул.`,
  );

  // Заявка снова уходит всем сотрудникам категории, кроме отказавшегося
  await notifyEmployees(ctx, found.data, [employee.telegramId]);
});

bot.catch((err, ctx) => {
  console.error(`Ошибка при обработке update ${ctx.updateType}:`, err);
});

module.exports = { bot, categoryKeyboard, configureBotMenu, BOT_COMMANDS };
