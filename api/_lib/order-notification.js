function createOrderNotifier({
  env = process.env,
  fetchImpl = globalThis.fetch,
} = {}) {
  return async (order, signal) => {
    const baseUrl = env.BOT_INTERNAL_API_URL;
    const secret = env.BOT_INTERNAL_API_SECRET;
    if (!baseUrl || !secret || typeof fetchImpl !== 'function') return;
    const response = await fetchImpl(
      `${baseUrl.replace(/\/+$/, '')}/internal/orders/new`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({ order }),
        signal,
      },
    );
    if (!response.ok) throw new Error('Bot notification failed');
  };
}

module.exports = { createOrderNotifier };
