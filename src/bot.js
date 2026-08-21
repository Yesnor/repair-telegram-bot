const { Telegraf, Scenes, session, Markup } = require("telegraf");
const { sessionStore } = require("./sessionStore");
const {
  createRequest,
  findRequestById,
  saveRequest,
  getActiveRequestsByEmployee,
  STATUS,
} = require("./requests");
const {
  getEmployeeByTelegramId,
  getActiveEmployeesByCategory,
} = require("./employees");

const CATEGORIES = ["Электрика", "Сантехника", "Другое"];

// ---------------------------------------------------------------------------
// Сцена (FSM) оформления заявки клиентом
// ---------------------------------------------------------------------------

const requestWizard = new Scenes.WizardScene(
  "new-request",

  // Шаг 1: выбор категории
  async (ctx) => {
    await ctx.reply(
      "Выберите категорию услуги:",
      Markup.inlineKeyboard(
        CATEGORIES.map((c) => Markup.button.callback(c, `cat:${c}`)),
      ),
    );
    return ctx.wizard.next();
  },

  // Шаг 2: категория выбрана -> просим описание
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
    await ctx.reply(`Категория: ${category}.\nОпишите проблему коротко:`);
    return ctx.wizard.next();
  },

  // Шаг 3: описание -> просим адрес
  async (ctx) => {
    if (!ctx.message?.text) {
      await ctx.reply("Пожалуйста, опишите проблему текстом.");
      return;
    }
    ctx.wizard.state.data.description = ctx.message.text;
    await ctx.reply("Укажите адрес, куда нужно приехать мастеру:");
    return ctx.wizard.next();
  },

  // Шаг 4: адрес -> просим удобное время
  async (ctx) => {
    if (!ctx.message?.text) {
      await ctx.reply("Пожалуйста, укажите адрес текстом.");
      return;
    }
    ctx.wizard.state.data.address = ctx.message.text;
    await ctx.reply("В какое время вам удобно принять мастера?");
    return ctx.wizard.next();
  },

  // Шаг 5: время -> просим телефон
  async (ctx) => {
    if (!ctx.message?.text) {
      await ctx.reply("Пожалуйста, укажите удобное время текстом.");
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

  // Шаг 6: телефон -> сохраняем заявку и уведомляем сотрудников
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
      phone,
      category: data.category,
      description: data.description,
      address: data.address,
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

bot.start(async (ctx) => {
  const employee = await getEmployeeByTelegramId(ctx.from.id);
  if (employee) {
    await ctx.reply(
      `Здравствуйте, ${employee.name}!\n` +
        `Вы закреплены за категорией «${employee.category}». ` +
        `Новые заявки этой категории будут приходить сюда автоматически.`,
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

bot.command("myrequests", async (ctx) => {
  const employee = await getEmployeeByTelegramId(ctx.from.id);
  if (!employee) {
    await ctx.reply(
      "Эта команда доступна только зарегистрированным сотрудникам.",
    );
    return;
  }

  const active = await getActiveRequestsByEmployee(employee.telegramId);
  if (!active.length) {
    await ctx.reply("У вас нет активных заявок в работе.");
    return;
  }

  const lines = active.map(
    (r) =>
      `Заявка №${r.id} (${r.status})\n` +
      `Категория: ${r.category}\n` +
      `Адрес: ${r.address}\n` +
      `Телефон клиента: ${r.phone}`,
  );

  await ctx.reply(`Ваши активные заявки:\n\n${lines.join("\n\n")}`);
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
  found.data.takenAt = new Date().toISOString();
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
  found.data.departedAt = new Date().toISOString();
  await saveRequest(found.rowNumber, found.data);

  await ctx.answerCbQuery("Отмечено: выехал на место.");
  await ctx.editMessageText(
    `${ctx.callbackQuery.message.text}\n\n🚗 Мастер выехал на место.`,
    Markup.inlineKeyboard([
      [Markup.button.callback("☑️ Закрыть заявку", `close:${requestId}`)],
    ]),
  );

  await notifyClient(
    ctx,
    found.data,
    `Мастер выехал на адрес по заявке №${requestId}.`,
  );
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
  found.data.closedAt = new Date().toISOString();
  await saveRequest(found.rowNumber, found.data);

  await ctx.answerCbQuery("Заявка закрыта.");
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

module.exports = { bot };
