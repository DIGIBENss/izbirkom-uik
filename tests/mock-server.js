import http from 'node:http';
import { tree01, lazyTik2, info, members } from './fixtures/api.js';

/**
 * Локальный макет izbirkom.ru + API для e2e-проверки браузерной части.
 * «Сайт» при загрузке сам делает запрос к API с текущим ключом (как настоящий фронтенд),
 * «API» меняет ключ каждые rotateEvery успешных запросов, имитируя истечение.
 */
export async function startMock({ rotateEvery = 5 } = {}) {
  let key = 'k0';
  let served = 0;
  let apiPort;

  const site = http.createServer((req, res) => {
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(`<script>fetch('http://127.0.0.1:${apiPort}/api/commissionOrg?subjectRfCode=01',
      {headers:{'X-Api-Key':'${key}','X-Client-Fingerprint':navigator.userAgent}})</script>mock`);
  });

  const api = http.createServer((req, res) => {
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-headers', '*');
    if (req.method === 'OPTIONS') return res.end();
    if (req.headers['x-api-key'] !== key) { res.statusCode = 401; return res.end(); }
    served++;
    if (served % rotateEvery === 0) key = `k${served}`;
    const u = new URL(req.url, 'http://x');
    const p = u.pathname.replace(/^\/api/, '');
    const send = (o) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
    if (p === '/commissionOrg') {
      if (u.searchParams.get('subjectRfCode') === '01') return send(tree01);
      res.statusCode = 404; return res.end();
    }
    if (p === '/commissionOrg/tik-2') return send(lazyTik2);
    const uik = p.match(/^\/commissionOrg\/(uik-.+)$/);
    if (uik) return send(info(uik[1]));
    if (p === '/reports/42') return send(members());
    res.statusCode = 404; res.end();
  });

  const listen = (srv) => new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv.address().port)));
  const sitePort = await listen(site);
  apiPort = await listen(api);
  return {
    siteUrl: `http://127.0.0.1:${sitePort}`,
    apiUrl: `http://127.0.0.1:${apiPort}/api`,
    close: () => { site.close(); api.close(); },
  };
}
