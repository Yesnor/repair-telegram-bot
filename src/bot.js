const { Telegraf, Scenes, session, Markup } = require("telegraf");
const { sessionStore } = require("./sessionStore");
const { formatTimestamp } = require("./dateUtils");
const { createRequestFolder, uploadFileToDrive } = require("./driveClient");
const {
  createRequest,
  findRequestById,
  saveRequest,
  getMaterialCost,
  saveMaterialCost,
  getActiveRequestsByEmployee,
  getNewRequestsByCategory,
  STATUS,
} = require("./requests");
const {
  getEmployeeByTelegramId,
  getActiveEmployeesByCategory,
} = require("./employees");
const { getActiveCities } = require("./cities");
const { getActiveCategories } = require("./database");

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

const BOT_COMMANDS = [{ command: "start", description: "Оставить заявку" }];

const WORK_PHOTO_REMINDER =
  "  Не забудьте на месте сделать фотоподтверждение выполненных работ!!!";

function categoryKeyboard(categories = CATEGORIES) {
  return Markup.inlineKeyboard(
    categories.map((category) => [
      Markup.button.callback(category, `cat:${category}`),
    ]),
  );
}

function cityKeyboard(cities) {
  const rows = [];
  for (let i = 0; i < cities.length; i += 2) {
    rows.push(
      cities
        .slice(i, i + 2)
        .map((city) => Markup.button.callback(city, `city:${city}`)),
    );
  }
  return Markup.inlineKeyboard(rows);
}

// ---------------------------------------------------------------------------
// Сцена (FSM) оформления заявки клиентом
// ---------------------------------------------------------------------------

const requestWizard = new Scenes.WizardScene(
  "new-request",

  // Шаг 1: выбор категории
  async (ctx) => {
    const categories = await getActiveCategories();
    await ctx.reply("Выберите категорию услуги:", categoryKeyboard(categories));
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
    const cities = await getActiveCities();
    if (!cities.length) {
      await ctx.reply("Список городов пока не настроен. Попробуйте позже.");
      return;
    }
    await ctx.reply("Выберите свой город:", cityKeyboard(cities));
    return ctx.wizard.next();
  },

  // Шаг 5: город выбран -> просим адрес
  async (ctx) => {
    if (!ctx.callbackQuery?.data?.startsWith("city:")) {
      await ctx.reply("Пожалуйста, выберите город одной из кнопок выше.");
      return;
    }
    ctx.wizard.state.data.city = ctx.callbackQuery.data.replace("city:", "");
    await ctx.answerCbQuery();
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
      city: data.city,
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
  const allEmployees = await getActiveEmployeesByCategory(
    requestData.category,
    requestData.city,
  );
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
          `Город: ${requestData.city}\n` +
          `Адрес: ${requestData.address}\n` +
          `Описание: ${requestData.description}\n` +
          `Срок исполнения: ${requestData.convenientTime}\n` +
          `Клиент: ${requestData.client}\n` +
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

function requestCompletionKeyboard(requestId, data = {}) {
  const hasDescription = Boolean(data.workDescriptionEntered);
  const hasMaterialCost = Boolean(String(data.materialCost || "").trim());
  const hasFiles = Boolean(String(data.photosLink || "").trim());
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(
        `${hasDescription ? "✅" : ""}Введите описание работ`,
        `work-description:${requestId}`,
      ),
    ],
    [
      Markup.button.callback(
        `${hasMaterialCost ? "✅" : ""}Введите сумму затрат на материалы`,
        `material-cost:${requestId}`,
      ),
    ],
    [
      Markup.button.callback(
        `${hasFiles ? "✅" : "\u{1F4CE}"} Отправить файлы`,
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
  const found = await getNewRequestsByCategory(
    employee.categories?.length ? employee.categories : employee.category,
    employee.cities?.length ? employee.cities : employee.city,
  );
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
        `Срок исполнения: ${data.convenientTime}\n` +
        `Клиент: ${data.client}\n` +
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

    let buttons =
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

    if (data.status === STATUS.DEPARTED) {
      data.materialCost = await getMaterialCost(data.id);
      buttons = requestCompletionKeyboard(data.id, data).reply_markup
        .inline_keyboard;
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
    `${ctx.callbackQuery.message.text}\n\n✅ Вы взяли заявку в работу.\n\n${WORK_PHOTO_REMINDER}`,
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
    `Ваша заявка №${requestId} взята в работу.`,
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
  found.data.materialCost = await getMaterialCost(requestId);
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
    requestCompletionKeyboard(requestId, found.data),
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
  ctx.session.uploadFolderLink = "";
  found.data.materialCost = await getMaterialCost(requestId);
  await ctx.answerCbQuery();
  await ctx.reply(
    `Отправьте фотографии или документы по заявке №${requestId}. Можно отправить несколько файлов подряд.`,
  );
});

async function prepareCompletionInput(ctx, requestId, field, prompt) {
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

  ctx.session.completionInput = { requestId, field };
  await ctx.answerCbQuery();
  await ctx.reply(prompt);
}

bot.action(/^work-description:(.+)$/, async (ctx) => {
  await prepareCompletionInput(
    ctx,
    ctx.match[1],
    "description",
    "Введите описание выполненных работ:",
  );
});

bot.action(/^material-cost:(.+)$/, async (ctx) => {
  await prepareCompletionInput(
    ctx,
    ctx.match[1],
    "materialCost",
    "Введите сумму затрат на материалы:",
  );
});

bot.on("text", async (ctx, next) => {
  const input = ctx.session?.completionInput;
  if (!input) return next();

  const value = ctx.message.text.trim();
  if (!value) {
    await ctx.reply("Введите значение текстом.");
    return;
  }

  if (
    input.field === "materialCost" &&
    !Number.isFinite(Number(value.replace(",", ".")))
  ) {
    await ctx.reply("Введите сумму цифрами!");
    return;
  }

  const employee = await getEmployeeByTelegramId(ctx.from.id);
  const found = await findRequestById(input.requestId);
  if (
    !found ||
    !employee ||
    String(found.data.employeeId) !== String(employee.telegramId) ||
    found.data.status !== STATUS.DEPARTED
  ) {
    delete ctx.session.completionInput;
    await ctx.reply("Ввод данных недоступен для этой заявки.");
    return;
  }

  if (input.field === "description") {
    found.data.description = value;
    found.data.workDescriptionEntered = "true";
    await saveRequest(found.rowNumber, found.data);
  } else {
    await saveMaterialCost(input.requestId, value);
  }

  found.data.materialCost = await getMaterialCost(input.requestId);
  delete ctx.session.completionInput;
  await ctx.reply(
    input.field === "description"
      ? "Описание работ сохранено"
      : "Сумма затрат сохранена",
    requestCompletionKeyboard(input.requestId, found.data),
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
    delete ctx.session.uploadFolderLink;
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
      ctx.session.uploadFolderLink =
        folder.webViewLink ||
        `https://drive.google.com/drive/folders/${folder.id}`;
    }

    await uploadFileToDrive(
      buffer,
      filename,
      mimeType,
      ctx.session.uploadFolderId,
    );

    found.data.materialCost = await getMaterialCost(requestId);
    if (!found.data.photosLink) {
      found.data.photosLink =
        ctx.session.uploadFolderLink ||
        `https://drive.google.com/drive/folders/${ctx.session.uploadFolderId}`;
      await saveRequest(found.rowNumber, found.data);
    }

    await ctx.reply(
      "Файл загружен. Отправьте следующий файл или нажмите «Закрыть заявку».",
      requestCompletionKeyboard(requestId, found.data),
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

  const materialCost = await getMaterialCost(requestId);
  if (!String(found.data.photosLink || "").trim()) {
    await ctx.answerCbQuery();
    await ctx.reply("Прикрепите файлы!");
    return;
  }
  if (
    !found.data.workDescriptionEntered ||
    !String(materialCost || "").trim()
  ) {
    await ctx.answerCbQuery();
    await ctx.reply("Введите сумму затрат на материалы и описание работ!");
    return;
  }

  found.data.status = STATUS.CLOSED;
  found.data.closedAt = formatTimestamp();
  await saveRequest(found.rowNumber, found.data);

  await ctx.answerCbQuery("Заявка закрыта.");
  delete ctx.session.uploadRequestId;
  delete ctx.session.uploadFolderId;
  delete ctx.session.uploadFolderLink;
  await ctx.editMessageText(`✅ Заявка ${requestId} закрыта`);

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

module.exports = { bot, categoryKeyboard, cityKeyboard, configureBotMenu, BOT_COMMANDS };
