/**
 * Бизнес Квест (marketgame.quest) — приём заявок на демо-игру, на AI-сотрудников
 * и откликов на вакансии, а также CRM команды продаж (страница /crm/).
 *
 * Что делает:
 *   - принимает заявку с сайта, дописывает строку в Google-таблицу продаж
 *     (свой лист для сообществ и компаний, банков, спонсоров, заявок на
 *     AI-сотрудников и откликов на вакансии) и присылает уведомление
 *     в закрытую группу Telegram;
 *   - это отдельный скрипт для российского сайта. Ставьте его в ОТДЕЛЬНУЮ
 *     таблицу продаж по России: у таблицы marketgame.biz уже есть свой
 *     скрипт с такими же именами листов;
 *   - CRM: вход менеджеров по коду на почту, клиенты, игры, оплаты на листах
 *     «CRM — …», письма менеджерам, сообщения о новых играх и ежедневный
 *     отчёт в ту же группу Telegram (раздел CRM в конце файла);
 *   - отдаёт сайту два открытых листа — «Сайт — сообщества» и «Сайт — банки».
 *     Из них GitHub раз в час обновляет статусы на сайте. Наружу уходят
 *     только колонки из SITE_SHEETS ниже, даже если в лист добавить другие.
 *
 * Как поставить — подробная инструкция в README, раздел «Заявки». Коротко:
 *   1. В таблице продаж: Расширения → Apps Script.
 *   2. Вставить этот файл целиком вместо содержимого Code.gs.
 *   3. Настройки проекта → Свойства скрипта, добавить два свойства:
 *        BOT_TOKEN  — токен бота от @BotFather
 *        CHAT_ID    — id закрытой группы (с минусом, напр. -1001234567890)
 *      Можно взять того же бота и ту же группу, что у marketgame.club
 *      и marketgame.biz: заголовок уведомления подписан marketgame.quest.
 *   4. Развернуть → Новое развёртывание → Веб-приложение,
 *      «Запуск от имени: я», «Доступ: все».
 *   5. Адрес вида .../exec вписать в src/_data/site.json → formEndpoint.
 *   6. Выбрать наверху функцию checkSetup и нажать «Выполнить»: она проверит
 *      ключи, бота и группу, создаст все нужные листы, включая «Сайт — сообщества»,
 *      «Сайт — банки» и листы CRM, впишет вас админом CRM и поставит ежедневный
 *      отчёт. Google спросит разрешения (таблица, почта, Telegram, триггеры) —
 *      разрешите.
 *
 * После любой правки этого файла: Развернуть → Управление развёртываниями →
 * карандаш → Версия: новая → Развернуть. Адрес .../exec при этом не меняется.
 *
 * ВАЖНО: токен живёт в свойствах скрипта и на сайт не попадает.
 * Никогда не вписывайте его прямо в этот файл.
 */

var SHEETS = {
  chamber: 'Заявки — сообщества и компании',
  bank: 'Заявки — банки',
  sponsor: 'Заявки — спонсоры',
  agent_application: 'Заявки — агенты',
  ai_training: 'Заявки — AI-сотрудники'
};

var TYPE_LABEL = { chamber: 'Сообщество или компания', bank: 'Банк', sponsor: 'Спонсор', agent_application: 'Отклик на вакансию', ai_training: 'AI-сотрудник' };

// Колонки каждого листа: [заголовок, поле заявки]
var COLUMNS = {
  chamber: [
    ['Дата', 'date'], ['Имя', 'name'], ['Должность', 'title'], ['Организация', 'org'],
    ['Email', 'email'], ['Телефон', 'phone'], ['Регион', 'region'], ['Участников', 'members'],
    ['Кто платит', 'payer'], ['Рынки участников', 'scopes'], ['Пометка', 'note'],
    ['Сообщение', 'message'], ['Страница', 'page'], ['Источник', 'referrer'], ['UTM', 'utm'],
    ['Статус', 'status']
  ],
  bank: [
    ['Дата', 'date'], ['Имя', 'name'], ['Должность', 'title'], ['Банк', 'org'],
    ['Email', 'email'], ['Телефон', 'phone'], ['Регионы', 'regions'], ['Интерес', 'interest'],
    ['Свои ведущие', 'hosts'], ['Пометка', 'note'], ['Сообщение', 'message'],
    ['Страница', 'page'], ['Источник', 'referrer'], ['UTM', 'utm'], ['Статус', 'status']
  ],
  sponsor: [
    ['Дата', 'date'], ['Имя', 'name'], ['Должность', 'title'], ['Организация', 'org'],
    ['Отрасль', 'industry'], ['Email', 'email'], ['Телефон', 'phone'], ['Регионы', 'regions'],
    ['Интерес', 'interest'], ['Пометка', 'note'], ['Сообщение', 'message'],
    ['Страница', 'page'], ['Источник', 'referrer'], ['UTM', 'utm'], ['Статус', 'status']
  ],
  // Отклик на вакансию со страницы /agents/
  agent_application: [
    ['Дата', 'date'], ['Роль', 'role'], ['Имя', 'name'], ['Email', 'email'], ['Телефон', 'phone'],
    ['Город', 'city'], ['Регион или страна', 'region'], ['Часовой пояс', 'tz'], ['Профиль', 'profile'],
    ['Что продаёт', 'sells'], ['С какими организациями работает', 'orgs'], ['Сообщества', 'chambers'],
    ['Резюме (hh.ru)', 'resume'], ['Откуда узнал', 'source'], ['Комментарий', 'message'],
    ['Страница', 'page'], ['Источник', 'referrer'], ['UTM', 'utm'], ['Статус', 'status']
  ],
  // Заявка «Нанять AI-сотрудника» со страницы /ai/ (тип остался прежним — ai_training)
  ai_training: [
    ['Дата', 'date'], ['Сотрудник', 'plan'], ['Имя', 'name'], ['Должность', 'title'], ['Компания', 'org'],
    ['Email', 'email'], ['Телефон', 'phone'], ['Сотрудников', 'people'], ['Сообщение', 'message'],
    ['Страница', 'page'], ['Источник', 'referrer'], ['UTM', 'utm'], ['Статус', 'status']
  ]
};

// Открытые листы для сайта. Колонки — ровно те, что уходят наружу.
// Поменяли набор колонок здесь — поменяйте и scripts/sync-sheet.mjs.
var SITE_SHEETS = {
  chambers: {
    name: 'Сайт — сообщества',
    headers: ['Регион', 'Сообщество', 'Город', 'Сайт', 'Статус', 'Дата договора',
              'Публиковать', 'Спонсор', 'Публиковать спонсора'],
    checkboxes: ['Публиковать', 'Публиковать спонсора'],
    lists: { 'Статус': ['Договор подписан', 'Нет договора'] },
    dates: ['Дата договора']
  },
  banks: {
    name: 'Сайт — банки',
    headers: ['Регион', 'Банк', 'Территория', 'Город или агломерация', 'Эксклюзив', 'Активен', 'Публиковать'],
    checkboxes: ['Эксклюзив', 'Активен', 'Публиковать'],
    lists: { 'Территория': ['Регион', 'Город'] },
    dates: []
  }
};

// Регионы для выпадающего списка — те же названия, что в src/_data/regions.json.
// scripts/sync-sheet.mjs узнаёт регион по названию или по коду.
var REGION_NAMES = [
  'Алтайский край', 'Амурская область', 'Архангельская область',
  'Астраханская область', 'Белгородская область', 'Брянская область',
  'Владимирская область', 'Волгоградская область', 'Вологодская область',
  'Воронежская область', 'Еврейская автономная область', 'Забайкальский край',
  'Ивановская область', 'Иркутская область', 'Кабардино-Балкарская Республика',
  'Калининградская область', 'Калужская область', 'Камчатский край',
  'Карачаево-Черкесская Республика', 'Кемеровская область — Кузбасс', 'Кировская область',
  'Костромская область', 'Краснодарский край', 'Красноярский край',
  'Курганская область', 'Курская область', 'Ленинградская область',
  'Липецкая область', 'Магаданская область', 'Москва',
  'Московская область', 'Мурманская область', 'Ненецкий автономный округ',
  'Нижегородская область', 'Новгородская область', 'Новосибирская область',
  'Омская область', 'Оренбургская область', 'Орловская область',
  'Пензенская область', 'Пермский край', 'Приморский край',
  'Псковская область', 'Республика Адыгея', 'Республика Алтай',
  'Республика Башкортостан', 'Республика Бурятия', 'Республика Дагестан',
  'Республика Ингушетия', 'Республика Калмыкия', 'Республика Карелия',
  'Республика Коми', 'Республика Марий Эл', 'Республика Мордовия',
  'Республика Саха (Якутия)', 'Республика Северная Осетия — Алания', 'Республика Татарстан',
  'Республика Тыва', 'Республика Хакасия', 'Ростовская область',
  'Рязанская область', 'Самарская область', 'Санкт-Петербург',
  'Саратовская область', 'Сахалинская область', 'Свердловская область',
  'Смоленская область', 'Ставропольский край', 'Тамбовская область',
  'Тверская область', 'Томская область', 'Тульская область',
  'Тюменская область', 'Удмуртская Республика', 'Ульяновская область',
  'Хабаровский край', 'Ханты-Мансийский автономный округ — Югра', 'Челябинская область',
  'Чеченская Республика', 'Чувашская Республика', 'Чукотский автономный округ',
  'Ямало-Ненецкий автономный округ', 'Ярославская область'
];

/** Форма шлёт POST. */
function doPost(e) {
  try {
    var data = JSON.parse((e && e.postData && e.postData.contents) || '{}');

    // CRM (/crm/) — своя ветка: вход по коду, клиенты, игры, оплаты
    if (data.api === 'crm') return crmApi(data);

    // Ловушка от ботов: поле скрыто в вёрстке, человек его не заполнит.
    if (data.website) return ok({ status: 'ok' });

    // Слишком быстрая отправка — почти наверняка робот.
    if (typeof data.elapsed === 'number' && data.elapsed < 2500) return ok({ status: 'ok' });

    var type = COLUMNS[data.type] ? data.type : 'chamber';
    var row = {
      date: new Date(),
      type: type,
      name: clean(data.name, 100),
      title: clean(data.title, 100),
      org: clean(data.org, 160),
      email: clean(data.email, 120),
      phone: clean(data.phone, 40),
      region: clean(data.region, 80),
      members: clean(data.members, 40),
      payer: clean(data.payer, 60),
      scopes: clean(data.scopes, 60),
      regions: clean(data.regions, 300),
      interest: clean(data.interest, 60),
      hosts: clean(data.hosts, 10),
      industry: clean(data.industry, 100),
      role: clean(data.role, 40),
      city: clean(data.city, 100),
      region: clean(data.region, 120),
      tz: clean(data.tz, 80),
      profile: clean(data.profile, 80),
      sells: clean(data.sells, 300),
      orgs: clean(data.orgs, 300),
      chambers: clean(data.chambers, 300),
      resume: clean(data.resume, 300),
      source: clean(data.source, 80),
      plan: clean(data.plan, 80),
      people: clean(data.people, 40),
      note: clean(data.note, 200),
      message: clean(data.message, 2000),
      page: clean(data.page, 300),
      referrer: clean(data.referrer, 300),
      utm: clean(data.utm, 300),
      status: 'Новая'
    };

    // У агента нет организации: ему достаточно имени и почты
    var needsOrg = type !== 'agent_application';
    if (!row.name || (needsOrg && !row.org) || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(row.email)) {
      return ok({ status: 'error', message: 'not enough contact data' });
    }

    appendLead(row);
    notifyTelegram(row);
    return ok({ status: 'ok' });
  } catch (err) {
    console.error(err);
    return ok({ status: 'error', message: 'internal' });
  }
}

/**
 * GET-запросы:
 *   .../exec                 — проверка развёртывания (откройте в браузере);
 *   .../exec?sheet=chambers  — лист «Сайт — сообщества» в CSV, его читает GitHub;
 *   .../exec?sheet=banks     — лист «Сайт — банки» в CSV.
 */
function doGet(e) {
  var which = e && e.parameter && e.parameter.sheet;
  if (which) {
    if (!SITE_SHEETS[which]) return ok({ status: 'error', message: 'unknown sheet' });
    return siteCsv(which);
  }
  var props = PropertiesService.getScriptProperties();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return ok({
    status: 'ok',
    service: 'marketgame-quest-leads',
    hasToken: !!props.getProperty('BOT_TOKEN'),
    hasChatId: !!props.getProperty('CHAT_ID'),
    leadTypes: Object.keys(SHEETS),
    crm: !!ss.getSheetByName(CRM.team.name),
    siteSheets: {
      chambers: !!ss.getSheetByName(SITE_SHEETS.chambers.name),
      banks: !!ss.getSheetByName(SITE_SHEETS.banks.name)
    }
  });
}

/** Открытый лист в CSV — только колонки из SITE_SHEETS, в их порядке. */
function siteCsv(which) {
  var def = SITE_SHEETS[which];
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(def.name);
  if (!sheet) return ok({ status: 'error', message: 'sheet not found: ' + def.name });

  var values = sheet.getDataRange().getValues();
  var head = (values[0] || []).map(function (h) { return String(h).trim(); });
  var index = def.headers.map(function (h) { return head.indexOf(h); });
  var tz = Session.getScriptTimeZone();

  function cell(v) {
    if (v instanceof Date) v = Utilities.formatDate(v, tz, 'yyyy-MM-dd');
    v = String(v === null || v === undefined ? '' : v);
    return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }

  var lines = [def.headers.map(cell).join(',')];
  for (var r = 1; r < values.length; r++) {
    var row = index.map(function (i) { return i === -1 ? '' : values[r][i]; });
    if (row.join('').trim() === '' || row.every(function (v) { return v === '' || v === false; })) continue;
    lines.push(row.map(cell).join(','));
  }
  return ContentService.createTextOutput(lines.join('\n')).setMimeType(ContentService.MimeType.CSV);
}

/**
 * Создаёт листы «Сайт — сообщества» и «Сайт — банки»: заголовки, выпадающие
 * списки регионов и статусов, галочки «Да/Нет». Существующие листы не трогает.
 * Запускается из checkSetup, можно и отдельно.
 */
function setupSiteSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var made = [];
  Object.keys(SITE_SHEETS).forEach(function (key) {
    var def = SITE_SHEETS[key];
    if (ss.getSheetByName(def.name)) return;
    var sheet = ss.insertSheet(def.name);
    var rows = 999;
    sheet.getRange(1, 1, 1, def.headers.length).setValues([def.headers]).setFontWeight('bold');
    sheet.setFrozenRows(1);

    function col(name) { return def.headers.indexOf(name) + 1; }
    function list(values) {
      return SpreadsheetApp.newDataValidation().requireValueInList(values, true).setAllowInvalid(false).build();
    }
    sheet.getRange(2, col('Регион'), rows, 1).setDataValidation(list(REGION_NAMES));
    Object.keys(def.lists).forEach(function (name) {
      sheet.getRange(2, col(name), rows, 1).setDataValidation(list(def.lists[name]));
    });
    def.checkboxes.forEach(function (name) { sheet.getRange(2, col(name), rows, 1).insertCheckboxes(); });
    def.dates.forEach(function (name) { sheet.getRange(2, col(name), rows, 1).setNumberFormat('yyyy-mm-dd'); });
    sheet.autoResizeColumns(1, def.headers.length);
    made.push(def.name);
  });
  return made;
}

function appendLead(row) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sheet = getSheet(row.type);
    // Текст пишем как есть: телефон «+7…» не станет формулой, а «=…» не выполнится
    sheet.appendRow(COLUMNS[row.type].map(function (c) {
      var v = row[c[1]];
      return v instanceof Date ? v : crmLiteral(v === undefined || v === null ? '' : v);
    }));
  } finally {
    lock.releaseLock();
  }
}

function getSheet(type) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var name = SHEETS[type];
  var headers = COLUMNS[type].map(function (c) { return c[0]; });
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  } else if (sheet.getLastColumn() < headers.length) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  }
  return sheet;
}

/** Отправка в Telegram. Никогда не бросает исключение: заявка уже в таблице. */
function sendToTelegram(text) {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('BOT_TOKEN');
  var chatId = props.getProperty('CHAT_ID');
  if (!token) return { ok: false, error: 'В свойствах скрипта не задан BOT_TOKEN' };
  if (!chatId) return { ok: false, error: 'В свойствах скрипта не задан CHAT_ID' };

  try {
    var res = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ chat_id: chatId, text: text, parse_mode: 'HTML', disable_web_page_preview: true }),
      muteHttpExceptions: true
    });
    var body = {};
    try { body = JSON.parse(res.getContentText()); } catch (e) {}
    if (body.ok) return { ok: true };
    var reason = body.description || ('HTTP ' + res.getResponseCode());
    console.error('Telegram отказал: ' + reason);
    return { ok: false, error: reason };
  } catch (err) {
    console.error('Не удалось обратиться к Telegram: ' + err);
    return { ok: false, error: String(err) };
  }
}

function notifyTelegram(row) {
  if (row.type === 'agent_application') return notifyAgent(row);
  if (row.type === 'ai_training') return notifyAi(row);
  var lines = [
    '<b>marketgame.quest · заявка на демо · ' + TYPE_LABEL[row.type] + '</b>',
    row.note ? '<b>' + esc(row.note) + '</b>' : '',
    '',
    esc(row.name) + (row.title ? ', ' + esc(row.title) : ''),
    esc(row.org),
    'Email: ' + esc(row.email),
    row.phone ? 'Телефон: ' + esc(row.phone) : '',
    row.region ? 'Регион: ' + esc(row.region) : '',
    row.regions ? 'Регионы: ' + esc(row.regions) : '',
    row.members ? 'Участников: ' + esc(row.members) : '',
    row.payer ? 'Кто платит: ' + esc(row.payer) : '',
    row.scopes ? 'Рынки: ' + esc(row.scopes) : '',
    row.interest ? 'Интерес: ' + esc(row.interest) : '',
    row.hosts ? 'Хотят своих ведущих' : '',
    row.industry ? 'Отрасль: ' + esc(row.industry) : '',
    row.message ? '\n' + esc(row.message) : '',
    row.utm ? '\nМетки: ' + esc(row.utm) : ''
  ].filter(function (l) { return l !== ''; });
  return sendToTelegram(lines.join('\n'));
}

/** Уведомление о заявке на AI-сотрудника. */
function notifyAi(row) {
  var lines = [
    '<b>marketgame.quest · AI-сотрудник · ' + esc(row.plan || 'не выбран') + '</b>',
    '',
    esc(row.name) + (row.title ? ', ' + esc(row.title) : ''),
    esc(row.org),
    'Email: ' + esc(row.email),
    row.phone ? 'Телефон: ' + esc(row.phone) : '',
    row.people ? 'Сотрудников: ' + esc(row.people) : '',
    row.message ? '\n' + esc(row.message) : '',
    row.utm ? '\nМетки: ' + esc(row.utm) : ''
  ].filter(function (l) { return l !== ''; });
  return sendToTelegram(lines.join('\n'));
}

/** Уведомление об отклике на вакансию — свои поля, без «заявки на демо». */
function notifyAgent(row) {
  var lines = [
    '<b>marketgame.quest · отклик на вакансию · ' + esc(row.role || 'вакансия не выбрана') + '</b>',
    '',
    esc(row.name),
    'Email: ' + esc(row.email),
    row.phone ? 'Телефон: ' + esc(row.phone) : '',
    [row.city, row.region].filter(String).length ? 'Где: ' + esc([row.city, row.region].filter(String).join(', ')) : '',
    row.tz ? 'Пояс: ' + esc(row.tz) : '',
    row.profile ? 'Профиль: ' + esc(row.profile) : '',
    row.sells ? 'Продаёт: ' + esc(row.sells) : '',
    row.orgs ? 'Работает с: ' + esc(row.orgs) : '',
    row.chambers ? 'Сообщества: ' + esc(row.chambers) : '',
    row.resume ? 'Резюме: ' + esc(row.resume) : '',
    row.source ? 'Откуда узнал: ' + esc(row.source) : '',
    row.message ? '\n' + esc(row.message) : '',
    row.utm ? '\nМетки: ' + esc(row.utm) : ''
  ].filter(function (l) { return l !== ''; });
  return sendToTelegram(lines.join('\n'));
}

function clean(value, max) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim().slice(0, max);
}

function esc(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function ok(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * ГЛАВНАЯ ФУНКЦИЯ ДЛЯ НАСТРОЙКИ. Выберите её наверху и нажмите «Выполнить».
 */
function checkSetup() {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('BOT_TOKEN');
  var chatId = props.getProperty('CHAT_ID');
  var out = [];
  function say(line) { out.push(line); console.log(line); }
  function stop(line) { say('✗ ' + line); throw new Error('\n\n' + out.join('\n') + '\n'); }

  say('--- Проверка настройки ---');
  if (!token) stop('Не задан BOT_TOKEN: Настройки проекта → Свойства скрипта.');
  say('✓ BOT_TOKEN задан');
  if (!chatId) stop('Не задан CHAT_ID: там же добавьте id группы.');
  say('✓ CHAT_ID задан: ' + chatId);

  var sent = sendToTelegram('<b>Проверка настройки marketgame.quest</b>\n\nЕсли вы это читаете — приём заявок настроен верно.');
  if (!sent.ok) stop('Бот не смог написать в группу: ' + sent.error);
  say('✓ Сообщение отправлено — проверьте группу');

  Object.keys(SHEETS).forEach(function (t) { say('✓ Лист «' + getSheet(t).getName() + '» готов'); });
  var made = setupSiteSheets();
  Object.keys(SITE_SHEETS).forEach(function (k) {
    var name = SITE_SHEETS[k].name;
    say('✓ Лист «' + name + '» ' + (made.indexOf(name) !== -1 ? 'создан' : 'на месте'));
  });
  say('');
  say('--- CRM ---');
  crmSetup(say);
  say('');
  say('ВСЁ ГОТОВО. Осталось развернуть: Развернуть → Управление развёртываниями →');
  say('карандаш → Версия: новая → Развернуть.');
  return out.join('\n');
}

/** Имитирует заявку сообщества: строка в таблицу и сообщение в группу. */
function testLead() {
  var row = {
    date: new Date(), type: 'chamber', name: 'Тестовая заявка', title: 'Руководитель', org: 'Тестовое сообщество',
    email: 'test@example.org', phone: '', region: 'Республика Татарстан', members: '100–299', payer: 'Мы сами',
    scopes: 'в регионе', regions: '', interest: '', hosts: '', industry: '', note: 'Проверка из редактора',
    message: '', page: 'editor', referrer: '', utm: '', status: 'Тест'
  };
  appendLead(row);
  var sent = notifyTelegram(row);
  if (!sent.ok) throw new Error('Строка записана, но в Telegram не ушло: ' + sent.error);
  return 'Готово: строка в таблице и сообщение в группе.';
}

// =============================================================================
// CRM — страница /crm/ на сайте
// =============================================================================
//
// Учёт клиентов, с которыми менеджер уже договорился об игре, согласование
// времени игр, оплаты и команда. Данные — на листах «CRM — …» этой таблицы,
// страница /crm/ шлёт сюда POST с полем api: 'crm' (см. doPost).
//
// Вход — по одноразовому коду на почту из листа «CRM — команда». Код живёт
// 10 минут, после входа выдаётся подписанный токен на 30 дней. Отключили
// сотрудника на листе («Доступ» = нет) — доступ пропадает сразу.
//
// Заголовки листов CRM не переименовывайте: скрипт находит колонки по ним.
// Свои колонки добавлять можно; формулы в листах CRM не ставьте —
// при сохранении строки скрипт перезаписывает её значениями.

var CRM_URL = 'https://marketgame.quest/crm/';
var CRM_SESSION_DAYS = 30;
var CRM_IDLE_DAYS = 30;
var CRM_ABROAD = 'За рубежом';
var CRM_MSK = 'Europe/Moscow';

var CRM = {
  team: { name: 'CRM — команда', cols: [
    ['Почта', 'email'], ['Имя', 'name'], ['Роль', 'role'], ['Условия', 'plan'], ['Процент', 'rate'],
    ['Доступ', 'active'], ['Добавлен', 'added']
  ] },
  clients: { name: 'CRM — клиенты', cols: [
    ['ID', 'id'], ['Внесён', 'created'], ['Менеджер', 'owner'], ['Компания', 'name'], ['Регион', 'region'],
    ['Город', 'city'], ['ИНН', 'inn'], ['Сайт', 'site'], ['ЛПР', 'lprName'], ['Должность ЛПР', 'lprTitle'],
    ['Телефон', 'phone'], ['Почта ЛПР', 'lprEmail'], ['Telegram', 'tg'], ['Отказ / пауза', 'lostReason'],
    ['Комментарий к отказу', 'lostNote'], ['Дата отказа', 'lostAt'], ['Последнее движение', 'last']
  ] },
  games: { name: 'CRM — игры', cols: [
    ['ID', 'id'], ['Клиент', 'client'], ['Компания', 'clientName'], ['Менеджер', 'manager'], ['Игра', 'type'],
    ['Начало', 'at'], ['Пояс', 'tz'], ['Время у клиента', 'localText'], ['По Москве', 'mskText'],
    ['Формат', 'format'], ['Адрес', 'address'], ['Участников (план)', 'people'], ['Комментарий', 'note'],
    ['Статус', 'status'], ['Комментарий админа', 'adminNote'], ['Причина отказа', 'reason'],
    ['Участников (факт)', 'participants'], ['Внесена', 'createdAt'], ['Обновлена', 'updatedAt']
  ] },
  pays: { name: 'CRM — оплаты', cols: [
    ['ID', 'id'], ['Клиент', 'client'], ['Компания', 'clientName'], ['Менеджер', 'manager'], ['Пакет', 'name'],
    ['Сумма', 'amount'], ['За что', 'stage'], ['Статус', 'status'], ['Дата счёта', 'date'],
    ['Дата оплаты', 'paidAt'], ['Комментарий', 'note'], ['Внесена', 'createdAt']
  ] },
  log: { name: 'CRM — журнал', cols: [
    ['Дата', 'date'], ['Кто', 'who'], ['Действие', 'action'], ['Подробности', 'details']
  ] }
};

// Значения, которые в таблице записаны словами: код в скрипте → подпись в листе.
// Подписи можно выбирать в листе из выпадающего списка.
var CRM_ROLE = { admin: 'админ', manager: 'менеджер', host: 'ведущий' };
var CRM_YESNO = { yes: 'да', no: 'нет' };
var CRM_GAME = { demo: 'Демо-игра', pilot: 'Пробная игра', single: 'Разовая игра', annual: 'Игра годовой программы', extra: 'Дополнительная игра' };
var CRM_GSTAT = { pending: 'ждёт подтверждения', proposed: 'предложено другое время', confirmed: 'подтверждена', done: 'проведена', cancelled: 'не состоялась', declined: 'отклонена' };
var CRM_FORMAT = { online: 'онлайн', offline: 'офлайн' };
var CRM_PSTAT = { invoice: 'счёт выставлен', paid: 'оплачено', unpaid: 'не оплачено', cancelled: 'отменён' };
var CRM_PSTAGE = { pilot: 'Пробная игра', single: 'Разовая игра', annual: 'Годовой контракт' };
var CRM_CODEC = {
  team: { role: CRM_ROLE },
  games: { type: CRM_GAME, status: CRM_GSTAT, format: CRM_FORMAT },
  pays: { status: CRM_PSTAT, stage: CRM_PSTAGE }
};
var CRM_DATES = { team: ['added'], clients: ['created', 'lostAt', 'last'], games: ['at', 'createdAt', 'updatedAt'], pays: ['date', 'paidAt', 'createdAt'], log: ['date'] };
var CRM_NUMS = { team: ['rate'], games: ['people', 'participants'], pays: ['amount'] };
var CRM_STAGES = [['demo', 'Демо назначено'], ['demo_done', 'Демо проведено'], ['pilot', 'Пробная игра'], ['single', 'Разовая игра'], ['annual', 'Годовой контракт'], ['lost', 'Отказ / пауза']];
var CRM_PLANS = { '0.5': 'агент, 50%' };

// Часовые пояса, из которых менеджер выбирает время игры. Тот же список —
// в src/assets/js/crm.js (TZ_RU и TZ_WORLD). [пояс, город, Россия ли]
var CRM_TZ_LIST = [
  ['Europe/Kaliningrad', 'Калининград', 1], ['Europe/Moscow', 'Москва', 1], ['Europe/Samara', 'Самара', 1],
  ['Asia/Yekaterinburg', 'Екатеринбург', 1], ['Asia/Omsk', 'Омск', 1], ['Asia/Novosibirsk', 'Новосибирск', 1],
  ['Asia/Irkutsk', 'Иркутск', 1], ['Asia/Yakutsk', 'Якутск', 1], ['Asia/Vladivostok', 'Владивосток', 1],
  ['Asia/Magadan', 'Магадан', 1], ['Asia/Kamchatka', 'Петропавловск-Камчатский', 1],
  ['Europe/Minsk', 'Минск', 0], ['Europe/Istanbul', 'Стамбул', 0], ['Asia/Nicosia', 'Кипр', 0],
  ['Europe/Belgrade', 'Белград', 0], ['Europe/Berlin', 'Берлин', 0], ['Europe/London', 'Лондон', 0],
  ['Asia/Yerevan', 'Ереван', 0], ['Asia/Tbilisi', 'Тбилиси', 0], ['Asia/Baku', 'Баку', 0],
  ['Asia/Dubai', 'Дубай', 0], ['Asia/Tashkent', 'Ташкент', 0], ['Asia/Almaty', 'Алматы', 0],
  ['Asia/Bishkek', 'Бишкек', 0], ['Asia/Bangkok', 'Бангкок', 0], ['Asia/Ho_Chi_Minh', 'Вьетнам', 0],
  ['Asia/Makassar', 'Бали', 0], ['Asia/Shanghai', 'Пекин', 0], ['America/New_York', 'Нью-Йорк', 0]
];
var CRM_TZ = {};
CRM_TZ_LIST.forEach(function (t) { CRM_TZ[t[0]] = { city: t[1], ru: !!t[2] }; });

var CRM_WD = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
var CRM_MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

// ---------- листы -------------------------------------------------------------

function crmSheet(key) {
  var def = CRM[key];
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var headers = def.cols.map(function (c) { return c[0]; });
  var sheet = ss.getSheetByName(def.name);
  if (!sheet) {
    sheet = ss.insertSheet(def.name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    crmFormat(key, sheet);
    return sheet;
  }
  var last = sheet.getLastColumn();
  if (!last) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    return sheet;
  }
  // Недостающие колонки дописываем в конец — так переживём новые версии скрипта
  var head = sheet.getRange(1, 1, 1, last).getValues()[0].map(function (h) { return String(h).trim(); });
  var missing = headers.filter(function (h) { return head.indexOf(h) === -1; });
  if (missing.length) {
    var need = last + missing.length - sheet.getMaxColumns();
    if (need > 0) sheet.insertColumnsAfter(sheet.getMaxColumns(), need);
    sheet.getRange(1, last + 1, 1, missing.length).setValues([missing]).setFontWeight('bold');
  }
  return sheet;
}

/** Выпадающие списки и форматы дат — только для только что созданного листа. */
function crmFormat(key, sheet) {
  var def = CRM[key];
  var rows = Math.max(1, sheet.getMaxRows() - 1);
  function col(field) {
    for (var i = 0; i < def.cols.length; i++) if (def.cols[i][1] === field) return i + 1;
    return 0;
  }
  function list(values) {
    return SpreadsheetApp.newDataValidation().requireValueInList(values, true).setAllowInvalid(true).build();
  }
  function values(map) { return Object.keys(map).map(function (k) { return map[k]; }); }
  var codec = CRM_CODEC[key] || {};
  Object.keys(codec).forEach(function (f) { sheet.getRange(2, col(f), rows, 1).setDataValidation(list(values(codec[f]))); });
  if (key === 'team') sheet.getRange(2, col('active'), rows, 1).setDataValidation(list(values(CRM_YESNO)));
  if (key === 'clients') sheet.getRange(2, col('region'), rows, 1).setDataValidation(list(REGION_NAMES.concat([CRM_ABROAD])));
  (CRM_DATES[key] || []).forEach(function (f) { sheet.getRange(2, col(f), rows, 1).setNumberFormat('dd.mm.yyyy hh:mm'); });
  if (key === 'pays') sheet.getRange(2, col('amount'), rows, 1).setNumberFormat('#,##0');
  sheet.autoResizeColumns(1, def.cols.length);
}

function crmTable(key) {
  var def = CRM[key];
  var sheet = crmSheet(key);
  var values = sheet.getDataRange().getValues();
  var head = (values[0] || []).map(function (h) { return String(h).trim(); });
  var idx = {};
  def.cols.forEach(function (c) { idx[c[1]] = head.indexOf(c[0]); });
  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var raw = values[r];
    if (raw.every(function (v) { return v === '' || v === null; })) continue;
    var o = { _row: r + 1, _raw: raw };
    def.cols.forEach(function (c) { o[c[1]] = crmDecode(key, c[1], idx[c[1]] < 0 ? '' : raw[idx[c[1]]]); });
    rows.push(o);
  }
  return { key: key, sheet: sheet, head: head, idx: idx, rows: rows };
}

function crmDecode(key, field, v) {
  if ((CRM_DATES[key] || []).indexOf(field) !== -1) {
    if (v instanceof Date) return v.getTime();
    if (typeof v === 'number') return v > 1e11 ? v : 0;
    var t = Date.parse(v);
    return isFinite(t) ? t : 0;
  }
  if ((CRM_NUMS[key] || []).indexOf(field) !== -1) {
    var n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.'));
    return isFinite(n) ? n : 0;
  }
  if (key === 'team' && field === 'active') {
    if (v === true || v === false) return v;
    return /^(да|yes|true|1|есть)$/i.test(String(v).trim());
  }
  var map = (CRM_CODEC[key] || {})[field];
  var s = v === null || v === undefined ? '' : String(v).trim();
  if (map) {
    var low = s.toLowerCase();
    for (var k in map) if (k === s || map[k].toLowerCase() === low) return k;
  }
  if (key === 'clients' && field === 'owner') s = crmEmail(s);
  return s;
}

function crmEncode(key, field, v) {
  if ((CRM_DATES[key] || []).indexOf(field) !== -1) return v ? new Date(v) : '';
  if ((CRM_NUMS[key] || []).indexOf(field) !== -1) return v === '' || v === null || v === undefined ? '' : Number(v);
  if (key === 'team' && field === 'active') return v ? CRM_YESNO.yes : CRM_YESNO.no;
  var map = (CRM_CODEC[key] || {})[field];
  return crmLiteral(map && map[v] ? map[v] : v);
}

// Апостроф впереди — ячейка хранит текст как есть: «+7 900…» не станет
// формулой, а ИНН с нулём впереди — числом.
function crmLiteral(v) {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v !== 'string') return v;
  return "'" + v;
}

function crmSave(t, o) {
  var row = [];
  for (var i = 0; i < t.head.length; i++) {
    var rv = o._raw ? o._raw[i] : '';
    row.push(typeof rv === 'string' ? crmLiteral(rv) : (rv === null || rv === undefined ? '' : rv));
  }
  CRM[t.key].cols.forEach(function (c) {
    var i = t.idx[c[1]];
    if (i >= 0 && Object.prototype.hasOwnProperty.call(o, c[1])) row[i] = crmEncode(t.key, c[1], o[c[1]]);
  });
  if (o._row) {
    t.sheet.getRange(o._row, 1, 1, row.length).setValues([row]);
  } else {
    t.sheet.appendRow(row);
    o._row = t.sheet.getLastRow();
    t.rows.push(o);
  }
  o._raw = row.map(function (v) { return typeof v === 'string' && v.charAt(0) === "'" ? v.slice(1) : v; });
}

// Журнал только дописывается, поэтому весь лист не читаем — он со временем растёт
function crmLog(who, action, details) {
  try {
    var sheet = crmSheet('log');
    var head = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); });
    var cell = { 'Дата': new Date(), 'Кто': crmLiteral(who), 'Действие': crmLiteral(action), 'Подробности': crmLiteral(details || '') };
    sheet.appendRow(head.map(function (h) { return Object.prototype.hasOwnProperty.call(cell, h) ? cell[h] : ''; }));
  } catch (e) { console.error(e); }
}

function crmId(prefix) { return prefix + Utilities.getUuid().replace(/-/g, '').slice(0, 10); }
function crmEmail(s) { return String(s || '').trim().toLowerCase(); }
function crmValidEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s); }
function crmRate(v) { var n = parseFloat(String(v).replace(',', '.').replace('%', '')); if (!isFinite(n) || n <= 0) return 0; return n > 1 ? n / 100 : n; }
function crmFindUser(team, email) {
  email = crmEmail(email);
  if (!email) return null;
  return team.rows.filter(function (u) { return crmEmail(u.email) === email; })[0] || null;
}
function crmRub(n) { return String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ₽'; }
function crmPlural(n, one, few, many) { var a = Math.abs(n) % 100, b = a % 10; if (a > 10 && a < 20) return many; if (b > 1 && b < 5) return few; if (b === 1) return one; return many; }

// ---------- время -------------------------------------------------------------

function crmOffset(tz, ms) {
  var z = Utilities.formatDate(new Date(ms), tz, 'Z');
  var sign = z.charAt(0) === '-' ? -1 : 1;
  return sign * (Number(z.slice(1, 3)) * 60 + Number(z.slice(3, 5)));
}
function crmWhen(ms, tz) {
  var d = new Date(ms);
  var ymd = Utilities.formatDate(d, tz, 'yyyy-MM-dd').split('-').map(Number);
  var wd = (new Date(Date.UTC(ymd[0], ymd[1] - 1, ymd[2])).getUTCDay() + 6) % 7;
  return CRM_WD[wd] + ', ' + ymd[2] + ' ' + CRM_MONTHS[ymd[1] - 1] + ', ' + Utilities.formatDate(d, tz, 'HH:mm');
}
function crmZone(tz, ms) {
  var info = CRM_TZ[tz] || { city: tz, ru: false };
  var diff = (crmOffset(tz, ms) - crmOffset(CRM_MSK, ms)) / 60;
  var msk = diff === 0 ? 'МСК' : 'МСК' + (diff > 0 ? '+' : '−') + String(Math.abs(diff)).replace('.', ',');
  if (info.ru) return info.city + ', ' + msk;
  var o = crmOffset(tz, ms);
  return info.city + ', UTC' + (o < 0 ? '−' : '+') + Math.floor(Math.abs(o) / 60) + (Math.abs(o) % 60 ? ':' + ('0' + Math.abs(o) % 60).slice(-2) : '');
}
function crmLocalText(ms, tz) { return crmWhen(ms, tz) + ' · ' + crmZone(tz, ms); }
function crmMskText(ms) { return crmWhen(ms, CRM_MSK); }
function crmDay(ms) { return Utilities.formatDate(new Date(ms), CRM_MSK, 'yyyy-MM-dd'); }

// ---------- вход --------------------------------------------------------------

function crmSecret() {
  var props = PropertiesService.getScriptProperties();
  var s = props.getProperty('CRM_SECRET');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); props.setProperty('CRM_SECRET', s); }
  return s;
}
function crmB64(s) { return Utilities.base64EncodeWebSafe(s, Utilities.Charset.UTF_8).replace(/=+$/, ''); }
function crmSign(s) { return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(s, crmSecret())).replace(/=+$/, ''); }
function crmMakeToken(email) {
  var body = crmB64(email + '|' + (Date.now() + CRM_SESSION_DAYS * 864e5));
  return body + '.' + crmSign(body);
}
function crmReadToken(token) {
  var parts = String(token || '').split('.');
  if (parts.length !== 2 || !parts[0] || crmSign(parts[0]) !== parts[1]) return '';
  var padded = parts[0] + '==='.slice((parts[0].length + 3) % 4);
  var text = Utilities.newBlob(Utilities.base64DecodeWebSafe(padded)).getDataAsString('UTF-8');
  var i = text.lastIndexOf('|');
  if (i < 0 || Number(text.slice(i + 1)) < Date.now()) return '';
  return text.slice(0, i);
}

function crmRequestCode(d) {
  var email = crmEmail(d.email);
  if (!crmValidEmail(email)) return { error: 'Проверьте адрес почты.' };
  var u = crmFindUser(crmTable('team'), email);
  if (!u || !u.active) return { error: 'Этой почты нет в списке команды. Попросите администратора добавить вас.' };
  if (u.role === 'host') return { error: 'Кабинет ведущего подключим позже.' };
  var cache = CacheService.getScriptCache();
  var sent = Number(cache.get('crm-sent:' + email) || 0);
  if (sent >= 5) return { error: 'Слишком много запросов кода. Попробуйте через час.' };
  var code = String(parseInt(Utilities.getUuid().replace(/-/g, '').slice(0, 12), 16) % 1000000);
  while (code.length < 6) code = '0' + code;
  try {
    MailApp.sendEmail({
      to: email, name: 'Бизнес Квест CRM',
      subject: code + ' — код для входа в CRM Бизнес Квест',
      body: 'Здравствуйте!\n\nКод для входа в CRM: ' + code + '\nОн действует 10 минут.\n\n' +
        'Если вы не запрашивали код, просто удалите это письмо.\n\n' + CRM_URL
    });
  } catch (e) {
    return { error: 'Не получилось отправить письмо с кодом: ' + (e && e.message || e) };
  }
  cache.put('crm-code:' + email, JSON.stringify({ code: code, tries: 0 }), 600);
  cache.put('crm-sent:' + email, String(sent + 1), 3600);
  return {};
}

function crmVerify(d) {
  var email = crmEmail(d.email);
  var code = String(d.code || '').replace(/\D/g, '');
  var cache = CacheService.getScriptCache();
  var key = 'crm-code:' + email;
  var raw = cache.get(key);
  if (!raw) return { error: 'Код устарел. Нажмите «Отправить код ещё раз».' };
  var st = JSON.parse(raw);
  if (st.tries >= 5) { cache.remove(key); return { error: 'Слишком много попыток. Запросите новый код.' }; }
  if (st.code !== code) {
    st.tries++;
    cache.put(key, JSON.stringify(st), 600);
    return { error: st.tries >= 5 ? 'Неверный код. Попытки закончились — запросите новый.' : 'Неверный код. Осталось попыток: ' + (5 - st.tries) + '.' };
  }
  cache.remove(key);
  var u = crmFindUser(crmTable('team'), email);
  if (!u || !u.active || u.role === 'host') return { error: 'Доступ отключён. Обратитесь к администратору.' };
  crmLog(u.email, 'Вход', '');
  return { token: crmMakeToken(crmEmail(u.email)), me: u };
}

// ---------- точка входа ---------------------------------------------------------

var CRM_ADMIN_ONLY = ['game.confirm', 'game.propose', 'game.decline', 'pay.status', 'client.assign', 'team.add', 'team.toggle', 'report.send'];

function crmApi(d) {
  var action = String(d.action || '');
  try {
    if (action === 'auth.request') return crmReply(crmRequestCode(d), null);
    if (action === 'auth.verify') { var v = crmVerify(d); return crmReply(v, v.me); }

    var me = crmFindUser(crmTable('team'), crmReadToken(d.token));
    if (!me || !me.active || me.role === 'host') {
      return ok({ crm: true, status: 'error', code: 'auth', message: 'Сессия закончилась — войдите снова.' });
    }
    var fn = CRM_ACTIONS[action];
    if (!fn) return ok({ crm: true, status: 'error', message: 'Неизвестное действие: ' + action });
    if (CRM_ADMIN_ONLY.indexOf(action) !== -1 && me.role !== 'admin') {
      return ok({ crm: true, status: 'error', message: 'Это может сделать только администратор.' });
    }

    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    var res;
    try { res = fn(me, d) || {}; } finally { lock.releaseLock(); }
    // Письма и Telegram — после снятия блокировки, чтобы не задерживать остальных
    (res.after || []).forEach(function (f) { try { f(res); } catch (e) { console.error(e); } });
    return crmReply(res, me);
  } catch (err) {
    console.error(err);
    return ok({ crm: true, status: 'error', message: 'Ошибка на сервере: ' + (err && err.message || err) + '. Попробуйте ещё раз.' });
  }
}

function crmReply(res, me) {
  if (res.error) return ok({ crm: true, status: 'error', message: res.error });
  var out = { crm: true, status: 'ok' };
  Object.keys(res).forEach(function (k) { if (k !== 'me' && k !== 'after') out[k] = res[k]; });
  if (me) {
    var fresh = crmFindUser(crmTable('team'), me.email);
    if (fresh) out.data = crmData(fresh);
  }
  return ok(out);
}

// ---------- данные для страницы ---------------------------------------------------

function crmAll() {
  return { team: crmTable('team'), clients: crmTable('clients'), games: crmTable('games'), pays: crmTable('pays') };
}

function crmData(me) {
  var admin = me.role === 'admin';
  var all = crmAll();
  var mine = crmEmail(me.email);
  var clients = all.clients.rows.filter(function (c) { return admin || c.owner === mine; });
  var ids = {};
  clients.forEach(function (c) { ids[c.id] = true; });
  return {
    me: crmUserOut(me),
    users: admin ? all.team.rows.map(crmUserOut) : [crmUserOut(me)],
    clients: clients.map(crmClientOut),
    games: all.games.rows.filter(function (g) { return ids[g.client]; }).map(crmGameOut),
    pays: all.pays.rows.filter(function (p) { return ids[p.client]; }).map(crmPayOut),
    report: admin ? crmReportText(all) : ''
  };
}

function crmUserOut(u) {
  return { email: crmEmail(u.email), name: u.name, role: u.role, rate: crmRate(u.rate), plan: u.plan, active: !!u.active };
}
function crmClientOut(c) {
  return {
    id: c.id, owner: c.owner, name: c.name, region: c.region, city: c.city, inn: c.inn, site: c.site,
    lpr: { name: c.lprName, title: c.lprTitle, phone: c.phone, email: c.lprEmail, tg: c.tg },
    created: c.created, last: c.last || c.created,
    lost: c.lostReason ? { reason: c.lostReason, note: c.lostNote, at: c.lostAt } : null
  };
}
function crmGameOut(g) {
  return {
    id: g.id, client: g.client, type: g.type, at: g.at, tz: g.tz, format: g.format, address: g.address,
    people: g.people ? String(g.people) : '', note: g.note, status: g.status, adminNote: g.adminNote,
    reason: g.reason, participants: g.participants || 0, createdAt: g.createdAt
  };
}
function crmPayOut(p) {
  return { id: p.id, client: p.client, name: p.name, amount: p.amount, stage: p.stage, status: p.status, date: p.date, paidAt: p.paidAt, note: p.note };
}

// ---------- проверка введённого ----------------------------------------------------

function crmCompanyIn(c) {
  c = c || {};
  var L = c.lpr || {};
  var o = {
    name: clean(c.name, 160), region: clean(c.region, 80), city: clean(c.city, 80),
    inn: String(c.inn || '').replace(/\D/g, '').slice(0, 12), site: clean(c.site, 120),
    lprName: clean(L.name, 100), lprTitle: clean(L.title, 100), phone: clean(L.phone, 40),
    lprEmail: crmEmail(clean(L.email, 120)), tg: clean(L.tg, 60)
  };
  if (!o.name) return { error: 'Укажите название компании.' };
  if (o.region !== CRM_ABROAD && REGION_NAMES.indexOf(o.region) === -1) return { error: 'Выберите регион из списка.' };
  if (o.inn && !/^\d{10}(\d{2})?$/.test(o.inn)) return { error: 'ИНН — 10 или 12 цифр.' };
  if (!o.lprName) return { error: 'Укажите, кто принимает решение.' };
  if (o.phone.replace(/\D/g, '').length < 10) return { error: 'Проверьте телефон ЛПР.' };
  if (o.lprEmail && !crmValidEmail(o.lprEmail)) return { error: 'Проверьте почту ЛПР.' };
  return o;
}

function crmGameIn(g, keepType) {
  g = g || {};
  var type = keepType || String(g.type || '');
  if (!CRM_GAME[type]) return { error: 'Выберите, какая игра.' };
  var at = Math.round(Number(g.at));
  if (!isFinite(at) || at <= 0) return { error: 'Укажите дату и время игры.' };
  if (at < Date.now() - 10 * 60000) return { error: 'Это время уже прошло — выберите будущее.' };
  if (at > Date.now() + 400 * 864e5) return { error: 'Дата больше чем на год вперёд — проверьте год.' };
  var tz = String(g.tz || '');
  if (!CRM_TZ[tz]) return { error: 'Выберите часовой пояс из списка.' };
  var format = type === 'demo' ? 'online' : (g.format === 'offline' ? 'offline' : 'online');
  var address = format === 'offline' ? clean(g.address, 200) : '';
  if (format === 'offline' && !address) return { error: 'Для офлайн-игры укажите адрес.' };
  var people = Math.max(0, Math.min(500, parseInt(g.people, 10) || 0));
  return { type: type, at: at, tz: tz, format: format, address: address, people: people || '', note: clean(g.note, 300) };
}

function crmNorm(s) {
  return String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[«»"'„“”()]/g, ' ')
    .replace(/(^|\s)(ооо|ип|ао|пао|зао|нко|ано)(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim();
}
function crmDuplicate(rows, o, exceptId) {
  var n = crmNorm(o.name);
  return rows.filter(function (c) {
    if (c.id === exceptId) return false;
    if (o.inn && String(c.inn) === o.inn) return true;
    return n.length >= 3 && crmNorm(c.name) === n;
  })[0];
}
function crmDupMessage(me, dup) {
  if (!dup.owner) return dup.name + ' уже есть в CRM без менеджера. Напишите администратору — он закрепит компанию за вами.';
  if (dup.owner === crmEmail(me.email)) return dup.name + ' уже есть среди ваших клиентов.';
  return 'Похоже, ' + dup.name + ' уже в работе у другого менеджера. Если это та же компания, напишите администратору.';
}

function crmOwn(me, table, id) {
  var row = table.rows.filter(function (x) { return x.id === String(id || ''); })[0];
  if (!row) return null;
  if (me.role !== 'admin' && row.owner !== crmEmail(me.email)) return null;
  return row;
}
function crmGameWithClient(me, d) {
  var games = crmTable('games');
  var g = games.rows.filter(function (x) { return x.id === String(d.id || ''); })[0];
  if (!g) return { error: 'Игра не найдена — обновите страницу.' };
  var clients = crmTable('clients');
  var c = crmOwn(me, clients, g.client);
  if (!c) return { error: 'Игра не найдена — обновите страницу.' };
  return { games: games, game: g, clients: clients, client: c };
}
function crmTouch(clients, c) { c.last = Date.now(); crmSave(clients, c); }

function crmNewGame(c, g) {
  var now = Date.now();
  return {
    id: crmId('g'), client: c.id, clientName: c.name, manager: c.owner, type: g.type, at: g.at, tz: g.tz,
    localText: crmLocalText(g.at, g.tz), mskText: crmMskText(g.at), format: g.format, address: g.address,
    people: g.people, note: g.note, status: 'pending', adminNote: '', reason: '', participants: '',
    createdAt: now, updatedAt: now
  };
}

// ---------- сообщения -------------------------------------------------------------

function crmGameTitle(games, g) {
  var title = CRM_GAME[g.type] || g.type;
  if (g.type !== 'annual') return title;
  var list = games.rows.filter(function (x) { return x.client === g.client && x.type === 'annual' && x.status !== 'declined' && x.status !== 'cancelled'; })
    .sort(function (a, b) { return a.at - b.at; });
  var n = list.indexOf(g) + 1;
  return n ? title + ' · ' + n + '-я из 12' : title;
}
function crmFormatText(g) {
  if (g.type === 'demo') return 'Онлайн, 60 минут';
  return g.format === 'offline' ? 'Офлайн, ведущий на месте' + (g.address ? ' · ' + g.address : '') : 'Онлайн: зал клиента, ведущий по видеосвязи';
}
function crmTimeLine(g) {
  var line = crmWhen(g.at, g.tz) + ' — ' + crmZone(g.tz, g.at);
  if (crmOffset(g.tz, g.at) !== crmOffset(CRM_MSK, g.at)) line += ' (' + crmWhen(g.at, CRM_MSK) + ' по Москве)';
  return line;
}

/** Сообщение в Telegram о новой игре; кладёт текст в ответ, чтобы менеджер его увидел. */
function crmNotifyGame(head, games, g, c, managerName) {
  return function (res) {
    var lines = [
      '<b>' + esc(head) + '</b>',
      esc(crmGameTitle(games, g)) + ' · ' + esc(c.name) + ', ' + esc(c.region === CRM_ABROAD ? (c.city || CRM_ABROAD) : c.region),
      esc(crmTimeLine(g)),
      esc(crmFormatText(g)) + (g.people ? ' · ~' + esc(g.people) + ' участников' : ''),
      'Менеджер: ' + esc(managerName || c.owner || '—'),
      g.note ? 'Комментарий: ' + esc(g.note) : '',
      '<a href="' + CRM_URL + '#queue">Открыть в CRM →</a>'
    ].filter(function (l) { return l !== ''; });
    res.tg = lines.join('\n');
    var sent = sendToTelegram(res.tg);
    res.tgSent = !!sent.ok;
  };
}

/** Письмо менеджеру о решении по игре. */
function crmMailManager(kind, games, g, c, team) {
  return function (res) {
    var u = crmFindUser(team, c.owner);
    if (!u) { res.mail = null; return; }
    var first = String(u.name || '').split(' ')[0] || 'коллега';
    var head = crmGameTitle(games, g) + ' · ' + c.name;
    var time = crmTimeLine(g);
    var mail;
    if (kind === 'confirm') {
      mail = { subject: 'Игра подтверждена: ' + c.name,
        body: head + '\n' + time + ' — время подтверждено.\n' + crmFormatText(g) + '\n\nСообщите клиенту и договоритесь о подключении.' };
    } else if (kind === 'propose') {
      mail = { subject: 'Предложено другое время: ' + c.name,
        body: head + '\nНовое время: ' + time + '\n' + (g.adminNote ? 'Комментарий: ' + g.adminNote + '\n' : '') + '\nСогласуйте с клиентом и отметьте ответ в CRM.' };
    } else {
      mail = { subject: 'Игра не подтверждена: ' + c.name,
        body: head + '\n' + time + ' — не подтверждено.\nПричина: ' + (g.reason || '—') + '\n\nНазначьте игру заново в CRM.' };
    }
    mail.to = crmEmail(u.email);
    mail.body = 'Здравствуйте, ' + first + '!\n\n' + mail.body + '\n\nCRM Бизнес Квест\n' + CRM_URL;
    res.mail = mail;
    try {
      MailApp.sendEmail({ to: mail.to, subject: mail.subject, body: mail.body, name: 'Бизнес Квест CRM' });
      res.mailSent = true;
    } catch (e) {
      res.mailSent = false;
      res.mailError = String(e && e.message || e);
    }
  };
}

// ---------- действия ------------------------------------------------------------------

var CRM_ACTIONS = {
  'load': function () { return {}; },

  'client.create': function (me, d) {
    var o = crmCompanyIn(d.client);
    if (o.error) return o;
    var g = crmGameIn(d.game);
    if (g.error) return g;
    var clients = crmTable('clients');
    var dup = crmDuplicate(clients.rows, o);
    if (dup) return { error: crmDupMessage(me, dup) };
    var now = Date.now();
    o.id = crmId('k'); o.owner = crmEmail(me.email); o.created = now; o.last = now;
    o.lostReason = ''; o.lostNote = ''; o.lostAt = '';
    crmSave(clients, o);
    var games = crmTable('games');
    var row = crmNewGame(o, g);
    crmSave(games, row);
    crmLog(me.email, 'Новый клиент', o.name + ' · ' + CRM_GAME[g.type] + ' · ' + row.localText);
    return { id: o.id, after: [crmNotifyGame('Нужно подтвердить время игры', games, row, o, me.name)] };
  },

  'client.update': function (me, d) {
    var clients = crmTable('clients');
    var c = crmOwn(me, clients, d.id);
    if (!c) return { error: 'Клиент не найден — обновите страницу.' };
    var o = crmCompanyIn(d.client);
    if (o.error) return o;
    var dup = crmDuplicate(clients.rows, o, c.id);
    if (dup) return { error: crmDupMessage(me, dup) };
    var renamed = o.name !== c.name;
    Object.keys(o).forEach(function (k) { c[k] = o[k]; });
    crmTouch(clients, c);
    if (renamed) {
      ['games', 'pays'].forEach(function (key) {
        var t = crmTable(key);
        t.rows.forEach(function (r) { if (r.client === c.id) { r.clientName = c.name; crmSave(t, r); } });
      });
    }
    crmLog(me.email, 'Изменён клиент', c.name);
    return {};
  },

  'client.lose': function (me, d) {
    var clients = crmTable('clients');
    var c = crmOwn(me, clients, d.id);
    if (!c) return { error: 'Клиент не найден — обновите страницу.' };
    c.lostReason = clean(d.reason, 80) || 'Другое';
    c.lostNote = clean(d.note, 300);
    c.lostAt = Date.now();
    crmTouch(clients, c);
    crmLog(me.email, 'Отказ / пауза', c.name + ' · ' + c.lostReason);
    return {};
  },

  'client.unlose': function (me, d) {
    var clients = crmTable('clients');
    var c = crmOwn(me, clients, d.id);
    if (!c) return { error: 'Клиент не найден — обновите страницу.' };
    c.lostReason = ''; c.lostNote = ''; c.lostAt = '';
    crmTouch(clients, c);
    crmLog(me.email, 'Снова в работе', c.name);
    return {};
  },

  'client.assign': function (me, d) {
    var clients = crmTable('clients');
    var c = crmOwn(me, clients, d.id);
    if (!c) return { error: 'Клиент не найден — обновите страницу.' };
    var owner = crmEmail(d.owner);
    if (owner) {
      var u = crmFindUser(crmTable('team'), owner);
      if (!u || !u.active || (u.role !== 'manager' && u.role !== 'admin')) return { error: 'Такого активного сотрудника нет в команде.' };
    }
    c.owner = owner;
    crmTouch(clients, c);
    ['games', 'pays'].forEach(function (key) {
      var t = crmTable(key);
      t.rows.forEach(function (r) { if (r.client === c.id) { r.manager = owner; crmSave(t, r); } });
    });
    crmLog(me.email, owner ? 'Клиент закреплён' : 'Закрепление снято', c.name + (owner ? ' → ' + owner : ''));
    return {};
  },

  'game.create': function (me, d) {
    var clients = crmTable('clients');
    var c = crmOwn(me, clients, d.client);
    if (!c) return { error: 'Клиент не найден — обновите страницу.' };
    if (c.lostReason) return { error: 'Клиент в «Отказ / пауза» — сначала верните его в работу.' };
    var g = crmGameIn(d.game);
    if (g.error) return g;
    var games = crmTable('games');
    var row = crmNewGame(c, g);
    crmSave(games, row);
    crmTouch(clients, c);
    crmLog(me.email, 'Новая игра', c.name + ' · ' + CRM_GAME[g.type] + ' · ' + row.localText);
    var owner = crmFindUser(crmTable('team'), c.owner);
    return { after: [crmNotifyGame('Нужно подтвердить время игры', games, row, c, owner ? owner.name : '')] };
  },

  'game.reschedule': function (me, d) {
    var x = crmGameWithClient(me, d);
    if (x.error) return x;
    if (['proposed', 'declined', 'pending'].indexOf(x.game.status) === -1) return { error: 'Эту игру уже нельзя перенести.' };
    var g = crmGameIn(d.game, x.game.type);
    if (g.error) return g;
    var row = x.game;
    ['at', 'tz', 'format', 'address', 'people', 'note'].forEach(function (k) { row[k] = g[k]; });
    row.localText = crmLocalText(g.at, g.tz); row.mskText = crmMskText(g.at);
    row.status = 'pending'; row.adminNote = ''; row.reason = ''; row.updatedAt = Date.now();
    crmSave(x.games, row);
    crmTouch(x.clients, x.client);
    crmLog(me.email, 'Новое время игры', x.client.name + ' · ' + row.localText);
    var owner = crmFindUser(crmTable('team'), x.client.owner);
    return { after: [crmNotifyGame('Нужно подтвердить новое время игры', x.games, row, x.client, owner ? owner.name : '')] };
  },

  'game.accept': function (me, d) {
    var x = crmGameWithClient(me, d);
    if (x.error) return x;
    if (x.game.status !== 'proposed') return { error: 'Время уже согласовано — обновите страницу.' };
    x.game.status = 'confirmed'; x.game.updatedAt = Date.now();
    crmSave(x.games, x.game);
    crmTouch(x.clients, x.client);
    crmLog(me.email, 'Клиент согласен на новое время', x.client.name + ' · ' + x.game.localText);
    var g = x.game, c = x.client, games = x.games;
    return { after: [function () {
      sendToTelegram('<b>Клиент согласен на новое время</b>\n' + esc(crmGameTitle(games, g)) + ' · ' + esc(c.name) + '\n' + esc(crmTimeLine(g)) + '\nМенеджер: ' + esc(me.name || me.email));
    }] };
  },

  'game.result': function (me, d) {
    var x = crmGameWithClient(me, d);
    if (x.error) return x;
    if (['confirmed', 'pending', 'proposed'].indexOf(x.game.status) === -1) return { error: 'Результат этой игры уже отмечен.' };
    var result = d.result === 'cancelled' ? 'cancelled' : 'done';
    x.game.status = result;
    x.game.participants = result === 'done' ? Math.max(0, Math.min(500, parseInt(d.participants, 10) || 0)) : '';
    var note = clean(d.note, 300);
    if (note) x.game.note = x.game.note ? x.game.note + ' · ' + note : note;
    x.game.updatedAt = Date.now();
    crmSave(x.games, x.game);
    crmTouch(x.clients, x.client);
    crmLog(me.email, result === 'done' ? 'Игра проведена' : 'Игра не состоялась', x.client.name + ' · ' + x.game.localText);
    return {};
  },

  'game.confirm': function (me, d) {
    var x = crmGameWithClient(me, d);
    if (x.error) return x;
    if (x.game.status !== 'pending' && x.game.status !== 'proposed') return { error: 'Эта игра уже не ждёт подтверждения — обновите страницу.' };
    x.game.status = 'confirmed'; x.game.updatedAt = Date.now();
    crmSave(x.games, x.game);
    crmTouch(x.clients, x.client);
    crmLog(me.email, 'Игра подтверждена', x.client.name + ' · ' + x.game.localText);
    return { after: [crmMailManager('confirm', x.games, x.game, x.client, crmTable('team'))] };
  },

  'game.propose': function (me, d) {
    var x = crmGameWithClient(me, d);
    if (x.error) return x;
    if (x.game.status !== 'pending' && x.game.status !== 'proposed') return { error: 'Эта игра уже не ждёт подтверждения — обновите страницу.' };
    var g = crmGameIn({ type: x.game.type, at: d.at, tz: d.tz, format: x.game.format, address: x.game.address || '-' }, x.game.type);
    if (g.error) return g;
    x.game.at = g.at; x.game.tz = g.tz;
    x.game.localText = crmLocalText(g.at, g.tz); x.game.mskText = crmMskText(g.at);
    x.game.status = 'proposed'; x.game.adminNote = clean(d.note, 300); x.game.updatedAt = Date.now();
    crmSave(x.games, x.game);
    crmTouch(x.clients, x.client);
    crmLog(me.email, 'Предложено другое время', x.client.name + ' · ' + x.game.localText);
    return { after: [crmMailManager('propose', x.games, x.game, x.client, crmTable('team'))] };
  },

  'game.decline': function (me, d) {
    var x = crmGameWithClient(me, d);
    if (x.error) return x;
    if (x.game.status !== 'pending' && x.game.status !== 'proposed') return { error: 'Эта игра уже не ждёт подтверждения — обновите страницу.' };
    var reason = clean(d.reason, 300);
    if (!reason) return { error: 'Напишите причину — менеджер увидит её в письме.' };
    x.game.status = 'declined'; x.game.reason = reason; x.game.updatedAt = Date.now();
    crmSave(x.games, x.game);
    crmTouch(x.clients, x.client);
    crmLog(me.email, 'Игра отклонена', x.client.name + ' · ' + reason);
    return { after: [crmMailManager('decline', x.games, x.game, x.client, crmTable('team'))] };
  },

  'pay.create': function (me, d) {
    var clients = crmTable('clients');
    var c = crmOwn(me, clients, d.client);
    if (!c) return { error: 'Клиент не найден — обновите страницу.' };
    var amount = Math.round(Number(String(d.amount).replace(/[^\d.]/g, '')));
    if (!isFinite(amount) || amount <= 0 || amount > 1e9) return { error: 'Проверьте сумму.' };
    var name = clean(d.name, 120);
    if (!name) return { error: 'Выберите, что оплачивают.' };
    var stage = CRM_PSTAGE[d.stage] ? d.stage : '';
    var status = me.role === 'admin' && CRM_PSTAT[d.status] ? d.status : 'invoice';
    var date = Number(d.date);
    if (!isFinite(date) || date <= 0) date = Date.now();
    var now = Date.now();
    var pays = crmTable('pays');
    crmSave(pays, {
      id: crmId('p'), client: c.id, clientName: c.name, manager: c.owner, name: name, amount: amount, stage: stage,
      status: status, date: date, paidAt: status === 'paid' ? now : '', note: clean(d.note, 200), createdAt: now
    });
    crmTouch(clients, c);
    crmLog(me.email, 'Оплата: ' + CRM_PSTAT[status], c.name + ' · ' + name + ' · ' + crmRub(amount));
    return {};
  },

  'pay.status': function (me, d) {
    var pays = crmTable('pays');
    var p = pays.rows.filter(function (x) { return x.id === String(d.id || ''); })[0];
    if (!p) return { error: 'Оплата не найдена — обновите страницу.' };
    if (!CRM_PSTAT[d.status]) return { error: 'Неизвестный статус.' };
    p.status = d.status;
    p.paidAt = d.status === 'paid' ? Date.now() : '';
    crmSave(pays, p);
    var clients = crmTable('clients');
    var c = crmOwn(me, clients, p.client);
    if (c) crmTouch(clients, c);
    crmLog(me.email, 'Оплата: ' + CRM_PSTAT[d.status], p.clientName + ' · ' + crmRub(p.amount));
    return {};
  },

  'team.add': function (me, d) {
    var team = crmTable('team');
    var email = crmEmail(d.email);
    var name = clean(d.name, 80);
    if (!name) return { error: 'Укажите имя.' };
    if (!crmValidEmail(email)) return { error: 'Проверьте адрес почты.' };
    if (crmFindUser(team, email)) return { error: 'Эта почта уже в списке.' };
    var role = CRM_ROLE[d.role] ? d.role : 'manager';
    var rate = role === 'manager' ? 0.5 : '';
    crmSave(team, { email: email, name: name, role: role, plan: role === 'manager' ? CRM_PLANS[String(rate)] : '', rate: rate, active: true, added: Date.now() });
    crmLog(me.email, 'Добавлен сотрудник', name + ' · ' + email + ' · ' + CRM_ROLE[role]);
    return {};
  },

  'team.toggle': function (me, d) {
    var team = crmTable('team');
    var u = crmFindUser(team, d.email);
    if (!u) return { error: 'Сотрудник не найден.' };
    if (crmEmail(u.email) === crmEmail(me.email)) return { error: 'Себя отключить нельзя.' };
    u.active = !u.active;
    crmSave(team, u);
    crmLog(me.email, u.active ? 'Доступ включён' : 'Доступ отключён', u.email);
    return {};
  },

  'report.send': function () {
    var sent = sendToTelegram(crmReportText(crmAll()));
    if (!sent.ok) return { error: 'Отчёт не ушёл в Telegram: ' + sent.error };
    return {};
  }
};

// ---------- отчёт ----------------------------------------------------------------------

function crmStage(c, games, pays) {
  if (c.lostReason) return 'lost';
  var rank = { demo: 0, demo_done: 1, pilot: 2, single: 3, annual: 4 };
  var gameStage = { demo: 'demo', pilot: 'pilot', single: 'single', annual: 'annual' };
  var r = -1, s = 'demo';
  function up(k) { if (k && rank[k] > r) { r = rank[k]; s = k; } }
  games.forEach(function (g) {
    if (g.client !== c.id || g.status === 'declined' || g.status === 'cancelled') return;
    up(g.type === 'demo' ? (g.status === 'done' ? 'demo_done' : 'demo') : gameStage[g.type]);
  });
  pays.forEach(function (p) { if (p.client === c.id && p.status !== 'cancelled' && p.status !== 'unpaid') up(p.stage); });
  return s;
}

function crmReportText(all) {
  all = all || crmAll();
  var now = Date.now();
  var games = all.games.rows, pays = all.pays.rows;
  var clients = all.clients.rows.filter(function (c) { return c.owner; });
  var managers = all.team.rows.filter(function (u) { return u.active && u.role === 'manager'; });
  var stage = {};
  clients.forEach(function (c) { stage[c.id] = crmStage(c, games, pays); });
  function count(list) { var o = {}; list.forEach(function (c) { o[stage[c.id]] = (o[stage[c.id]] || 0) + 1; }); return o; }
  var by = count(clients);
  var open = function (g) { return g.status === 'pending' || g.status === 'confirmed' || g.status === 'proposed'; };
  var today = crmDay(now), tomorrow = crmDay(now + 864e5), month = today.slice(0, 7);
  var newC = clients.filter(function (c) { return now - c.created < 864e5; }).length;
  var newG = games.filter(function (g) { return now - g.createdAt < 864e5; }).length;
  var doneG = games.filter(function (g) { return g.status === 'done' && g.at < now && now - g.at < 864e5; }).length;
  var pend = games.filter(function (g) { return g.status === 'pending'; }).length;
  var gToday = games.filter(function (g) { return open(g) && crmDay(g.at) === today; }).length;
  var gTom = games.filter(function (g) { return open(g) && crmDay(g.at) === tomorrow; }).length;
  function paidInMonth(p) { return p.status === 'paid' && crmDay(p.paidAt || p.date).slice(0, 7) === month; }
  var paidM = pays.filter(paidInMonth).reduce(function (s, p) { return s + p.amount; }, 0);
  var wait = pays.filter(function (p) { return p.status === 'invoice'; }).reduce(function (s, p) { return s + p.amount; }, 0);
  var idle = clients.filter(function (c) {
    return !c.lostReason && now - (c.last || c.created) > CRM_IDLE_DAYS * 864e5 &&
      !games.some(function (g) { return g.client === c.id && open(g) && g.at > now; });
  }).length;

  var lines = [
    '<b>Бизнес Квест · CRM на ' + Number(Utilities.formatDate(new Date(now), CRM_MSK, 'd')) + ' ' + CRM_MONTHS[Number(Utilities.formatDate(new Date(now), CRM_MSK, 'M')) - 1] + '</b>',
    'Менеджеров: ' + managers.length + ' · клиентов: ' + clients.length, ''
  ];
  CRM_STAGES.forEach(function (s) { lines.push(s[1] + ' — ' + (by[s[0]] || 0)); });
  lines.push('',
    'За сутки: +' + newC + ' ' + crmPlural(newC, 'клиент', 'клиента', 'клиентов') + ' · назначено игр: ' + newG + ' · проведено: ' + doneG,
    'Ждут подтверждения: ' + pend + ' ' + crmPlural(pend, 'игра', 'игры', 'игр'),
    'Игр сегодня: ' + gToday + ' · завтра: ' + gTom,
    'Оплачено в этом месяце: ' + crmRub(paidM) + ' · ждём по счетам: ' + crmRub(wait));
  if (idle) lines.push('Нет движения больше ' + CRM_IDLE_DAYS + ' дней: ' + idle);

  var owners = all.team.rows.filter(function (u) {
    return (u.active && u.role === 'manager') || clients.some(function (c) { return c.owner === crmEmail(u.email); });
  });
  if (owners.length) lines.push('');
  owners.forEach(function (u) {
    var mine = clients.filter(function (c) { return c.owner === crmEmail(u.email); });
    var st = count(mine);
    var parts = CRM_STAGES.filter(function (s) { return st[s[0]]; }).map(function (s) { return s[1].toLowerCase() + ' ' + st[s[0]]; });
    var ids = {};
    mine.forEach(function (c) { ids[c.id] = true; });
    var paid = pays.filter(function (p) { return ids[p.client] && paidInMonth(p); }).reduce(function (s, p) { return s + p.amount; }, 0);
    lines.push('<b>' + esc(u.name || u.email) + '</b> — ' + mine.length + ' ' + crmPlural(mine.length, 'клиент', 'клиента', 'клиентов') +
      (parts.length ? ' (' + parts.join(', ') + ')' : '') + ' · оплачено ' + crmRub(paid));
  });
  return lines.join('\n');
}

/** Ежедневный отчёт в Telegram. Запускается триггером около 9:00 по Москве (ставит checkSetup). */
function crmDailyReport() {
  var sent = sendToTelegram(crmReportText());
  if (!sent.ok) throw new Error('Отчёт CRM не ушёл в Telegram: ' + sent.error);
}

/** Листы CRM, админ, ключ входа, почта и триггер отчёта. Вызывается из checkSetup. */
function crmSetup(say) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(CRM).forEach(function (k) {
    var existed = !!ss.getSheetByName(CRM[k].name);
    crmSheet(k);
    say('✓ Лист «' + CRM[k].name + '» ' + (existed ? 'на месте' : 'создан'));
  });

  var team = crmTable('team');
  var admins = team.rows.filter(function (u) { return u.role === 'admin' && u.active; });
  if (!admins.length) {
    var owner = crmEmail(Session.getEffectiveUser().getEmail());
    if (owner) {
      var existing = crmFindUser(team, owner);
      if (existing) { existing.role = 'admin'; existing.active = true; crmSave(team, existing); }
      else crmSave(team, { email: owner, name: 'Администратор', role: 'admin', plan: '', rate: '', active: true, added: Date.now() });
      say('✓ Админ CRM: ' + owner + ' — имя можно поменять на листе «CRM — команда»');
    } else {
      say('! Не получилось узнать вашу почту. Впишите себя на лист «CRM — команда»: почта, имя, роль «админ», доступ «да».');
    }
  } else {
    say('✓ Админ CRM: ' + admins.map(function (u) { return u.email; }).join(', '));
  }

  crmSecret();
  say('✓ Ключ для входа в CRM на месте');
  say('✓ Почта: сегодня можно отправить ещё ' + MailApp.getRemainingDailyQuota() + ' писем (коды для входа, решения по играм)');

  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'crmDailyReport') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('crmDailyReport').timeBased().everyDays(1).atHour(9).nearMinute(0).inTimezone(CRM_MSK).create();
  say('✓ Отчёт CRM будет приходить в группу каждый день около 9:00 по Москве');
}
