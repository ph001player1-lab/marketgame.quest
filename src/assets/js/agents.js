/* Страница /agents/: вакансия «Агент по распространению B2B-продукта»,
   калькулятор дохода агента (процент с выручки, процент с продлений и
   плата за игры в роли ведущего), карта продаж на 90 дней, плейбук по
   профилям и форма отклика.

   Условия, сценарий по умолчанию и допущения воронки лежат в самой
   странице блоком <script id="mg-agents"> (src/_data/agents.js), цены
   программ — в общем блоке mg-data (pricing.json).

   Отклик уходит тем же обработчиком, что и заявки на демо
   (apps-script/Code.gs), с типом agent_application. */

(function () {
  'use strict';

  var MG = window.MG;
  var node = document.getElementById('mg-agents');
  if (!MG || !node) return;

  var A;
  try { A = JSON.parse(node.textContent); } catch (e) { return; }

  var doc = document;
  var P = MG.data.pricing;
  var money = MG.money;
  var plural = MG.plural;
  var each = function (list, fn) { Array.prototype.forEach.call(list, fn); };

  function num(input, min, max) {
    var n = Math.round(parseFloat(input && input.value));
    if (!isFinite(n)) n = 0;
    return Math.min(max, Math.max(min, n));
  }

  // --- калькулятор дохода агента -------------------------------------------

  var calc = doc.querySelector('[data-ecalc]');
  var cform = calc && calc.querySelector('[data-ecalc-form]');
  var out = {};
  var presetBtn = calc && calc.querySelector('[data-preset]');
  var T = A.terms.agent;

  if (calc) {
    each(calc.querySelectorAll('[data-out]'), function (el) { out[el.getAttribute('data-out')] = el; });
  }

  var PRICE = {
    pilot: P.packages.pilot.price,
    signature: P.packages.signature.price,
    annual: P.packages.annual.price,
    bank: P.bank.volumePrice
  };
  var MONTHS = 3;

  function values() {
    var f = cform.elements;
    return {
      pilot: num(f.pilot, 0, 999),
      signature: num(f.signature, 0, 999),
      annual: num(f.annual, 0, 999),
      bank: num(f.bank, 0, 99),
      bankChambers: num(f.bankChambers, P.bank.volumeFrom, 200),
      hosted: num(f.hosted, 0, 999),
      renew: num(f.renew, 0, 100)
    };
  }

  function isDefault(v) {
    return Object.keys(A.defaults).every(function (k) { return v[k] === A.defaults[k]; });
  }

  function render() {
    var v = values();

    var bankValue = v.bank * v.bankChambers * PRICE.bank;
    var value = v.pilot * PRICE.pilot + v.signature * PRICE.signature + v.annual * PRICE.annual + bankValue;
    // Годовые контракты, которые могут продлиться: годовые программы и банки
    var yearly = v.annual * PRICE.annual + bankValue;
    var sales = v.pilot + v.signature + v.annual + v.bank;

    var commission = value * T.rate;
    var hosting = v.hosted * T.perGame;
    var quarter = commission + hosting;
    // Второй год: процент с продлений контрактов, проданных за первые
    // 12 месяцев (те же продажи каждые 90 дней)
    var year2 = yearly * 4 * T.renewalRate * v.renew / 100;

    out.quarter.textContent = money(quarter);
    out.commission.textContent = money(commission);
    out.hosting.textContent = money(hosting);
    out.month.textContent = money(quarter / MONTHS);
    out.year2.textContent = money(year2);

    var verdict = plural(sales, 'продажа', 'продажи', 'продаж') + ' — контракты на ' + money(value) + '.';
    if (v.hosted) verdict += ' Плюс ' + plural(v.hosted, 'игра', 'игры', 'игр') + ' в роли ведущего.';
    out.verdict.textContent = verdict;

    out.year2note.textContent = yearly
      ? Math.round(T.renewalRate * 100) + '% с продлений за год, если продлится ' + v.renew + '% годовых контрактов'
      : 'Продлеваются годовые программы и спонсорство банков, разовые игры — нет';

    if (presetBtn) presetBtn.setAttribute('aria-pressed', isDefault(v) ? 'true' : 'false');
  }

  function applyDefaults() {
    var f = cform.elements;
    Object.keys(A.defaults).forEach(function (k) { if (f[k]) f[k].value = A.defaults[k]; });
    render();
  }

  if (calc) {
    cform.addEventListener('input', render);
    cform.addEventListener('submit', function (e) { e.preventDefault(); });
    // Поле «сообществ на банк» не может быть меньше минимума программы банка
    cform.elements.bankChambers.addEventListener('change', function () {
      this.value = values().bankChambers;
      render();
    });
    if (presetBtn) presetBtn.addEventListener('click', applyDefaults);
    render();
  }

  // --- карта продаж: воронка назад от цели ----------------------------------

  var funnel = doc.querySelector('[data-funnel]');
  if (funnel) {
    var fform = funnel.querySelector('[data-funnel-form]');
    var F = {};
    each(funnel.querySelectorAll('[data-f]'), function (el) { F[el.getAttribute('data-f')] = el; });
    var bars = {};
    each(funnel.querySelectorAll('[data-f-bar]'), function (el) { bars[el.getAttribute('data-f-bar')] = el; });
    var weeks = A.funnel.days / 7;

    var drawFunnel = function () {
      var goal = num(fform.elements.goal, 1, 500);
      var toDemo = num(fform.elements.toDemo, 1, 100);
      var toSale = num(fform.elements.toSale, 1, 100);
      // Сначала демо-игры, потом контакты — оба числа округляем вверх
      var demos = Math.ceil(goal / (toSale / 100) - 1e-9);
      var contacts = Math.ceil(demos / (toDemo / 100) - 1e-9);

      F.goal.textContent = goal;
      F.demos.textContent = demos;
      F.contacts.textContent = contacts;
      F.toDemo.textContent = toDemo;
      F.toSale.textContent = toSale;
      F.contactsWeek.textContent = 'около ' + Math.round(contacts / weeks) + ' в неделю';
      F.demosWeek.textContent = 'около ' + String(Math.round(demos / weeks * 10) / 10).replace('.', ',') + ' в неделю';
      bars.demos.style.width = (demos / contacts * 100) + '%';
      bars.goal.style.width = (goal / contacts * 100) + '%';
    };
    fform.addEventListener('input', drawFunnel);
    fform.addEventListener('submit', function (e) { e.preventDefault(); });
    drawFunnel();
  }

  // --- плейбук: шаги для выбранного профиля ---------------------------------

  var pbRadios = doc.querySelectorAll('input[name="pb"]');
  var pbBlocks = doc.querySelectorAll('[data-pb]');

  function showProfile(key) {
    each(pbRadios, function (r) { r.checked = r.value === key; });
    each(pbBlocks, function (b) { b.hidden = b.getAttribute('data-pb') !== key; });
  }

  if (pbRadios.length) {
    each(pbRadios, function (r) { r.addEventListener('change', function () { showProfile(r.value); }); });
    var firstPb = doc.querySelector('input[name="pb"]:checked');
    showProfile(firstPb ? firstPb.value : pbRadios[0].value);
  }

  // --- форма заявки ----------------------------------------------------------

  var form = doc.querySelector('[data-apply]');
  var statusBox, submitBtn, openedAt = Date.now(), detectedTz = '';

  function setStatus(text, kind, html) {
    statusBox.className = 'lf__status' + (kind ? ' lf__status--' + kind : '');
    if (html) statusBox.innerHTML = html; else statusBox.textContent = text;
  }

  function toggleExtras() {
    var f = form.elements;
    form.querySelector('[data-ap-country]').hidden = f.region.value !== 'INTL';
    var member = form.querySelector('input[name="member"]:checked');
    form.querySelector('[data-ap-chambers]').hidden = !member || member.value !== 'yes';
  }

  function prefill() {
    var f = form.elements;
    var d = MG.detect();
    var profile = MG.profile() || {};
    detectedTz = d.tz || '';
    if (d.group) f.tz.value = d.group;
    else if (d.known && !d.home) f.tz.value = 'other';
    var st = profile.region || d.region;
    if (st) f.region.value = st;
    else if (d.known && !d.home) f.region.value = 'INTL';
    toggleExtras();
  }

  function bad(input, message) {
    var row = input.closest('.lf__row');
    if (row) row.classList.add('lf__row--bad');
    setStatus(message, 'bad');
    if (input.focus) input.focus();
    return null;
  }

  function selectedText(select) {
    var o = select.options[select.selectedIndex];
    return o && o.value ? o.textContent.trim() : '';
  }

  function validate() {
    each(form.querySelectorAll('.lf__row--bad'), function (r) { r.classList.remove('lf__row--bad'); });
    var f = form.elements;
    var email = f.email.value.trim();

    if (!f.name.value.trim()) return bad(f.name, 'Пожалуйста, укажите имя.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return bad(f.email, 'Проверьте адрес электронной почты.');
    if (!f.consent.checked) {
      setStatus('Пожалуйста, подтвердите согласие на обработку персональных данных.', 'bad');
      f.consent.focus();
      return null;
    }

    var region = f.region.value === 'INTL'
      ? 'За пределами России' + (f.country.value.trim() ? ': ' + f.country.value.trim() : '')
      : selectedText(f.region);
    var tz = f.tz.value === 'other'
      ? 'За пределами России' + (detectedTz ? ' (' + detectedTz + ')' : '')
      : selectedText(f.tz);
    var member = form.querySelector('input[name="member"]:checked');
    var chambers = !member ? '' : member.value === 'yes'
      ? 'Да' + (f.chambers.value.trim() ? ': ' + f.chambers.value.trim() : '')
      : 'Нет';
    var orgs = Array.prototype.filter.call(form.querySelectorAll('input[name="orgs"]'), function (c) {
      return c.checked;
    }).map(function (c) { return c.value; }).join(', ');

    return {
      type: 'agent_application',
      role: f.role.value,
      name: f.name.value.trim(),
      email: email,
      phone: f.phone.value.trim(),
      city: f.city.value.trim(),
      region: region,
      tz: tz,
      profile: selectedText(f.profile),
      sells: f.sells.value.trim(),
      orgs: orgs,
      chambers: chambers,
      resume: f.resume.value.trim(),
      source: selectedText(f.source),
      message: f.message.value.trim(),
      website: f.website.value,
      elapsed: Date.now() - openedAt,
      page: location.href,
      referrer: doc.referrer,
      utm: location.search.replace(/^\?/, '')
    };
  }

  function done() {
    var box = doc.createElement('div');
    box.className = 'lf__done';
    box.setAttribute('tabindex', '-1');
    box.innerHTML = '<h3>Отклик получен</h3>' +
      '<p>Спасибо! Мы читаем каждый отклик и ответим вам по почте.</p>';
    form.hidden = true;
    form.parentNode.insertBefore(box, form.nextSibling);
    box.focus();
  }

  function fail() {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Отправить отклик';
    var email = (MG.data.contact || {}).email;
    setStatus('', 'bad', 'Отклик не отправился.' +
      (email ? ' Напишите нам напрямую: <a href="mailto:' + MG.esc(email) + '">' + MG.esc(email) + '</a>.' : ''));
  }

  function submit(event) {
    event.preventDefault();
    var payload = validate();
    if (!payload) return;
    if (!MG.data.endpoint) { fail(); return; }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Отправляем…';
    setStatus('', '');

    // text/plain — «простой» запрос без OPTIONS, как у формы демо-игры
    fetch(MG.data.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      keepalive: true
    })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('http ' + r.status)); })
      .then(function (res) {
        if (!res || res.status !== 'ok') throw new Error('backend');
        done();
      })
      .catch(fail);
  }

  if (form) {
    statusBox = form.querySelector('.lf__status');
    submitBtn = form.querySelector('button[type="submit"]');
    form.addEventListener('submit', submit);
    form.addEventListener('change', toggleExtras);
    prefill();
  }

  // --- кнопки «Откликнуться с этим профилем» --------------------------------

  doc.addEventListener('click', function (event) {
    var el = event.target.closest('[data-apply-profile]');
    if (el && form) form.elements.profile.value = el.getAttribute('data-apply-profile');
  });
})();
