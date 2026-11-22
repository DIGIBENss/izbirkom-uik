import { collectLazyNodes, collectUiks, nodeId, nodeName } from '../utils/tree.js';
import { buildUikRecord } from '../utils/normalize.js';
import { mapPool } from '../utils/limiter.js';

/**
 * Дозагружает детей у узлов, пришедших без них (hasChildren: true, children: []).
 * Повторяет, пока в дереве не останется «пустых» узлов.
 */
export async function expandTree(api, root, { concurrency, delayMs, log }) {
  const seen = new Set();
  for (let round = 0; round < 6; round++) {
    const lazy = collectLazyNodes(root).filter((n) => !seen.has(nodeId(n)));
    if (!lazy.length) return root;
    log.info?.(`  подгружаю ветки дерева: ${lazy.length}`);
    await mapPool(lazy, { concurrency, delayMs }, async (node) => {
      seen.add(nodeId(node));
      const full = await api.commission(nodeId(node));
      node.children = Array.isArray(full?.children) ? full.children : [];
    });
  }
  return root;
}

/**
 * Скачивает все УИК одного субъекта РФ.
 * @returns {{subjectRfCode, name, complete, uiks, errors}}
 */
export async function scrapeRegion(api, code, { concurrency = 2, delayMs = 300, members = false, log = console } = {}) {
  const root = await api.tree(code);
  if (!root || !nodeId(root)) {
    return { subjectRfCode: code, name: null, complete: true, uiks: [], errors: [] };
  }
  await expandTree(api, root, { concurrency, delayMs, log });

  const found = collectUiks(root);
  log.info?.(`  ${nodeName(root)}: найдено УИК ${found.length}`);

  const errors = [];
  let done = 0;
  const uiks = await mapPool(found, { concurrency, delayMs }, async ({ node, path }) => {
    const id = nodeId(node);
    let info = null;
    let mem = null;
    try {
      info = await api.commission(id); // карточка: адрес, телефоны, координаты, помещение
      if (!info) errors.push({ id, report: 'info', error: 'карточка не найдена (404)' });
    } catch (err) {
      errors.push({ id, report: 'info', error: err.message });
    }
    if (members) {
      try {
        mem = await api.members(id);
      } catch (err) {
        errors.push({ id, report: 'members', error: err.message });
      }
    }
    done++;
    if (done % 100 === 0 || done === found.length) log.info?.(`  ${done}/${found.length}`);
    const rec = buildUikRecord({ subjectRfCode: code, ...node }, path, info, mem);
    if (!members) delete rec.members;
    return rec;
  });

  return {
    subjectRfCode: code,
    name: nodeName(root),
    complete: true,
    scrapedAt: new Date().toISOString(),
    uiks,
    errors,
  };
}
