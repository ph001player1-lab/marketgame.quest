// Данные для CRM (/crm/): адрес скрипта, прайс для выпадающего списка оплат
// и регионы с часовыми поясами. Попадают на страницу блоком
// <script id="crm-data" type="application/json">. Цены — из pricing.json,
// поэтому прайс в CRM всегда совпадает с сайтом.

import fs from 'node:fs';

const load = (name) =>
  JSON.parse(fs.readFileSync(new URL(`./${name}.json`, import.meta.url), 'utf8'));

export default function crm() {
  const site = load('site');
  const pricing = load('pricing');
  const regions = load('regions');
  const P = pricing.packages;
  const O = pricing.options;

  return {
    endpoint: site.formEndpoint,
    inPerson: O.inPerson,
    // stage — какой этап клиента открывает оплата; null — не меняет этап
    prices: [
      { id: 'pilot', name: P.pilot.name, amount: P.pilot.price, stage: 'pilot' },
      { id: 'pilotF', name: `${P.pilot.name} — эксклюзивный партнёр региона`, amount: pricing.foundingPilot, stage: 'pilot' },
      { id: 'single', name: P.signature.name, amount: P.signature.price, stage: 'single' },
      { id: 'annual', name: `${P.annual.name}, ${P.annual.games} игр`, amount: P.annual.price, stage: 'annual' },
      { id: 'bank', name: `Программа банка от ${pricing.bank.volumeFrom} сообществ, за сообщество в год`, amount: pricing.bank.volumePrice, stage: 'annual' },
      { id: 'extra', name: 'Дополнительная игра', amount: O.extraGame, stage: null },
      { id: 'inPerson', name: 'Опция: ведущий на месте', amount: O.inPerson, stage: null },
      { id: 'english', name: 'Опция: игра на английском', amount: O.english, stage: null },
      { id: 'elite', name: 'Опция: формат «Элита»', amount: O.elite, stage: null },
      { id: 'custom', name: 'Другая сумма — нестандартный договор', amount: null, stage: null }
    ],
    regions: regions.map((r) => [r.name, r.group])
  };
}
