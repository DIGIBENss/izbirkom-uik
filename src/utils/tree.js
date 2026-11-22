/**
 * Работа с деревом комиссий, которое отдаёт /commissionOrg.
 *
 * Узел дерева (как его видит фронтенд izbirkom.ru):
 *   { externalId, parentId, commissionName, commissionNumber, commissionType,
 *     subjectRfCode, hasChildren, children: [...] }
 */

/** Типы комиссий (enum из фронтенда izbirkom.ru). */
export const CommissionType = Object.freeze({
  CIK: 1,
  IKSRF: 2,
  OIK: 3,
  TIK: 4,
  UIK: 5,
});

export const TYPE_LABELS = Object.freeze({
  1: 'ЦИК',
  2: 'ИКСРФ',
  3: 'ОИК',
  4: 'ТИК',
  5: 'УИК',
});

export function nodeType(node) {
  const t = Number(node?.commissionType ?? node?.type);
  return Number.isFinite(t) ? t : null;
}

export function isUik(node) {
  return nodeType(node) === CommissionType.UIK;
}

export function nodeId(node) {
  return node?.externalId ?? node?.id ?? null;
}

export function nodeName(node) {
  return node?.commissionName ?? node?.name ?? '';
}

/** Узел обещает детей, но они не пришли (ленивая подгрузка). */
export function needsChildren(node) {
  return Boolean(node?.hasChildren) && !(Array.isArray(node.children) && node.children.length);
}

/**
 * Обход в глубину. Колбэк получает узел и путь от корня (массив предков).
 */
export function walk(root, visit, path = []) {
  if (!root) return;
  visit(root, path);
  const kids = Array.isArray(root.children) ? root.children : [];
  const next = [...path, root];
  for (const child of kids) walk(child, visit, next);
}

/** Краткое описание предка для записи в JSON. */
export function describeAncestor(node) {
  const t = nodeType(node);
  return {
    id: nodeId(node),
    type: TYPE_LABELS[t] ?? t,
    name: nodeName(node),
  };
}

/**
 * Собирает все УИК из дерева: [{ node, path }].
 */
export function collectUiks(root) {
  const out = [];
  walk(root, (node, path) => {
    if (isUik(node)) out.push({ node, path });
  });
  return out;
}

/** Узлы, у которых дети не подгружены (нужно дозапросить /commissionOrg/{id}). */
export function collectLazyNodes(root) {
  const out = [];
  walk(root, (node) => {
    if (!isUik(node) && needsChildren(node)) out.push(node);
  });
  return out;
}
