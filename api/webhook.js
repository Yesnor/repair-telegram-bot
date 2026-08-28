const { bot, configureBotMenu } = require('../src/bot');

let menuConfiguration;

function configureMenuOnce() {
  if (!menuConfiguration) {
    menuConfiguration = configureBotMenu().catch((err) => {
      console.error('Не удалось обновить меню бота:', err.message);
    });
  }
  return menuConfiguration;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(200).send('Repair bot webhook is up');
    return;
  }

  // Простая защита эндпоинта секретной строкой в query-параметре.
  if (req.query.secret !== process.env.WEBHOOK_SECRET) {
    res.status(401).send('Unauthorized');
    return;
  }

  try {
    await configureMenuOnce();
    await bot.handleUpdate(req.body);
  } catch (err) {
    console.error('Ошибка обработки update от Telegram:', err);
  }

  if (!res.headersSent) res.status(200).send('OK');
};
