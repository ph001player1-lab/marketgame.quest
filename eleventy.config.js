// Сборка сайта. Из одного шаблона и таблицы регионов получается 83 страницы
// регионов плюс общие страницы. Руками страницы регионов никто не пишет:
// правка шаблона src/region.njk меняет их все сразу.

const rub = new Intl.NumberFormat('ru-RU', {
  style: 'currency', currency: 'RUB', maximumFractionDigits: 0
});
const num = new Intl.NumberFormat('ru-RU');

// «Каждый второй вторник», «каждую вторую среду», «каждое второе воскресенье»:
// порядковое числительное согласуется с днём недели (винительный падеж)
const WEEKDAYS = [
  ['воскресенье', 'n'], ['понедельник', 'm'], ['вторник', 'm'], ['среду', 'f'],
  ['четверг', 'm'], ['пятницу', 'f'], ['субботу', 'f']
];
const EVERY = { m: 'Каждый', f: 'Каждую', n: 'Каждое' };
const ORDINALS = {
  m: ['', 'первый', 'второй', 'третий', 'четвёртый'],
  f: ['', 'первую', 'вторую', 'третью', 'четвёртую'],
  n: ['', 'первое', 'второе', 'третье', 'четвёртое']
};

/** Форма слова для числа: 1 игра, 2 игры, 5 игр. Дробное — как «2,5 часа». */
function form(n, one, few, many) {
  n = Number(n);
  if (!Number.isInteger(n)) return few;
  const d = n % 10, dd = n % 100;
  if (d === 1 && dd !== 11) return one;
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return few;
  return many;
}

/** 1 час, 2 часа, 5 часов; дробное — «2,5 часа». */
function hours(h) {
  return `${String(h).replace('.', ',')} ${form(h, 'час', 'часа', 'часов')}`;
}

export default function (cfg) {
  cfg.addPassthroughCopy({ 'src/assets': 'assets' });
  cfg.addPassthroughCopy({ 'src/static': '/' });

  // 20 000 ₽ — цены на сайте всегда без копеек
  cfg.addFilter('rub', (n) => rub.format(Number(n) || 0));
  cfg.addFilter('num', (n) => num.format(Number(n) || 0));

  // JSON внутри <script>: «<» экранируем, иначе строка «</script>»
  // в данных закрыла бы тег раньше времени
  cfg.addFilter('jsonScript', (value) =>
    JSON.stringify(value).replace(/</g, '\\u003c'));

  // «Каждый второй вторник месяца, 19:00» — правило открытой игры словами,
  // для тех, у кого не работает JavaScript, и для поисковиков
  cfg.addFilter('gameRule', (game) => {
    const [day, g] = WEEKDAYS[game.weekday];
    return `${EVERY[g]} ${ORDINALS[g][game.nth]} ${day} месяца, ${game.time}`;
  });

  // 2.5 → «2,5 часа», 2 → «2 часа», 5 → «5 часов»
  cfg.addFilter('hours', hours);

  // «Московское время (МСК)» → «московское время (МСК)»: только первая буква
  cfg.addFilter('lcfirst', (t) => String(t || '').charAt(0).toLowerCase() + String(t || '').slice(1));

  // {{ 12 | plural('игра', 'игры', 'игр') }} → «12 игр»
  cfg.addFilter('plural', (n, one, few, many) => `${n} ${form(n, one, few, many)}`);
}

export const config = {
  dir: {
    input: 'src',
    includes: '_includes',
    data: '_data',
    output: '_site'
  },
  templateFormats: ['njk'],
  htmlTemplateEngine: 'njk'
};
