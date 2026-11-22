import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { collectUiks, collectLazyNodes, isUik } from '../src/utils/tree.js';
import { buildUikRecord, normalizeGeo, unwrapReport } from '../src/utils/normalize.js';
import { mapPool, retry } from '../src/utils/limiter.js';
import { parseArgs, SITE_EXCLUDED } from '../src/utils/args.js';
import { IzbirkomApi } from '../src/services/izbirkomApi.js';
import { scrapeRegion } from '../src/services/scraper.js';
import { RegionStore } from '../src/services/storage.js';
import { tree01, info, members, fakeTransport } from './fixtures/api.js';

const quiet = { info() {}, warn() {} };

test('collectUiks находит УИК и путь до них', () => {
  const found = collectUiks(tree01);
  assert.equal(found.length, 2);
  assert.deepEqual(found.map((f) => f.node.externalId), ['uik-1', 'uik-2']);
  assert.deepEqual(found[0].path.map((p) => p.externalId), ['iksrf-01', 'tik-1']);
});

test('collectLazyNodes находит ветки без подгруженных детей', () => {
  assert.deepEqual(collectLazyNodes(tree01).map((n) => n.externalId), ['tik-2']);
});

test('isUik понимает тип и строкой, и числом', () => {
  assert.ok(isUik({ commissionType: '5' }));
  assert.ok(isUik({ type: 5 }));
  assert.ok(!isUik({ commissionType: '4' }));
});

test('unwrapReport и normalizeGeo', () => {
  assert.equal(unwrapReport({ createdAt: 'x', body: { a: 1 } }).a, 1);
  assert.deepEqual(unwrapReport(null), {});
  assert.deepEqual(normalizeGeo({ latitude: '44.5', longitude: '40.1' }), { lat: 44.5, lon: 40.1 });
  assert.equal(normalizeGeo({ latitude: 'abc' }), null);
});

test('buildUikRecord собирает нормализованную запись', () => {
  const [{ node, path: p }] = collectUiks(tree01);
  const rec = buildUikRecord({ subjectRfCode: '01', ...node }, p, info('uik-1'), members());
  assert.equal(rec.id, 'uik-1');
  assert.equal(rec.number, '1');
  assert.equal(rec.address, '385000, Республика Адыгея, г.Майкоп, ул.Пионерская, 199');
  assert.equal(rec.fax, null, 'пустая строка → null');
  assert.equal(rec.tik.name, 'Майкопская городская ТИК');
  assert.equal(rec.region, 'Центральная избирательная комиссия Республики Адыгея');
  assert.deepEqual(rec.geo, { lat: 44.6098, lon: 40.1006 });
  assert.equal(rec.votingRoom.description, 'Актовый зал');
  assert.equal(rec.members[0].fio, 'Иванов Иван Иванович', 'отсортированы по номеру');
  assert.equal(rec.members[0].position, 'Председатель');
  assert.equal(rec.numericId, 452989253);
  assert.equal(rec.postCode, '385000');
  assert.equal(rec.locality, 'Республика Адыгея, г.Майкоп');
  assert.deepEqual(rec.votingRoom.geo, { lat: 44.61, lon: 40.1 });
});

test('buildUikRecord не падает без отчётов', () => {
  const rec = buildUikRecord({ externalId: 'x', commissionName: 'УИК №9', commissionType: 5 }, [], null, null);
  assert.equal(rec.name, 'УИК №9');
  assert.equal(rec.members, null);
  assert.equal(rec.geo, null);
});

test('mapPool соблюдает лимит параллельности и порядок результатов', async () => {
  let active = 0;
  let peak = 0;
  const res = await mapPool([1, 2, 3, 4, 5], { concurrency: 2 }, async (x) => {
    active++; peak = Math.max(peak, active);
    await new Promise((r) => setTimeout(r, 5));
    active--;
    return x * 10;
  });
  assert.deepEqual(res, [10, 20, 30, 40, 50]);
  assert.equal(peak, 2);
});

test('retry повторяет временные ошибки и не повторяет 4xx', async () => {
  let n = 0;
  const v = await retry(async () => { if (++n < 3) throw new Error('boom'); return 'ok'; }, { baseMs: 1 });
  assert.equal(v, 'ok');
  let m = 0;
  await assert.rejects(retry(async () => { m++; const e = new Error('400'); e.status = 400; throw e; },
    { baseMs: 1, shouldRetry: (e) => e.status >= 500 }));
  assert.equal(m, 1);
});

test('parseArgs: значения по умолчанию и опции', () => {
  const d = parseArgs([]);
  assert.equal(d.out, 'data/uik.json');
  assert.ok(d.regions.length > 80);
  assert.ok(SITE_EXCLUDED.every((c) => !d.regions.includes(c)));
  assert.equal(d.members, false, 'состав по умолчанию не запрашиваем');
  assert.equal(parseArgs(['--members']).members, true);
  const o = parseArgs(['--regions', '1,77', '--concurrency', '10', '--no-members']);
  assert.deepEqual(o.regions, ['01', '77']);
  assert.equal(o.concurrency, 4, 'ограничено сверху');
  assert.equal(o.members, false);
  assert.throws(() => parseArgs(['--wat']));
});

test('scrapeRegion: дерево, ленивая подгрузка, отчёты, ошибки', async () => {
  const t = fakeTransport({ failInfoFor: ['uik-2'] });
  const api = new IzbirkomApi(t, { log: quiet });
  const r = await scrapeRegion(api, '01', { delayMs: 0, members: true, log: quiet });
  assert.equal(r.complete, true);
  assert.deepEqual(r.uiks.map((u) => u.id), ['uik-1', 'uik-2', 'uik-3']);
  assert.equal(r.uiks[2].tik.name, 'Гиагинская районная ТИК');
  assert.ok(t.calls.includes('/commissionOrg/tik-2'));
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].id, 'uik-2');
  assert.equal(r.uiks[1].address, null, 'запись есть, даже если отчёт не пришёл');
});

test('scrapeRegion: пустой субъект и режим без состава', async () => {
  const t = fakeTransport();
  const api = new IzbirkomApi(t, { log: quiet });
  const empty = await scrapeRegion(api, '99', { log: quiet });
  assert.equal(empty.uiks.length, 0);
  const r = await scrapeRegion(api, '01', { delayMs: 0, members: false, log: quiet });
  assert.ok(!t.calls.some((c) => c.startsWith('/reports/42')));
  assert.ok(!('members' in r.uiks[0]));
});

test('RegionStore сохраняет регионы и собирает итоговый JSON', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'uik-'));
  try {
    const store = new RegionStore(path.join(dir, 'uik.json'));
    const api = new IzbirkomApi(fakeTransport(), { log: quiet });
    await store.save('01', await scrapeRegion(api, '01', { delayMs: 0, log: quiet }));
    assert.ok(await store.load('01'));
    assert.equal(await store.load('02'), null);
    const res = await store.merge(['01', '02']);
    assert.equal(res.total, 3);
    assert.equal(res.regions[0].uikCount, 3);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
