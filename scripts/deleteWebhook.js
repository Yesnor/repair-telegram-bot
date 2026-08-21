require('dotenv').config();

async function main() {
  const { BOT_TOKEN } = process.env;
  if (!BOT_TOKEN) {
    console.error('Заполните BOT_TOKEN в .env перед запуском.');
    process.exit(1);
  }

  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/deleteWebhook`, {
    method: 'POST',
  });
  const data = await res.json();
  console.log(data);
}

main();
