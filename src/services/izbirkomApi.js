import { retry } from '../utils/limiter.js';

/** Номера отчётов API, которые использует страница «Избирательные комиссии». */
export const REPORT = Object.freeze({
  // Состав комиссии. На практике публикуется для ИКСРФ; для УИК/ТИК сайт получает 404.
  MEMBERS: 42,
  INFO: 43, // не используется: карточку УИК сайт берёт из /commissionOrg/{id}
});

const transient = (err) => !err.status || err.status === 429 || err.status >= 500;

/**
 * Обёртка над API ЦИК. transport — объект с методом apiGet(path) (BrowserSession
 * или заглушка в тестах).
 */
export class IzbirkomApi {
  constructor(transport, { attempts = 3, log = console } = {}) {
    this.t = transport;
    this.attempts = attempts;
    this.log = log;
  }

  get(path) {
    return retry(() => this.t.apiGet(path), {
      attempts: this.attempts,
      shouldRetry: transient,
      onRetry: (err, a) => this.log.warn?.(`  повтор ${a} для ${path}: ${err.message}`),
    });
  }

  /** Дерево комиссий субъекта РФ. */
  tree(subjectRfCode) {
    return this.get(`/commissionOrg?subjectRfCode=${encodeURIComponent(subjectRfCode)}`);
  }

  /** Карточка комиссии (адрес, телефоны, координаты, помещение), у веток — с детьми. */
  commission(id) {
    return this.get(`/commissionOrg/${encodeURIComponent(id)}`);
  }

  info(id) {
    return this.get(`/reports/${REPORT.INFO}?commissionOrgId=${encodeURIComponent(id)}`);
  }

  members(id) {
    return this.get(`/reports/${REPORT.MEMBERS}?commissionOrgId=${encodeURIComponent(id)}`);
  }
}
