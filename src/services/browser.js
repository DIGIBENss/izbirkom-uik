import { chromium } from 'playwright-core';

export const SITE_URL = process.env.IZBIRKOM_SITE || 'http://izbirkom.ru';
export const API_BASE = process.env.IZBIRKOM_API || 'http://apps.cikrf.ru/service/ik-inp-service-pbcopy';

export class ApiError extends Error {
  constructor(status, path, body) {
    super(`HTTP ${status} ${path}${body ? `: ${String(body).slice(0, 200)}` : ''}`);
    this.status = status;
    this.path = path;
  }
}

/**
 * Сессия в настоящем браузере.
 *
 * Страница izbirkom.ru сама получает доступ к API (её собственный код проходит
 * проверку и ставит заголовки X-Api-Key / X-Client-Fingerprint). Мы только
 * запоминаем эти заголовки из запросов страницы и делаем запросы к API из
 * контекста той же страницы — так же, как это делает сайт.
 */
export class BrowserSession {
  constructor({ channel = 'chrome', headful = false, log = console } = {}) {
    this.channel = channel;
    this.headful = headful;
    this.log = log;
    this.browser = null;
    this.page = null;
    this.headers = null;
    this._waiters = [];
  }

  async start() {
    const launchOpts = {
      headless: !this.headful,
      // izbirkom.ru и apps.cikrf.ru работают только по HTTP (порт 443 закрыт).
      // В новых Chrome/Edge режим HTTPS-First пытается перейти на HTTPS, не может
      // и под автоматизацией обрывает загрузку с net::ERR_BLOCKED_BY_CLIENT.
      args: [
        '--disable-features=HttpsUpgrades,HttpsFirstBalancedMode,HttpsFirstBalancedModeAutoEnable,' +
          'HttpsFirstModeV2ForEngagedSites,HttpsFirstModeIncognito,HttpsFirstModeV2',
      ],
    };
    if (this.channel && this.channel !== 'chromium') launchOpts.channel = this.channel;
    try {
      this.browser = await chromium.launch(launchOpts);
    } catch (err) {
      throw new Error(
        `Не удалось запустить браузер (${this.channel}). Установите Google Chrome, ` +
        `укажите --channel msedge или выполните "npx playwright install chromium" и --channel chromium.\n${err.message}`,
      );
    }
    const context = await this.browser.newContext({ locale: 'ru-RU' });
    this.page = await context.newPage();
    this.page.on('request', (req) => {
      // Ключ берём только из запросов самой страницы во время обновления доступа
      // и только новый: наши собственные запросы со старым ключом игнорируем.
      if (!this._awaitingKey || !req.url().startsWith(API_BASE)) return;
      const h = req.headers();
      const key = h['x-api-key'];
      if (!key || key === this._staleKey) return;
      this._awaitingKey = false;
      this.headers = {
        'X-Api-Key': key,
        'X-Client-Fingerprint': h['x-client-fingerprint'] || '',
      };
      this._waiters.splice(0).forEach((w) => w());
    });
    await this.refreshAccess();
    return this;
  }

  /**
   * Открывает страницу комиссий и ждёт, пока сайт сам получит API-ключ.
   * Параллельные вызовы ждут одно и то же обновление (иначе навигации перебивают друг друга).
   */
  refreshAccess(timeoutMs) {
    if (!this._refreshing) {
      this._refreshing = this._doRefresh(timeoutMs).finally(() => { this._refreshing = null; });
    }
    return this._refreshing;
  }

  async _doRefresh(timeoutMs = 45000) {
    this._staleKey = this.headers?.['X-Api-Key'] ?? null;
    this.headers = null;
    this._awaitingKey = true;
    const got = new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        this._awaitingKey = false;
        reject(new Error(
          'Сайт не выдал API-ключ за отведённое время. Попробуйте --headful, чтобы увидеть, что происходит на странице.',
        ));
      }, timeoutMs);
      this._waiters.push(() => { clearTimeout(t); resolve(); });
    });
    await this.page.goto(`${SITE_URL}/ik?subjectRfCode=01`, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await got;
    this.log.info?.('  доступ к API получен');
  }

  /** GET к API из контекста страницы. 401 → обновляем доступ и повторяем один раз. */
  async apiGet(path, { allowRefresh = true } = {}) {
    if (this._refreshing) await this._refreshing;
    if (!this.headers) await this.refreshAccess();
    const used = this.headers;
    const res = await this.page.evaluate(
      async ({ url, headers }) => {
        const r = await fetch(url, { headers: { Accept: 'application/json', ...headers } });
        return { status: r.status, text: await r.text() };
      },
      { url: API_BASE + path, headers: used },
    );
    if (res.status === 401 && allowRefresh) {
      if (!this._refreshing && this.headers?.['X-Api-Key'] === used['X-Api-Key']) {
        this.log.info?.('  ключ истёк, обновляю доступ…');
        await this.refreshAccess();
      } else if (this._refreshing) {
        await this._refreshing; // ключ уже обновляет другой поток
      }
      return this.apiGet(path, { allowRefresh: false });
    }
    if (res.status === 404 || res.status === 204) return null;
    if (res.status < 200 || res.status >= 300) throw new ApiError(res.status, path, res.text);
    if (!res.text) return null;
    try {
      return JSON.parse(res.text);
    } catch {
      throw new ApiError(res.status, path, `не JSON: ${res.text}`);
    }
  }

  async close() {
    await this.browser?.close().catch(() => {});
  }
}
