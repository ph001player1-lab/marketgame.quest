/* Страница /agents/: калькулятор дохода агента, карта продаж на 90 дней,
   плейбук по профилям и форма отклика «Станьте агентом Market Game».

   Условия ролей, сценарий по умолчанию и допущения воронки лежат в самой
   странице блоком <script id="mg-agents"> (src/_data/agents.js), цены
   программ — в общем блоке mg-data (pricing.json).

   Заявка уходит тем же обработчиком, что и заявки на демо
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

  // --- калькулятор дохода --------------------------------------------------

  var calc = doc.querySelector('[data-ecalc]');
  var cform = calc && calc.querySelector('[data-ecalc-form]');
  var out = {};
  var presetBtn = calc && calc.querySelector('[data-preset]');

  if (calc) {
    each(calc.querySelectorAll('[data-out]'), function (el) { out[el.getAttribute('data-out')] = el; });
  }

  var PRICE = {
    pilot: P.packages.pilot.price,
    signature: P.packages.signature.price,
    annual: P.packages.annual.price,
    bank: P.bank.volumePrice
  };
  // Игры за 90 дней: пилот и Signature — по одной, годовая программа —
  // одна в месяц, программа банка — одна в месяц в каждой палате
  var MONTHS = 3;
  var SALES = ['pilot', 'signature', 'annual', 'bank'];

  function role() {
    var r = calc.querySelector('input[name="calcRole"]:checked');
    return r ? r.value : 'agent';
  }

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
    var r = role();
    var v = values();
    var t = A.terms[r];
    calc.setAttribute('data-role', r);

    var bankValue = v.bank * v.bankChambers * PRICE.bank;
    var value = v.pilot * PRICE.pilot + v.signature * PRICE.signature + v.annual * PRICE.annual + bankValue;
    // Годовые контракты, которые могут продлиться: годовые программы и банки
    var yearly = v.annual * PRICE.annual + bankValue;
    var sales = v.pilot + v.signature + v.annual + v.bank;
    var games = v.pilot + v.signature + (v.annual + v.bank * v.bankChambers) * MONTHS;

    var commission = value * t.rate;
    var hosting = r === 'agent' ? v.hosted * t.perGame : 0;
    var retainer = r === 'ae' ? t.retainer * MONTHS : 0;
    var quarter = commission + hosting + retainer;
    var year = (commission + hosting) * 4 + (r === 'ae' ? t.retainer * 12 : 0);
    var renewalRate = r === 'agent' ? t.renewalRate : t.rate;
    var year2 = yearly * 4 * renewalRate * v.renew / 100;

    out.quarter.textContent = money(quarter);
    out.commission.textContent = money(commission);
    out.rate.textContent = Math.round(t.rate * 100) + '%';
    out.hosting.textContent = money(hosting);
    out.retainer.textContent = money(retainer);
    out.year.textContent = money(year);
    out.year2.textContent = money(year2);

    var verdict = plural(sales, 'продажа', 'продажи', 'продаж') + ' — контракты на ' + money(value) + '.';
    if (r === 'agent' && v.hosted) verdict += ' Плюс ' + plural(v.hosted, 'игра', 'игры', 'игр') + ', которые вы проведёте сами.';
    if (r === 'ae') verdict += ' Ожидаемый доход в этой роли: ' + money(t.ote[0]) + '–' + money(t.ote[1]) + ' в год.';
    out.verdict.textContent = verdict;

    out.year2note.textContent = yearly
      ? Math.round(renewalRate * 100) + '% с продлений, если продлится ' + v.renew + '% годовых контрактов'
      : 'Продлеваются годовые программы и спонсорство банков, разовые игры — нет';

    out.gamesHint.textContent = games
      ? 'Эти продажи дают ' + plural(games, 'игру', 'игры', 'игр') + ' за первые 90 дней.'
      : 'Добавьте продажи выше, чтобы увидеть, сколько игр они приносят.';

    if (presetBtn) presetBtn.setAttribute('aria-pressed', isDefault(v) ? 'true' : 'false');
  }

  function applyDefaults() {
    var f = cform.elements;
    Object.keys(A.defaults).forEach(function (k) { if (f[k]) f[k].value = A.defaults[k]; });
    render();
  }

  function setCalcRole(r) {
    each(calc.querySelectorAll('input[name="calcRole"]'), function (i) { i.checked = i.value === r; });
    render();
  }

  if (calc) {
    cform.addEventListener('input', render);
    cform.addEventListener('submit', function (e) { e.preventDefault(); });
    // Поле «палат на банк» не может быть меньше минимума программы банка
    cform.elements.bankChambers.addEventListener('change', function () {
      this.value = values().bankChambers;
      render();
    });
    each(calc.querySelectorAll('input[name="calcRole"]'), function (i) { i.addEventListener('change', render); });
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

  function setApplyRole(r) {
    if (!form) return;
    each(form.querySelectorAll('input[name="role"]'), function (i) { i.checked = i.value === r; });
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
    var roleInput = form.querySelector('input[name="role"]:checked');
    var email = f.email.value.trim();

    if (!roleInput) return bad(form.querySelector('input[name="role"]'), 'Пожалуйста, выберите роль.');
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
      role: roleInput.value === 'ae' ? 'Первый менеджер' : 'Независимый агент',
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

  // --- кнопки, которые выбирают роль или профиль ----------------------------

  doc.addEventListener('click', function (event) {
    var el = event.target.closest('[data-calc-role], [data-apply-role], [data-apply-profile]');
    if (!el) return;
    if (el.hasAttribute('data-calc-role') && calc) setCalcRole(el.getAttribute('data-calc-role'));
    if (el.hasAttribute('data-apply-role')) setApplyRole(el.getAttribute('data-apply-role'));
    if (el.hasAttribute('data-apply-profile') && form) form.elements.profile.value = el.getAttribute('data-apply-profile');
  });
})();
