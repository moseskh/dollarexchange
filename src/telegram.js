// Minimal Telegram Bot API client. TELEGRAM_API can point at a local mock for testing.

export class TelegramError extends Error {
  constructor(method, data) {
    super(`${method}: ${data.description}`);
    this.code = data.error_code;
  }
}

export async function telegram(env, method, body = {}) {
  const base = env.TELEGRAM_API || "https://api.telegram.org";
  const res = await fetch(`${base}/bot${env.BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) throw new TelegramError(method, data);
  return data.result;
}

// The chat is gone for good (bot blocked, kicked, or chat deleted): stop sending to it.
export const isGoneError = (err) => err instanceof TelegramError && (err.code === 403 || /chat not found/i.test(err.message));
