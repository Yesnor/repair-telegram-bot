// Локальный запуск бота через long polling — удобно для разработки и отладки.
// В продакшене (Vercel) используется webhook через api/webhook.js, этот файл там не участвует.
require('dotenv').config();
const { bot, configureBotMenu } = require('./src/bot');

configureBotMenu().then(() => bot.launch()).then(() => {
  console.log('Бот запущен в режиме polling (локальная разработка).');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
