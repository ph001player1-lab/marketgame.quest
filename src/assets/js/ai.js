/* Страница /ai/: корпоративное обучение ИИ.

   Кнопки тарифов (data-ai-plan) выбирают тариф в форме заявки. Заявка
   уходит тем же обработчиком, что и остальные формы (apps-script/Code.gs),
   с типом ai_training. Поля members и note дублируют число сотрудников
   и тариф: старая версия обработчика, которая не знает этого типа,
   положит заявку в лист сообществ — и по пометке её будет видно. */

(function () {
  'use strict';

  var MG = window.MG;
  var doc = document;
  var form = doc.querySelector('[data-ai-form]');
  if (!MG || !form) return;

  var each = function (list, fn) { Array.prototype.forEach.call(list, fn); };
  var statusBox = form.querySelector('.lf__status');
  var submitBtn = form.querySelector('button[type="submit"]');
  var openedAt = Date.now();

  function setStatus(text, kind, html) {
    statusBox.className = 'lf__status' + (kind ? ' lf__status--' + kind : '');
    if (html) statusBox.innerHTML = html; else statusBox.textContent = text;
  }

  function setPlan(plan) {
    each(form.querySelectorAll('input[name="plan"]'), function (i) { i.checked = i.value === plan; });
  }

  function bad(input, message) {
    var row = input.closest('.lf__row');
    if (row) row.classList.add('lf__row--bad');
    setStatus(message, 'bad');
    if (input.focus) input.focus();
    return null;
  }

  function validate() {
    each(form.querySelectorAll('.lf__row--bad'), function (r) { r.classList.remove('lf__row--bad'); });
    var f = form.elements;
    var planInput = form.querySelector('input[name="plan"]:checked');
    var email = f.email.value.trim();

    if (!planInput) return bad(form.querySelector('input[name="plan"]'), 'Пожалуйста, выберите, что вас интересует.');
    if (!f.name.value.trim()) return bad(f.name, 'Пожалуйста, укажите имя.');
    if (!f.org.value.trim()) return bad(f.org, 'Пожалуйста, укажите компанию.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return bad(f.email, 'Проверьте адрес электронной почты.');
    if (!f.consent.checked) {
      setStatus('Пожалуйста, подтвердите согласие на обработку персональных данных.', 'bad');
      f.consent.focus();
      return null;
    }

    var plan = planInput.getAttribute('data-label') || planInput.value;
    var people = f.people.value;
    return {
      type: 'ai_training',
      plan: plan,
      name: f.name.value.trim(),
      title: f.title.value.trim(),
      org: f.org.value.trim(),
      email: email,
      phone: f.phone.value.trim(),
      people: people,
      members: people,
      note: 'Обучение ИИ — ' + plan,
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
    box.innerHTML = '<h3>Заявка получена</h3>' +
      '<p>Спасибо! Менеджер свяжется с вами в течение рабочего дня, уточнит задачи и предложит программу.</p>';
    form.hidden = true;
    form.parentNode.insertBefore(box, form.nextSibling);
    box.focus();
  }

  function fail() {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Отправить заявку';
    var email = (MG.data.contact || {}).email;
    setStatus('', 'bad', 'Заявка не отправилась.' +
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

    // text/plain — «простой» запрос без OPTIONS, как у остальных форм
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

  form.addEventListener('submit', submit);

  // --- кнопки тарифов выбирают тариф в форме --------------------------------

  doc.addEventListener('click', function (event) {
    var el = event.target.closest('[data-ai-plan]');
    if (el) setPlan(el.getAttribute('data-ai-plan'));
  });
})();
