require('dotenv').config();

async function main() {
  const { BOT_TOKEN, PUBLIC_URL, WEBHOOK_SECRET } = process.env;
  if (!BOT_TOKEN || !PUBLIC_URL || !WEBHOOK_SECRET) {
    console.error('Заполните BOT_TOKEN, PUBLIC_URL и WEBHOOK_SECRET в .env перед запуском.');
    process.exit(1);
  }

  const url = `${PUBLIC_URL}/api/webhook?secret=${encodeURIComponent(WEBHOOK_SECRET)}`;
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  const data = await res.json();
  console.log(data);
}

main();
