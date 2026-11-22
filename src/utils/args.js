/** Коды субъектов РФ, используемые ГАС «Выборы». */
export const ALL_SUBJECT_CODES = [
  '01', '02', '03', '04', '05', '06', '07', '08', '09', '10',
  '11', '12', '13', '14', '15', '16', '17', '18', '19', '20',
  '21', '22', '23', '24', '25', '26', '27', '28', '29', '30',
  '31', '32', '33', '34', '35', '36', '37', '38', '39', '40',
  '41', '42', '43', '44', '45', '46', '47', '48', '49', '50',
  '51', '52', '53', '54', '55', '56', '57', '58', '59', '60',
  '61', '62', '63', '64', '65', '66', '67', '68', '69', '70',
  '71', '72', '73', '74', '75', '76', '77', '78', '79', '83',
  '86', '87', '89', '90', '91', '92', '93', '94', '95', '99',
];

/** Субъекты, которые сам сайт скрывает (env.EXCLUDED_SUBJECTS на izbirkom.ru). */
export const SITE_EXCLUDED = ['31', '95', '96', '97', '98'];

export const HELP = `
Парсер УИК с izbirkom.ru → JSON

Использование:
  node src/main.js [опции]

Опции:
  --regions 01,77,78   коды субъектов РФ (по умолчанию все)
  --out data/uik.json  итоговый файл
  --concurrency 2      параллельных запросов (1–4)
  --delay 300          пауза между запросами одного потока, мс
  --members            запрашивать и состав комиссий (+1 запрос на УИК; для УИК
                       ЦИК его обычно не публикует, поле будет null)
  --fresh              игнорировать уже скачанные регионы (data/regions/*.json)
  --headful            показать окно браузера
  --channel chrome     браузер: chrome | msedge | chromium
  --help               эта справка
`;

export function parseArgs(argv) {
  const opts = {
    regions: null,
    out: 'data/uik.json',
    concurrency: 2,
    delay: 300,
    members: false,
    fresh: false,
    headful: false,
    channel: process.env.BROWSER_CHANNEL || 'chrome',
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`Не указано значение для ${a}`);
      return v;
    };
    switch (a) {
      case '--regions': opts.regions = val().split(',').map((s) => s.trim().padStart(2, '0')).filter(Boolean); break;
      case '--out': opts.out = val(); break;
      case '--concurrency': opts.concurrency = clampInt(val(), 1, 4, a); break;
      case '--delay': opts.delay = clampInt(val(), 0, 60000, a); break;
      case '--members': opts.members = true; break;
      case '--no-members': opts.members = false; break;
      case '--fresh': opts.fresh = true; break;
      case '--headful': opts.headful = true; break;
      case '--channel': opts.channel = val(); break;
      case '-h': case '--help': opts.help = true; break;
      default: throw new Error(`Неизвестная опция: ${a}`);
    }
  }
  if (!opts.regions) opts.regions = ALL_SUBJECT_CODES.filter((c) => !SITE_EXCLUDED.includes(c));
  return opts;
}

function clampInt(v, min, max, name) {
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) throw new Error(`${name}: ожидается число, получено "${v}"`);
  return Math.min(max, Math.max(min, n));
}
