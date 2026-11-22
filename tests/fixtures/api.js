/**
 * Фикстуры в формате ответов API apps.cikrf.ru (поля взяты из кода фронтенда izbirkom.ru).
 * Дерево: ИКСРФ → ТИК-1 (2 УИК) + ТИК-2 (дети подгружаются лениво, 1 УИК).
 */
export const tree01 = {
  externalId: 'iksrf-01',
  commissionName: 'Центральная избирательная комиссия Республики Адыгея',
  commissionType: '2',
  subjectRfCode: '01',
  hasChildren: true,
  children: [
    {
      externalId: 'tik-1',
      parentId: 'iksrf-01',
      commissionName: 'Майкопская городская ТИК',
      commissionType: '4',
      hasChildren: true,
      children: [
        { externalId: 'uik-1', parentId: 'tik-1', commissionName: 'УИК №1', commissionNumber: 1, commissionType: '5', hasChildren: false },
        { externalId: 'uik-2', parentId: 'tik-1', commissionName: 'УИК №2', commissionNumber: 2, commissionType: '5', hasChildren: false },
      ],
    },
    {
      externalId: 'tik-2',
      parentId: 'iksrf-01',
      commissionName: 'Гиагинская районная ТИК',
      commissionType: '4',
      hasChildren: true,
      children: [],
    },
  ],
};

export const lazyTik2 = {
  externalId: 'tik-2',
  commissionName: 'Гиагинская районная ТИК',
  commissionType: '4',
  children: [
    { externalId: 'uik-3', parentId: 'tik-2', commissionName: 'УИК №3', commissionNumber: 3, commissionType: '5' },
  ],
};

/** Карточка УИК — плоский ответ /commissionOrg/{id} (формат снят с реального API). */
export const info = (id) => ({
  id: 452989253,
  externalId: id,
  parentId: 452989089,
  commissionName: `Участковая избирательная комиссия ${id}`,
  locality: 'Республика Адыгея, г.Майкоп',
  customAddress: 'ул.Пионерская, 199',
  postCode: '385000',
  commissionGeoLocation: { latitude: '44.6098', longitude: '40.1006' },
  phone: '8(8772)52-30-35',
  commissionAddress: '  385000, Республика Адыгея,  г.Майкоп, ул.Пионерская, 199 ',
  votingRoomLocality: 'Республика Адыгея, г.Майкоп',
  votingRoomPostCode: '385000',
  votingRoomPhone: '8(8772)52-00-00',
  votingRoomGeoLocation: { latitude: '44.61', longitude: '40.1' },
  votingRoomAddress: '385000, г.Майкоп, ул.Пионерская, 199, школа №1',
  assumeEndDate: '2028-06-01',
  commissionNumber: 1,
  commissionType: '5',
});

export const members = () => ({
  createdAt: '2026-11-02T10:00:00',
  body: {
    votingRoom: 'Актовый зал',
    commissionMembers: [
      { number: 2, fio: 'Петров Пётр Петрович', positionTypeName: 'Заместитель председателя', positionLevel: 2, nominationParty: 'собрание избирателей' },
      { number: 1, fio: 'Иванов Иван Иванович', positionTypeName: 'Председатель', positionLevel: 1, nominationParty: 'ВПП «Пример»' },
    ],
  },
});

/** Заглушка транспорта: тот же интерфейс, что у BrowserSession. */
export function fakeTransport({ failInfoFor = [] } = {}) {
  const calls = [];
  return {
    calls,
    async apiGet(path) {
      calls.push(path);
      if (path === '/commissionOrg?subjectRfCode=01') return structuredClone(tree01);
      if (path === '/commissionOrg?subjectRfCode=99') return null;
      if (path === '/commissionOrg/tik-2') return structuredClone(lazyTik2);
      let m = path.match(/^\/commissionOrg\/(uik-.+)$/);
      if (m) {
        if (failInfoFor.includes(m[1])) {
          const e = new Error('HTTP 400 bad'); e.status = 400; throw e;
        }
        return info(m[1]);
      }
      m = path.match(/^\/reports\/42\?commissionOrgId=(.+)$/);
      if (m) return members();
      throw new Error(`unexpected path ${path}`);
    },
  };
}
