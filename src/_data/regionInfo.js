// Сводка по каждому региону для шаблонов: палаты, палата-основатель,
// банковский партнёр, часовой пояс словами и можно ли индексировать страницу.
// chambers.json и banks.json пишет scripts/sync-sheet.mjs из таблицы продаж.

import fs from 'node:fs';

const load = (name) =>
  JSON.parse(fs.readFileSync(new URL(`./${name}.json`, import.meta.url), 'utf8'));

export default function regionInfo() {
  const regions = load('regions');
  const zones = load('zones');
  const chambers = load('chambers').regions || {};
  const banks = load('banks').regions || {};
  const info = {};

  for (const s of regions) {
    const c = chambers[s.abbr] || {};
    const list = Array.isArray(c.chambers) ? c.chambers : [];
    const b = banks[s.abbr] || {};

    info[s.abbr] = {
      chambers: list,
      // private — договор подписан, но палата не разрешила называть себя
      active: list.filter((x) => ['active', 'founding', 'private'].includes(x.status)).length,
      founding: c.founding || { taken: false, name: null },
      bank: {
        status: b.status || 'open',          // open | partner | exclusive
        name: b.name || null,                // только если банк согласился на упоминание
        metros: Array.isArray(b.metros) ? b.metros : []
      },
      zone: zones[s.group],
      // Пока у региона нет ни статистики, ни списка палат, его страница почти
      // не отличается от соседних. Такие страницы закрываем от индексации,
      // чтобы поисковики не сочли их дорвеями; с данными они откроются сами.
      indexable: Boolean(s.stats) || list.length > 0
    };
  }
  return info;
}
