export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Выполняет fn(item, index) для всех элементов с ограничением параллельности
 * и паузой между запросами каждого воркера (чтобы не нагружать сервер ЦИК).
 */
export async function mapPool(items, { concurrency = 2, delayMs = 0 } = {}, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
      if (delayMs) await sleep(delayMs);
    }
  };
  const n = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: n }, worker));
  return results;
}

/** Повтор с экспоненциальной паузой. shouldRetry(err) → false прерывает повторы. */
export async function retry(fn, { attempts = 3, baseMs = 1000, shouldRetry = () => true, onRetry } = {}) {
  let lastErr;
  for (let a = 1; a <= attempts; a++) {
    try {
      return await fn(a);
    } catch (err) {
      lastErr = err;
      if (a === attempts || !shouldRetry(err)) break;
      onRetry?.(err, a);
      await sleep(baseMs * 2 ** (a - 1));
    }
  }
  throw lastErr;
}
