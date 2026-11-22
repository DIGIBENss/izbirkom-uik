import { describeAncestor, nodeId, nodeName, nodeType, CommissionType } from './tree.js';

/** Ответ /reports/{n} обычно имеет вид { createdAt, body: {...} }. */
export function unwrapReport(report) {
  if (!report || typeof report !== 'object') return {};
  const body = report.body && typeof report.body === 'object' ? report.body : report;
  return { ...body, createdAt: report.createdAt ?? body.createdAt ?? null };
}

const clean = (v) => {
  if (v === undefined || v === null) return null;
  if (typeof v === 'string') {
    const s = v.replace(/\s+/g, ' ').trim();
    return s === '' ? null : s;
  }
  return v;
};

export function normalizeGeo(geo) {
  if (!geo || typeof geo !== 'object') return null;
  const lat = Number(geo.latitude ?? geo.lat);
  const lon = Number(geo.longitude ?? geo.lon ?? geo.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

export function normalizeMember(m) {
  return {
    number: m.number ?? null,
    fio: clean(m.fio),
    position: clean(m.positionTypeName),
    positionLevel: m.positionLevel ?? null,
    nominatedBy: clean(m.nominationParty),
  };
}

/**
 * Собирает итоговую запись УИК.
 * @param {object} node     узел дерева
 * @param {object[]} path   предки (ЦИК → ИКСРФ → ТИК ...)
 * @param {object|null} infoReport    карточка комиссии: ответ /commissionOrg/{id}
 * @param {object|null} membersReport ответ /reports/42
 */
export function buildUikRecord(node, path, infoReport, membersReport) {
  const info = unwrapReport(infoReport);
  const mem = unwrapReport(membersReport);
  const ancestors = path.map(describeAncestor);
  const tik = [...path].reverse().find((p) => nodeType(p) === CommissionType.TIK);
  const members = Array.isArray(mem.commissionMembers)
    ? mem.commissionMembers.map(normalizeMember).sort((a, b) => (a.number ?? 0) - (b.number ?? 0))
    : null;

  return {
    id: nodeId(node),
    numericId: info.id ?? node.id ?? null,
    number: clean(String(node.commissionNumber ?? node.number ?? '')) ?? null,
    name: clean(info.commissionName) ?? clean(nodeName(node)),
    subjectRfCode: node.subjectRfCode ?? null,
    region: ancestors.find((a) => a.type === 'ИКСРФ')?.name ?? null,
    tik: tik ? describeAncestor(tik) : null,
    address: clean(info.commissionAddress),
    postCode: clean(info.postCode),
    locality: clean(info.locality),
    phone: clean(info.phone),
    fax: clean(info.telefax),
    votingRoom: {
      address: clean(info.votingRoomAddress),
      phone: clean(info.votingRoomPhone),
      postCode: clean(info.votingRoomPostCode),
      locality: clean(info.votingRoomLocality),
      geo: normalizeGeo(info.votingRoomGeoLocation),
      description: clean(mem.votingRoom ?? info.votingRoom),
    },
    geo: normalizeGeo(info.commissionGeoLocation),
    termEndDate: clean(info.assumeEndDate),
    extendedUntil: clean(info.extendedUntil),
    members,
    path: ancestors,
    updatedAt: info.createdAt ?? mem.createdAt ?? null,
  };
}
