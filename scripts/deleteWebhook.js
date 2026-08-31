require('dotenv').config();

async function main() {
  const { BOT_TOKEN } = process.env;
  if (!BOT_TOKEN) {
    console.error('Заполните BOT_TOKEN в .env перед запуском.');
    process.exitCode = 1;
    return;
  }

  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/deleteWebhook`, {
    method: 'POST',
  });
  const data = await res.json();

  if (!res.ok || !data.ok) {
    throw new Error(data.description || `Telegram API error: ${res.status}`);
  }

  console.log(data);
}

main().catch((err) => {
  console.error('Не удалось удалить webhook:', err.message);
  process.exitCode = 1;
});
