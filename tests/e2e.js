/**
 * E2E: настоящий браузер + локальный макет сайта/API.
 * Запуск: npm run test:e2e   (нужен установленный Chrome; иначе BROWSER_CHANNEL=msedge)
 * В обычный npm test не входит: имя файла не подходит под шаблон *.test.js.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startMock } from './mock-server.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('полный прогон через браузер со сменой ключа', { timeout: 120000 }, async () => {
  const mock = await startMock({ rotateEvery: 5 });
  const dir = await mkdtemp(path.join(os.tmpdir(), 'uik-e2e-'));
  try {
    const out = path.join(dir, 'uik.json');
    const code = await new Promise((resolve) => {
      const p = spawn(process.execPath, ['src/main.js', '--regions', '01,02', '--out', out, '--delay', '10', '--concurrency', '4', '--members'], {
        cwd: root,
        env: { ...process.env, IZBIRKOM_SITE: mock.siteUrl, IZBIRKOM_API: mock.apiUrl },
        stdio: 'inherit',
      });
      p.on('exit', resolve);
    });
    assert.equal(code, 0);
    const res = JSON.parse(await readFile(out, 'utf8'));
    assert.equal(res.total, 3);
    assert.ok(res.uiks.every((u) => u.address && u.members.length === 2));
    const r01 = JSON.parse(await readFile(path.join(dir, 'regions', '01.json'), 'utf8'));
    assert.equal(r01.errors.length, 0);
  } finally {
    mock.close();
    await rm(dir, { recursive: true, force: true });
  }
});
