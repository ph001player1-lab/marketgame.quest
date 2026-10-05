/* Общие данные и помощники для остальных скриптов сайта.

   Всё, что нужно браузеру — цены, регионы, расписание, адрес приёма заявок, —
   лежит в самой странице блоком <script id="mg-data">. Его собирает
   src/_data/client.js из тех же файлов, что и шаблоны, поэтому цифры
   на странице и в скриптах не могут разойтись.

   Выбор посетителя («кто вы», регион, рынки) хранится в localStorage
   под ключом mg.profile — только в его браузере, на сервер не уходит. */

(function () {
  'use strict';

  var node = document.getElementById('mg-data');
  var D = {};
  try { D = node ? JSON.parse(node.textContent) : {}; } catch (e) { D = {}; }

  var byAbbr = {};
  (D.regions || []).forEach(function (s) { byAbbr[s.abbr] = s; });

  var KEY = 'mg.profile';

  function readProfile() {
    try {
      var p = JSON.parse(localStorage.getItem(KEY));
      return p && typeof p === 'object' ? p : null;
    } catch (e) { return null; }
  }

  function saveProfile(p) {
    try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { /* приватный режим */ }
  }

  // --- часовые пояса -----------------------------------------------------
  // Браузер не знает, в каком регионе человек, но знает его часовой пояс.
  // По поясу почти всегда видно, Россия это или нет, а у многих регионов
  // пояс свой собственный — там регион определяется сразу.

  var GROUP = {};
  function zones(group, list) { list.forEach(function (z) { GROUP[z] = group; }); }
  zones('MSK-1', ['Europe/Kaliningrad']);
  zones('MSK', ['Europe/Moscow', 'Europe/Kirov', 'Europe/Volgograd', 'W-SU']);
  zones('MSK+1', ['Europe/Samara', 'Europe/Ulyanovsk', 'Europe/Saratov', 'Europe/Astrakhan']);
  zones('MSK+2', ['Asia/Yekaterinburg']);
  zones('MSK+3', ['Asia/Omsk']);
  zones('MSK+4', ['Asia/Novosibirsk', 'Asia/Tomsk', 'Asia/Novokuznetsk', 'Asia/Barnaul', 'Asia/Krasnoyarsk']);
  zones('MSK+5', ['Asia/Irkutsk']);
  zones('MSK+6', ['Asia/Chita', 'Asia/Yakutsk', 'Asia/Khandyga']);
  zones('MSK+7', ['Asia/Vladivostok', 'Asia/Ust-Nera']);
  zones('MSK+8', ['Asia/Magadan', 'Asia/Sakhalin', 'Asia/Srednekolymsk']);
  zones('MSK+9', ['Asia/Kamchatka', 'Asia/Anadyr']);

  // Пояса, которые носит только один регион
  var REGION_BY_ZONE = {
    'Europe/Kaliningrad': 'KGD', 'Europe/Kirov': 'KIR', 'Europe/Volgograd': 'VGG',
    'Europe/Ulyanovsk': 'ULY', 'Europe/Saratov': 'SAR', 'Europe/Astrakhan': 'AST',
    'Asia/Omsk': 'OMS', 'Asia/Novosibirsk': 'NVS', 'Asia/Tomsk': 'TOM', 'Asia/Novokuznetsk': 'KEM',
    'Asia/Chita': 'ZAB', 'Asia/Khandyga': 'SA', 'Asia/Ust-Nera': 'SA', 'Asia/Srednekolymsk': 'SA',
    'Asia/Magadan': 'MAG', 'Asia/Sakhalin': 'SAK', 'Asia/Kamchatka': 'KAM', 'Asia/Anadyr': 'CHU'
  };

  // Пояса, по которым не делаем никаких выводов: посетитель выбирает сам
  var NO_GUESS = ['Europe/Simferopol'];

  function detect() {
    var tz = '';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { tz = ''; }
    if (NO_GUESS.indexOf(tz) !== -1) tz = '';
    var group = GROUP[tz] || null;
    return {
      tz: tz,
      known: !!tz,
      home: !!group,
      group: group,
      region: REGION_BY_ZONE[tz] || null
    };
  }

  // --- форматирование ------------------------------------------------------

  var rub = new Intl.NumberFormat('ru-RU', {
    style: 'currency', currency: 'RUB', maximumFractionDigits: 0
  });

  function money(n) {
    var v = Math.round(Number(n) || 0);
    return (v < 0 ? '−' : '') + rub.format(Math.abs(v));
  }

  /** Форма слова для числа: form(5, 'игра', 'игры', 'игр') → «игр». */
  function form(n, one, few, many) {
    n = Math.abs(Number(n) || 0);
    if (n % 1) return few;
    var d = n % 10, dd = n % 100;
    if (d === 1 && dd !== 11) return one;
    if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return few;
    return many;
  }

  /** plural(5, 'игра', 'игры', 'игр') → «5 игр». */
  function plural(n, one, few, many) { return n + ' ' + form(n, one, few, many); }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  window.MG = {
    data: D,
    region: function (abbr) { return byAbbr[abbr] || null; },
    profile: readProfile,
    saveProfile: saveProfile,
    detect: detect,
    money: money,
    form: form,
    plural: plural,
    esc: esc
  };
})();
