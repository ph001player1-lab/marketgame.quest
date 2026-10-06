/* Заявка на демо-игру — главная цель сайта.

   Одна форма на три случая: сообщество или компания, банк, спонсор. Поля у них разные,
   переключатель типа стоит вверху формы. Тип по умолчанию — то, что
   посетитель выбрал на первом экране.

   Форму открывает любая кнопка с атрибутом data-lead:
     data-lead=""          — тип из выбора посетителя (или «сообщество»);
     data-lead="bank"      — сразу форма банка;
     data-lead-org="…"     — подставить название организации;
     data-lead-note="…"    — пометка для менеджера («Заявка на эксклюзивные права — …»);
     data-lead-states="…"  — регионы для банка или спонсора.

   Отправка — как на marketgame.club: POST в Google Apps Script
   (apps-script/Code.gs), который пишет строку в таблицу и шлёт
   уведомление в Telegram. Адрес — src/_data/site.json → formEndpoint. */

(function () {
  'use strict';

  var MG = window.MG;
  if (!MG) return;

  var D = MG.data;
  var esc = MG.esc;
  var doc = document;
  var dialog, form, statusBox, submitBtn, noteBox, openedAt, lastFocus, currentNote = '';
  var SUBMIT = 'Заказать демо-игру';

  var TYPES = {
    chamber: { label: 'Сообщество или компанию', org: 'Сообщество или компания', orgPh: 'например, клуб предпринимателей «Пример»' },
    bank:    { label: 'Банк', org: 'Банк', orgPh: 'Название банка' },
    sponsor: { label: 'Другого спонсора', org: 'Организация', orgPh: 'Ваша компания' }
  };

  function regionOptions() {
    return '<option value="">Выберите регион…</option>' + (D.regions || []).map(function (s) {
      return '<option value="' + esc(s.abbr) + '">' + esc(s.name) + '</option>';
    }).join('') + '<option value="INTL">За пределами России</option>';
  }

  function row(id, label, control, hint) {
    return '<div class="lf__row"><label for="' + id + '">' + label + '</label>' + control +
      (hint ? '<span class="lf__hint">' + hint + '</span>' : '') + '</div>';
  }

  function build() {
    dialog = doc.createElement('dialog');
    dialog.className = 'lf';
    dialog.setAttribute('aria-labelledby', 'lfTitle');

    var typeRadios = Object.keys(TYPES).map(function (k) {
      return '<label class="seg__opt"><input type="radio" name="type" value="' + k + '"><span>' +
        esc(TYPES[k].label) + '</span></label>';
    }).join('');

    dialog.innerHTML =
      '<div class="lf__in">' +
        '<button type="button" class="lf__x" aria-label="Закрыть">&times;</button>' +
        '<h2 class="lf__t" id="lfTitle">Заказать демо-игру</h2>' +
        '<p class="lf__sub">Бесплатно, 60 минут, онлайн. Менеджер свяжется с вами в течение рабочего дня и согласует время.</p>' +
        '<p class="lf__note" data-lf-note hidden></p>' +
        '<form class="lf__form" novalidate>' +
          '<fieldset class="lf__type"><legend>Я представляю</legend><div class="seg seg--sm">' + typeRadios + '</div></fieldset>' +
          '<div class="lf__two">' +
            row('lfName', 'Имя и фамилия', '<input id="lfName" name="name" type="text" autocomplete="name" required>') +
            row('lfTitle2', 'Должность', '<input id="lfTitle2" name="title" type="text" autocomplete="organization-title">') +
          '</div>' +
          row('lfOrg', '<span data-org-label>Сообщество или компания</span>', '<input id="lfOrg" name="org" type="text" autocomplete="organization" required>') +
          '<div class="lf__two">' +
            row('lfEmail', 'Рабочий email', '<input id="lfEmail" name="email" type="email" autocomplete="email" required>') +
            row('lfPhone', 'Телефон', '<input id="lfPhone" name="phone" type="tel" autocomplete="tel" placeholder="+7 900 000-00-00">') +
          '</div>' +

          '<div data-for="chamber">' +
            '<div class="lf__two">' +
              row('lfRegion', 'Регион', '<select id="lfRegion" name="region">' + regionOptions() + '</select>') +
              row('lfMembers', 'Участников', '<select id="lfMembers" name="members"><option value="">—</option><option>Меньше 100</option><option>100–299</option><option>300–999</option><option>1000 и больше</option></select>') +
            '</div>' +
            row('lfPayer', 'Кто будет оплачивать игры?', '<select id="lfPayer" name="payer"><option value="">Пока не знаем</option><option>Мы сами</option><option>Ищем спонсора</option><option>Спонсор уже есть</option></select>') +
            '<fieldset class="lf__row lf__checks"><legend>Где работают ваши участники</legend>' +
              '<label class="check"><input type="checkbox" name="scopes" value="state"><span>В нашем регионе</span></label>' +
              '<label class="check"><input type="checkbox" name="scopes" value="us"><span>По всей России</span></label>' +
              '<label class="check"><input type="checkbox" name="scopes" value="intl"><span>За рубежом</span></label>' +
            '</fieldset>' +
          '</div>' +

          '<div data-for="bank sponsor">' +
            row('lfRegions', 'Регионы', '<input id="lfRegions" name="regions" type="text" placeholder="например, Татарстан, Самарская область">', 'Где вы работаете с бизнесом.') +
            '<div data-for="sponsor">' + row('lfIndustry', 'Отрасль', '<input id="lfIndustry" name="industry" type="text">') + '</div>' +
            row('lfInterest', 'Что интересует', '<select id="lfInterest" name="interest"><option value="">Пока не знаем</option><option>Одно сообщество</option><option>Несколько сообществ</option><option data-for="bank">Эксклюзивная территория</option></select>') +
            '<label class="check lf__row" data-for="bank"><input type="checkbox" name="hosts"><span>Хотим, чтобы игры вели наши сотрудники</span></label>' +
          '</div>' +

          row('lfMsg', 'Комментарий', '<textarea id="lfMsg" name="message" rows="3"></textarea>') +

          // ловушка для роботов: человек её не видит и не заполняет
          '<div class="lf__trap" aria-hidden="true"><label for="lfWebsite">Сайт</label>' +
            '<input type="text" id="lfWebsite" name="website" tabindex="-1" autocomplete="off"></div>' +

          '<div class="lf__check"><input type="checkbox" id="lfConsent" name="consent">' +
            '<label for="lfConsent" class="lf__consent">Даю <a href="/consent/" target="_blank" rel="noopener">согласие на обработку персональных данных</a> для ответа на мой запрос. ' +
            'С <a href="/privacy/" target="_blank" rel="noopener">политикой конфиденциальности</a> ознакомлен(а).</label></div>' +

          '<div class="lf__actions"><button type="submit" class="btn">' + SUBMIT + '</button></div>' +
          '<p class="lf__status" role="status" aria-live="polite"></p>' +
        '</form>' +
      '</div>';

    doc.body.appendChild(dialog);
    form = dialog.querySelector('form');
    statusBox = dialog.querySelector('.lf__status');
    submitBtn = form.querySelector('button[type="submit"]');
    noteBox = dialog.querySelector('[data-lf-note]');

    dialog.querySelector('.lf__x').addEventListener('click', close);
    dialog.addEventListener('close', function () { if (lastFocus && lastFocus.focus) lastFocus.focus(); });
    // клик по затемнению вокруг формы закрывает её
    dialog.addEventListener('click', function (e) { if (e.target === dialog) close(); });
    Array.prototype.forEach.call(form.querySelectorAll('input[name="type"]'), function (r) {
      r.addEventListener('change', function () { setType(r.value); });
    });
    form.addEventListener('submit', submit);
  }

  function setType(type) {
    if (!TYPES[type]) type = 'chamber';
    Array.prototype.forEach.call(form.querySelectorAll('input[name="type"]'), function (r) {
      r.checked = r.value === type;
    });
    Array.prototype.forEach.call(form.querySelectorAll('[data-for]'), function (el) {
      el.hidden = el.getAttribute('data-for').split(' ').indexOf(type) === -1;
      // Safari не прячет <option hidden>, поэтому такой вариант ещё и выключаем
      if (el.tagName === 'OPTION') el.disabled = el.hidden;
    });
    form.querySelector('[data-org-label]').textContent = TYPES[type].org;
    form.elements.org.placeholder = TYPES[type].orgPh;
  }

  function open(trigger) {
    if (!dialog) build();
    reset();

    var profile = MG.profile() || {};
    var type = trigger.getAttribute('data-lead') || profile.who || 'chamber';
    setType(type);

    var org = trigger.getAttribute('data-lead-org');
    if (org) form.elements.org.value = org;

    currentNote = trigger.getAttribute('data-lead-note') || '';
    noteBox.textContent = currentNote;
    noteBox.hidden = !currentNote;

    var pageRegion = doc.body.getAttribute('data-region');
    var abbr = pageRegion || profile.region || '';
    form.elements.region.value = abbr;

    var scopes = profile.scopes || (pageRegion ? ['state'] : []);
    Array.prototype.forEach.call(form.querySelectorAll('input[name="scopes"]'), function (c) {
      c.checked = scopes.indexOf(c.value) !== -1;
    });

    var listed = trigger.getAttribute('data-lead-states');
    var s = MG.region(abbr);
    form.elements.regions.value = listed || (s ? s.name : '');

    lastFocus = doc.activeElement;
    openedAt = Date.now();
    dialog.showModal();
    form.elements.name.focus();
  }

  function close() { if (dialog && dialog.open) dialog.close(); }

  function reset() {
    form.reset();
    submitBtn.disabled = false;
    submitBtn.textContent = SUBMIT;
    setStatus('', '');
    form.classList.remove('lf__form--done');
    var done = dialog.querySelector('.lf__done');
    if (done) done.parentNode.removeChild(done);
    Array.prototype.forEach.call(form.querySelectorAll('.lf__row--bad'), function (r) {
      r.classList.remove('lf__row--bad');
    });
  }

  function setStatus(message, kind, html) {
    statusBox.className = 'lf__status' + (kind ? ' lf__status--' + kind : '');
    if (html) statusBox.innerHTML = html;
    else statusBox.textContent = message;
  }

  function bad(input, message) {
    var r = input.closest('.lf__row');
    if (r) r.classList.add('lf__row--bad');
    setStatus(message, 'bad');
    input.focus();
    return null;
  }

  // Подписи для таблицы продаж: менеджеру понятнее слова, чем коды
  var SCOPE_LABEL = { state: 'в регионе', us: 'по всей России', intl: 'за рубежом' };

  function validate() {
    Array.prototype.forEach.call(form.querySelectorAll('.lf__row--bad'), function (r) {
      r.classList.remove('lf__row--bad');
    });
    var f = form.elements;
    var type = (form.querySelector('input[name="type"]:checked') || {}).value || 'chamber';
    var email = f.email.value.trim();

    if (!f.name.value.trim()) return bad(f.name, 'Пожалуйста, укажите имя.');
    if (!f.org.value.trim()) return bad(f.org, 'Пожалуйста, укажите организацию.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return bad(f.email, 'Проверьте адрес электронной почты.');
    if (!f.consent.checked) { setStatus('Пожалуйста, подтвердите согласие на обработку персональных данных.', 'bad'); f.consent.focus(); return null; }

    var scopes = Array.prototype.filter.call(form.querySelectorAll('input[name="scopes"]'), function (c) {
      return c.checked;
    }).map(function (c) { return SCOPE_LABEL[c.value] || c.value; });
    var region = MG.region(f.region.value);

    return {
      type: type,
      name: f.name.value.trim(),
      title: f.title.value.trim(),
      org: f.org.value.trim(),
      email: email,
      phone: f.phone.value.trim(),
      region: type === 'chamber' ? (region ? region.name : (f.region.value === 'INTL' ? 'За пределами России' : '')) : '',
      members: type === 'chamber' ? f.members.value : '',
      payer: type === 'chamber' ? f.payer.value : '',
      scopes: type === 'chamber' ? scopes.join(', ') : '',
      regions: type !== 'chamber' ? f.regions.value.trim() : '',
      interest: type !== 'chamber' ? f.interest.value : '',
      hosts: type === 'bank' && f.hosts.checked ? 'да' : '',
      industry: type === 'sponsor' ? f.industry.value.trim() : '',
      message: f.message.value.trim(),
      note: currentNote,
      website: f.website.value,
      elapsed: Date.now() - openedAt,
      page: location.href,
      referrer: doc.referrer,
      utm: location.search.replace(/^\?/, '')
    };
  }

  function fallbackLink() {
    var c = D.contact || {};
    if (c.email) return '<a href="mailto:' + esc(c.email) + '">' + esc(c.email) + '</a>';
    return '';
  }

  function fail(reason) {
    shown = true;
    var done = dialog.querySelector('.lf__done');
    if (done) done.parentNode.removeChild(done);
    form.classList.remove('lf__form--done');
    submitBtn.disabled = false;
    submitBtn.textContent = SUBMIT;
    var link = fallbackLink();
    setStatus('', 'bad', esc(reason) + (link ? ' Напишите нам напрямую: ' + link + '.' : ''));
    if (!dialog.open) dialog.showModal();
  }

  var shown = false;

  function succeed(type, abbr) {
    if (shown) return;
    shown = true;
    form.classList.add('lf__form--done');
    setStatus('', '');
    var box = doc.createElement('div');
    box.className = 'lf__done';
    box.innerHTML = '<h3>Заявка принята</h3>' +
      '<p>Менеджер свяжется с вами в течение рабочего дня и согласует время демо-игры.</p>' +
      '<button type="button" class="btn">Закрыть</button>';
    box.querySelector('button').addEventListener('click', close);
    form.parentNode.insertBefore(box, form.nextSibling);
    box.querySelector('button').focus();

    // Запоминаем, кто пишет: в следующий раз форма откроется с тем же типом
    var p = MG.profile() || { scopes: [], region: '' };
    p.who = type;
    if (abbr && MG.region(abbr)) p.region = abbr;
    MG.saveProfile(p);
  }

  // Apps Script отвечает медленно, поэтому подтверждение показываем через
  // SHOW_AFTER, а запрос идёт дальше в фоне. Если он всё-таки не дойдёт,
  // подтверждение сменится честной ошибкой.
  var SHOW_AFTER = 1200;

  function submit(event) {
    event.preventDefault();
    var payload = validate();
    if (!payload) return;
    var type = payload.type;
    var abbr = type === 'chamber' ? form.elements.region.value : '';

    if (!D.endpoint) {
      fail('Форма заявок ещё не подключена.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Отправляем…';
    setStatus('', '');
    shown = false;
    var timer = setTimeout(function () { succeed(type, abbr); }, SHOW_AFTER);

    // text/plain — «простой» запрос без предварительного OPTIONS,
    // который Apps Script не умеет обрабатывать
    fetch(D.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      keepalive: true
    })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('http ' + r.status)); })
      .then(function (res) {
        if (!res || res.status !== 'ok') throw new Error('backend');
        clearTimeout(timer);
        succeed(type, abbr);
      })
      .catch(function () {
        clearTimeout(timer);
        fail('Заявка не отправилась.');
      });
  }

  doc.addEventListener('click', function (event) {
    var trigger = event.target.closest('[data-lead]');
    if (!trigger) return;
    event.preventDefault();
    open(trigger);
  });
})();
