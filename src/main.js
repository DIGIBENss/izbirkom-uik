#!/usr/bin/env node
import { parseArgs, HELP } from './utils/args.js';
import { BrowserSession } from './services/browser.js';
import { IzbirkomApi } from './services/izbirkomApi.js';
import { RegionStore } from './services/storage.js';
import { scrapeRegion } from './services/scraper.js';

const log = {
  info: (...a) => console.log(...a),
  warn: (...a) => console.warn(...a),
};

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message, '\n', HELP);
    process.exit(2);
  }
  if (opts.help) {
    console.log(HELP);
    return;
  }

  const store = new RegionStore(opts.out);
  const session = new BrowserSession({ channel: opts.channel, headful: opts.headful, log });
  let interrupted = false;
  process.once('SIGINT', () => {
    interrupted = true;
    console.log('\nОстанавливаюсь после текущего региона (Ctrl+C ещё раз — выход сразу)…');
    process.once('SIGINT', () => process.exit(130));
  });

  const started = Date.now();
  console.log(`Регионов: ${opts.regions.length}, потоков: ${opts.concurrency}, пауза: ${opts.delay} мс`);
  console.log('Запускаю браузер…');
  await session.start();
  const api = new IzbirkomApi(session, { log });

  try {
    for (const [i, code] of opts.regions.entries()) {
      if (interrupted) break;
      const prefix = `[${i + 1}/${opts.regions.length}] субъект ${code}`;
      if (!opts.fresh && (await store.load(code))) {
        console.log(`${prefix}: уже скачан, пропускаю`);
        continue;
      }
      console.log(`${prefix}`);
      try {
        const region = await scrapeRegion(api, code, {
          concurrency: opts.concurrency,
          delayMs: opts.delay,
          members: opts.members,
          log,
        });
        await store.save(code, region);
        if (region.errors.length) console.warn(`  ошибок: ${region.errors.length} (см. data/regions/${code}.json)`);
      } catch (err) {
        console.error(`  ${prefix} не удалось: ${err.message}`);
      }
    }
  } finally {
    await session.close();
  }

  const result = await store.merge(opts.regions);
  const min = ((Date.now() - started) / 60000).toFixed(1);
  console.log(`\nГотово: ${result.total} УИК из ${result.regions.length} регионов → ${opts.out} (${min} мин)`);
}

main().catch((err) => {
  console.error('Ошибка:', err.message);
  process.exit(1);
});
