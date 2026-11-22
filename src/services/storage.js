import { mkdir, readFile, writeFile, rename, readdir } from 'node:fs/promises';
import path from 'node:path';

/** Атомарная запись JSON: сначала во временный файл, потом rename. */
export async function writeJson(file, data) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await rename(tmp, file);
}

export async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

/**
 * Хранилище по регионам: data/regions/XX.json. Позволяет продолжить
 * прерванный запуск, не скачивая готовые регионы заново.
 */
export class RegionStore {
  constructor(outFile) {
    this.outFile = outFile;
    this.dir = path.join(path.dirname(outFile), 'regions');
  }

  fileFor(code) {
    return path.join(this.dir, `${code}.json`);
  }

  async load(code) {
    const data = await readJson(this.fileFor(code));
    return data && data.complete ? data : null;
  }

  save(code, data) {
    return writeJson(this.fileFor(code), data);
  }

  /** Собирает все регионы в один итоговый файл. */
  async merge(codes) {
    let files = [];
    try {
      files = (await readdir(this.dir)).filter((f) => f.endsWith('.json'));
    } catch { /* нет каталога */ }
    const wanted = new Set(codes.map((c) => `${c}.json`));
    const regions = [];
    const uiks = [];
    for (const f of files.sort()) {
      if (!wanted.has(f)) continue;
      const r = await readJson(path.join(this.dir, f));
      if (!r) continue;
      regions.push({ subjectRfCode: r.subjectRfCode, name: r.name, uikCount: r.uiks.length, errors: r.errors.length });
      uiks.push(...r.uiks);
    }
    const result = {
      source: 'http://izbirkom.ru/ik',
      generatedAt: new Date().toISOString(),
      total: uiks.length,
      regions,
      uiks,
    };
    await writeJson(this.outFile, result);
    return result;
  }
}
