/* Калькулятор окупаемости для палаты.

   Считает: выручку от билетов (цены за команду — из pricing.json → formats,
   со скидкой для членов палаты), взнос спонсора и стоимость программы
   (пакет, доплата за «Элиту», игры сверх пакета, опции). Итог — что остаётся
   палате. Цены берутся из той же таблицы, что и карточки на странице. */

(function () {
  'use strict';

  var MG = window.MG;
  if (!MG) return;

  var root = document.querySelector('[data-calc]');
  if (!root) return;

  var form = root.querySelector('[data-calc-form]');
  var P = MG.data.pricing;
  var FORMATS = ['start', 'growth', 'elite'];
  var money = MG.money;
  var plural = MG.plural;

  var out = {};
  Array.prototype.forEach.call(root.querySelectorAll('[data-out]'), function (el) {
    out[el.getAttribute('data-out')] = el;
  });
  var hint = root.querySelector('[data-calc-hint]');
  var sponsorLabel = root.querySelector('[data-sponsor-label]');
  var presetButtons = root.querySelectorAll('[data-preset]');

  // Примеры из концепции. «year» совпадает со значениями по умолчанию в HTML.
  var YEAR_GAMES = { start: 5, growth: 6, elite: 1 };
  var YEAR_TEAMS = { start: 12, growth: 14, elite: 7 };
  var PRESETS = {
    owners:    { pkg: 'pilot', single: 'growth', teams: { growth: 16 }, share: 0, discount: 0, sponsor: 0 },
    elite:     { pkg: 'pilot', single: 'elite', teams: { elite: 6 }, share: 0, discount: 0, sponsor: 0 },
    beginners: { pkg: 'pilot', single: 'start', teams: { start: 20 }, share: 0, discount: 0, sponsor: 0 },
    year:      { pkg: 'annual', games: YEAR_GAMES, teams: YEAR_TEAMS, share: 60, discount: 20, sponsor: 0 },
    sponsored: { pkg: 'annual', games: YEAR_GAMES, teams: YEAR_TEAMS, share: 60, discount: 20, sponsor: P.packages.annual.price }
  };

  function field(name) { return form.elements[name]; }

  function num(name, min, max) {
    var el = field(name);
    var n = Math.round(parseFloat(el && el.value));
    if (!isFinite(n)) n = 0;
    return Math.min(max, Math.max(min, n));
  }

  // «Элита», «Рост» — названия форматов в кавычках
  function q(name) { return '«' + name + '»'; }

  // «нужна 1 команда», «нужно 2 команды»
  function need_(n) { return MG.form(n, 'нужна', 'нужно', 'нужно'); }

  function applyPreset(key) {
    var p = PRESETS[key];
    if (!p) return;
    field('pkg').value = p.pkg;
    if (p.single) field('single').value = p.single;
    field('founding').checked = false;
    FORMATS.forEach(function (f) {
      if (p.games) field('games_' + f).value = p.games[f] || 0;
      if (p.teams && p.teams[f] != null) field('teams_' + f).value = p.teams[f];
    });
    field('memberShare').value = p.share;
    field('memberDiscount').value = p.discount;
    field('sponsor').value = p.sponsor;
    field('english').value = 0;
    field('inPerson').value = 0;
    Array.prototype.forEach.call(presetButtons, function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-preset') === key));
    });
    compute();
  }

  function compute() {
    var pkg = field('pkg').value || 'annual';
    var single = pkg !== 'annual';
    root.setAttribute('data-mode', single ? 'single' : 'annual');
    root.classList.toggle('calc--pilot', pkg === 'pilot');

    // Скидка действует только на команды членов палаты
    var mult = 1 - (num('memberShare', 0, 100) / 100) * (num('memberDiscount', 0, 100) / 100);
    var revenue = 0, cost = 0, games = 0, eliteGames = 0;
    var parts = [];
    var pick = field('single').value || 'growth';

    FORMATS.forEach(function (f) {
      var row = root.querySelector('[data-row="' + f + '"]');
      if (row) row.classList.toggle('calc__row--off', single && f !== pick);
    });

    if (single) {
      var teams = num('teams_' + pick, 0, 20);
      revenue = teams * P.formats[pick].ticket * mult;
      games = 1;
      eliteGames = pick === 'elite' ? 1 : 0;
      var base = pkg === 'pilot'
        ? (field('founding').checked ? P.foundingPilot : P.packages.pilot.price)
        : P.packages.signature.price;
      cost = base;
      parts.push(P.packages[pkg].name + (pkg === 'pilot' && field('founding').checked ? ' (палата-основатель)' : '') + ' ' + money(base));
      if (hint) hint.textContent = 'Одна игра в формате ' + q(P.formats[pick].name) + '.';
    } else {
      FORMATS.forEach(function (f) {
        var g = num('games_' + f, 0, 24);
        var t = num('teams_' + f, 0, 20);
        games += g;
        if (f === 'elite') eliteGames = g;
        revenue += g * t * P.formats[f].ticket * mult;
      });
      var included = P.packages.annual.games;
      cost = P.packages.annual.price;
      parts.push(P.packages.annual.name + ' ' + money(cost));
      var extra = Math.max(0, games - included);
      if (extra) {
        cost += extra * P.options.extraGame;
        parts.push(plural(extra, 'игра', 'игры', 'игр') + ' сверх пакета ' + money(extra * P.options.extraGame));
      }
      if (hint) {
        hint.textContent = games === included
          ? 'Запланировано ' + games + ' из ' + included + ' игр.'
          : games < included
            ? 'Запланировано ' + games + ' из ' + included + ' игр; не использовано: ' + (included - games) + '.'
            : plural(games, 'игра', 'игры', 'игр') + ': ' + extra + ' сверх пакета по ' + money(P.options.extraGame) + '.';
      }
    }

    if (eliteGames) {
      cost += eliteGames * P.options.elite;
      parts.push(plural(eliteGames, 'игра', 'игры', 'игр') + ' ' + q(P.formats.elite.name) + ' ' + money(eliteGames * P.options.elite));
    }

    var english = num('english', 0, games);
    var inPerson = num('inPerson', 0, games);
    if (english) {
      cost += english * P.options.english;
      parts.push(plural(english, 'игра', 'игры', 'игр') + ' на английском ' + money(english * P.options.english));
    }
    if (inPerson) {
      cost += inPerson * P.options.inPerson;
      parts.push(plural(inPerson, 'игра', 'игры', 'игр') + ' с очным ведущим ' + money(inPerson * P.options.inPerson));
    }

    var sponsor = num('sponsor', 0, 1000000000);
    var result = revenue + sponsor - cost;
    if (sponsorLabel) sponsorLabel.textContent = single ? 'Платит спонсор, ₽' : 'Платит спонсор, ₽ в год';

    out.result.textContent = (result > 0 ? '+' : '') + money(result);
    out.result.classList.toggle('plus', result >= 0);
    out.result.classList.toggle('minus', result < 0);
    out.revenue.textContent = money(revenue);
    out.sponsor.textContent = money(sponsor);
    out.cost.textContent = money(cost);
    out.breakdown.textContent = 'Стоимость: ' + parts.join(' · ');

    if (result >= 0 && sponsor >= cost) {
      out.verdict.textContent = 'Спонсор покрывает программу — каждый рубль от билетов становится вашим доходом.';
    } else if (result >= 0) {
      out.verdict.textContent = 'Программа окупается.';
    } else {
      out.verdict.textContent = 'Не хватает ' + money(-result) + ' — разницу покрывает спонсор или бюджет программы.';
    }

    // Сколько команд нужно, чтобы окупить программу без спонсора.
    // Для одной игры — в её формате; для года — одна игра «Элита» или
    // команды «Роста» в каждой игре.
    var need = cost - sponsor;
    if (need <= 0 || mult <= 0) {
      out.breakeven.textContent = '';
    } else if (single) {
      var fmt = P.formats[pick];
      var n = Math.ceil(need / (fmt.ticket * mult));
      out.breakeven.textContent = n <= 20
        ? 'Чтобы покрыть ' + money(need) + ', ' + need_(n) + ' ' + plural(n, 'команда', 'команды', 'команд') + ' в формате ' + q(fmt.name) + '.'
        : 'Одними билетами ' + q(fmt.name) + ' не покрыть ' + money(need) + ': понадобится ' +
          plural(n, 'команда', 'команды', 'команд') + ', а в игре их максимум 20. Здесь и нужен спонсор.';
    } else {
      var elite = Math.ceil(need / (P.formats.elite.ticket * mult));
      var growth = Math.ceil(need / (Math.max(games, 1) * P.formats.growth.ticket * mult));
      out.breakeven.textContent = 'Чтобы покрыть ' + money(need) + ', ' + need_(elite) + ' ' + plural(elite, 'команда', 'команды', 'команд') +
        ' ' + q(P.formats.elite.name) + ' в одной игре' +
        (growth <= 20 ? ' — или ' + plural(growth, 'команда', 'команды', 'команд') + ' ' + q(P.formats.growth.name) + ' в каждой игре' : '') + '.';
    }
  }

  Array.prototype.forEach.call(presetButtons, function (b) {
    b.addEventListener('click', function () { applyPreset(b.getAttribute('data-preset')); });
  });

  form.addEventListener('input', function () {
    Array.prototype.forEach.call(presetButtons, function (b) { b.setAttribute('aria-pressed', 'false'); });
    compute();
  });
  form.addEventListener('change', compute);
  form.addEventListener('submit', function (e) { e.preventDefault(); });

  Array.prototype.forEach.call(presetButtons, function (b) {
    b.setAttribute('aria-pressed', String(b.getAttribute('data-preset') === 'year'));
  });
  compute();
})();
