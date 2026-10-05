/* Документы для печати и сохранения в PDF: /print/brief/, /print/prospectus/,
   /print/bank/.

   Поля на панели сверху (название палаты, спонсор, регион, контакт)
   подставляются в документ сразу при вводе и сохраняются в адресе
   страницы — такую ссылку можно переслать коллеге. Кнопка «Сохранить в PDF»
   открывает окно печати браузера, где нужно выбрать «Сохранить как PDF». */

(function () {
  'use strict';

  var node = document.getElementById('mg-data');
  var D = {};
  try { D = JSON.parse(node.textContent); } catch (e) { D = {}; }

  var byAbbr = {};
  (D.regions || []).forEach(function (s) { byAbbr[s.abbr] = s; });

  var params = new URLSearchParams(location.search);
  var saved = null;
  try { saved = JSON.parse(localStorage.getItem('mg.profile')); } catch (e) { saved = null; }

  var values = {};
  var inputs = document.querySelectorAll('[data-input]');
  Array.prototype.forEach.call(inputs, function (el) {
    var key = el.getAttribute('data-input');
    var v = params.get(key) || '';
    if (key === 'region') v = (v || (saved && saved.region) || '').toUpperCase();
    values[key] = v;
    el.value = v;
    el.addEventListener('input', function () { values[key] = el.value.trim(); update(); remember(); });
    el.addEventListener('change', function () { values[key] = el.value.trim(); update(); remember(); });
  });

  function money(n) {
    return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(n);
  }

  // «в Москве» → «В Москве» для заголовка
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }

  function derived() {
    var s = byAbbr[values.region];
    var d = {};
    Object.keys(values).forEach(function (k) { d[k] = values[k]; });
    if (s) {
      d.regionName = s.name;
      d.regionIn = cap(s.in);
      d.regionSlug = s.slug;
      d.zone = (D.zones || {})[s.group] || '';
      d.founding = s.f ? 'Занято' : 'Свободно — пробная игра за ' + money((D.pricing || {}).foundingPilot || 0);
      d.bank = s.b === 'open' ? 'Свободно' : (s.bn || 'Есть');
      d.active = String(s.a || 0);
    }
    // Строка про цену для палаты-основателя нужна, пока место в регионе
    // не занято (или регион не выбран)
    d['founding-open'] = !s || !s.f ? 'yes' : '';
    return d;
  }

  function update() {
    var d = derived();
    Array.prototype.forEach.call(document.querySelectorAll('[data-fill]'), function (el) {
      var v = d[el.getAttribute('data-fill')];
      el.textContent = v || el.getAttribute('data-empty') || '';
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-show-if]'), function (el) {
      el.hidden = !d[el.getAttribute('data-show-if')];
    });
  }

  function remember() {
    var q = new URLSearchParams();
    Object.keys(values).forEach(function (k) { if (values[k]) q.set(k, values[k]); });
    var qs = q.toString();
    history.replaceState(null, '', location.pathname + (qs ? '?' + qs : ''));
  }

  var save = document.querySelector('[data-save]');
  if (save) save.addEventListener('click', function () { window.print(); });

  update();
})();
