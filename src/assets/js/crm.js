/* CRM marketgame.quest (/crm/): клиенты, с которыми менеджер уже договорился
   об игре, согласование времени игр, оплаты и команда.

   Данные лежат в Google Таблице продаж (листы «CRM — …»). Страница ходит
   к тому же Apps Script, что принимает заявки с сайта (apps-script/Code.gs):
   POST text/plain с полем api: 'crm'. Каждый ответ приносит свежие данные,
   поэтому после любого действия экран перерисовывается целиком.

   Вход — по одноразовому коду на почту. Скрипт выдаёт подписанный токен
   на 30 дней, он хранится в localStorage этого браузера. */

(function () {
  'use strict';

  var node = document.getElementById('crm-data');
  var CFG = {};
  try { CFG = JSON.parse(node.textContent); } catch (e) { /* покажем ошибку ниже */ }

  // ---------- справочники ----------------------------------------------------
  var REGIONS = (CFG.regions || []).slice().sort(function (a, b) { return a[0].localeCompare(b[0], 'ru'); });
  var PRICES = CFG.prices || [];
  var ABROAD = 'За рубежом';
  var GROUP_TZ = { 'MSK-1': 'Europe/Kaliningrad', 'MSK': 'Europe/Moscow', 'MSK+1': 'Europe/Samara', 'MSK+2': 'Asia/Yekaterinburg', 'MSK+3': 'Asia/Omsk', 'MSK+4': 'Asia/Novosibirsk', 'MSK+5': 'Asia/Irkutsk', 'MSK+6': 'Asia/Yakutsk', 'MSK+7': 'Asia/Vladivostok', 'MSK+8': 'Asia/Magadan', 'MSK+9': 'Asia/Kamchatka' };
  // Тот же список поясов — в apps-script/Code.gs (CRM_TZ). Добавили город здесь — добавьте и там.
  var TZ_RU = [
    ['Europe/Kaliningrad', 'Калининград'],
    ['Europe/Moscow', 'Москва, Санкт-Петербург, Казань'],
    ['Europe/Samara', 'Самара, Ижевск, Саратов'],
    ['Asia/Yekaterinburg', 'Екатеринбург, Уфа, Челябинск, Тюмень'],
    ['Asia/Omsk', 'Омск'],
    ['Asia/Novosibirsk', 'Новосибирск, Красноярск, Кемерово, Томск'],
    ['Asia/Irkutsk', 'Иркутск, Улан-Удэ'],
    ['Asia/Yakutsk', 'Якутск, Чита, Благовещенск'],
    ['Asia/Vladivostok', 'Владивосток, Хабаровск'],
    ['Asia/Magadan', 'Магадан, Южно-Сахалинск'],
    ['Asia/Kamchatka', 'Петропавловск-Камчатский, Анадырь']
  ];
  var TZ_WORLD = [
    ['Europe/Minsk', 'Минск'], ['Europe/Istanbul', 'Стамбул'], ['Asia/Nicosia', 'Кипр'],
    ['Europe/Belgrade', 'Белград'], ['Europe/Berlin', 'Берлин'], ['Europe/London', 'Лондон'],
    ['Asia/Yerevan', 'Ереван'], ['Asia/Tbilisi', 'Тбилиси'], ['Asia/Baku', 'Баку'],
    ['Asia/Dubai', 'Дубай'], ['Asia/Tashkent', 'Ташкент'], ['Asia/Almaty', 'Алматы, Астана'],
    ['Asia/Bishkek', 'Бишкек'], ['Asia/Bangkok', 'Бангкок, Пхукет'], ['Asia/Ho_Chi_Minh', 'Вьетнам'],
    ['Asia/Makassar', 'Бали'], ['Asia/Shanghai', 'Пекин, Шанхай'], ['America/New_York', 'Нью-Йорк']
  ];
  var MSK = 'Europe/Moscow';
  var VTZ = (function () { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || MSK; } catch (e) { return MSK; } })();

  var GAME = {
    demo: { name: 'Демо-игра', short: 'Демо', stage: 'demo' },
    pilot: { name: 'Пробная игра', short: 'Пробная', stage: 'pilot' },
    single: { name: 'Разовая игра', short: 'Разовая', stage: 'single' },
    annual: { name: 'Игра годовой программы', short: 'Годовая', stage: 'annual' },
    extra: { name: 'Дополнительная игра', short: 'Доп. игра', stage: null }
  };
  var STAGES = [
    ['demo', 'Демо назначено', 'var(--info)'],
    ['demo_done', 'Демо проведено', 'var(--neutral)'],
    ['pilot', 'Пробная игра', 'var(--warn)'],
    ['single', 'Разовая игра', 'var(--accent-ink)'],
    ['annual', 'Годовой контракт', 'var(--ok)'],
    ['lost', 'Отказ / пауза', 'var(--mute)']
  ];
  var RANK = { demo: 0, demo_done: 1, pilot: 2, single: 3, annual: 4 };
  var GSTAT = {
    pending: ['ждёт подтверждения', 'var(--warn)'],
    proposed: ['предложено другое время', 'var(--info)'],
    confirmed: ['подтверждена', 'var(--ok)'],
    done: ['проведена', 'var(--neutral)'],
    cancelled: ['не состоялась', 'var(--mute)'],
    declined: ['отклонена', 'var(--bad)']
  };
  var PSTAT = {
    invoice: ['счёт выставлен', 'var(--warn)'],
    paid: ['оплачено', 'var(--ok)'],
    unpaid: ['не оплачено', 'var(--bad)'],
    cancelled: ['отменён', 'var(--mute)']
  };
  var ROLE = { admin: 'админ', manager: 'менеджер', host: 'ведущий' };
  var PLANS = [
    { rate: 0.2, text: 'без фикса, 20%', label: 'Без фикса, 20% с продаж и продлений' },
    { rate: 0.15, text: 'фикс + 15%', label: 'Фикс + 15% с контрактов' }
  ];
  var LOST_REASONS = ['Нет бюджета', 'Не сейчас — вернуться позже', 'Выбрали другое', 'Перестали отвечать', 'Другое'];
  var OLD_SCRIPT = 'Скрипт в Google Таблице ещё старый. Вставьте новый apps-script/Code.gs, запустите checkSetup и разверните новую версию — инструкция в README, раздел «CRM».';
  var DAY = 864e5;
  var NOW = Date.now();
  var TOKEN_KEY = 'mg.crm.token';
  var EMAIL_KEY = 'mg.crm.email';

  // ---------- время и пояса ---------------------------------------------------
  var dtfCache = {};
  function dtf(tz) {
    return dtfCache[tz] || (dtfCache[tz] = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }));
  }
  function offMin(tz, ms) {
    var p = {};
    dtf(tz).formatToParts(new Date(ms)).forEach(function (x) { p[x.type] = x.value; });
    var asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
    return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000);
  }
  // Дата и время «на часах клиента» → момент времени
  function toUtc(date, time, tz) {
    var d = date.split('-').map(Number), t = time.split(':').map(Number);
    var guess = Date.UTC(d[0], d[1] - 1, d[2], t[0], t[1]);
    var u = guess - offMin(tz, guess) * 6e4;
    return guess - offMin(tz, u) * 6e4;
  }
  function ymd(ms, tz) { return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms)); }
  function hm(ms, tz) { return new Intl.DateTimeFormat('ru-RU', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(new Date(ms)); }
  function day(ms, tz) { return new Intl.DateTimeFormat('ru-RU', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'long' }).format(new Date(ms)); }
  function dayShort(ms, tz) { return new Intl.DateTimeFormat('ru-RU', { timeZone: tz || MSK, day: 'numeric', month: 'short' }).format(new Date(ms)).replace('.', ''); }
  function fmtNum(n) { return String(n).replace('.', ','); }
  function mskLabel(tz, ms) {
    var d = (offMin(tz, ms) - offMin(MSK, ms)) / 60;
    return d === 0 ? 'МСК' : 'МСК' + (d > 0 ? '+' : '−') + fmtNum(Math.abs(d));
  }
  function utcLabel(tz, ms) {
    var o = offMin(tz, ms), h = Math.trunc(Math.abs(o) / 60), m = Math.abs(o) % 60;
    return 'UTC' + (o < 0 ? '−' : '+') + h + (m ? ':' + String(m).padStart(2, '0') : '');
  }
  function tzCity(tz) {
    var all = TZ_RU.concat(TZ_WORLD);
    for (var i = 0; i < all.length; i++) if (all[i][0] === tz) return all[i][1].split(',')[0];
    return String(tz || '').split('/').pop().replace(/_/g, ' ');
  }
  function isRuTz(tz) { return TZ_RU.some(function (x) { return x[0] === tz; }); }
  function validTz(tz) { try { dtf(tz); return true; } catch (e) { return false; } }
  // Время игры: у клиента, по Москве и у того, кто смотрит
  function when(ms, tz) {
    if (!validTz(tz)) tz = MSK;
    var extra = [];
    if (offMin(tz, ms) !== offMin(MSK, ms)) extra.push((ymd(ms, tz) === ymd(ms, MSK) ? '' : day(ms, MSK) + ', ') + hm(ms, MSK) + ' по Москве');
    if (offMin(VTZ, ms) !== offMin(tz, ms) && offMin(VTZ, ms) !== offMin(MSK, ms)) extra.push('у вас ' + (ymd(ms, tz) === ymd(ms, VTZ) ? '' : day(ms, VTZ) + ', ') + hm(ms, VTZ));
    return {
      local: day(ms, tz) + ' · ' + hm(ms, tz),
      zone: tzCity(tz) + ', ' + (isRuTz(tz) ? mskLabel(tz, ms) : utcLabel(tz, ms)),
      extra: extra.join(' · ')
    };
  }
  function ago(ms) {
    var d = Math.floor((NOW - ms) / DAY);
    if (d <= 0) return 'сегодня';
    if (d === 1) return 'вчера';
    return d + ' ' + plural(d, 'день', 'дня', 'дней') + ' назад';
  }

  // ---------- мелочи ----------------------------------------------------------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function plural(n, one, few, many) { var a = Math.abs(n) % 100, b = a % 10; if (a > 10 && a < 20) return many; if (b > 1 && b < 5) return few; if (b === 1) return one; return many; }
  function rub(n) { return new Intl.NumberFormat('ru-RU').format(Math.round(n || 0)) + ' ₽'; }
  function chip(text, color) { return '<span class="chip" style="--c:' + color + '">' + esc(text) + '</span>'; }
  function gstat(s) { return GSTAT[s] || [s || '—', 'var(--neutral)']; }
  function pstat(s) { return PSTAT[s] || [s || '—', 'var(--neutral)']; }
  function stageInfo(s) { return STAGES.filter(function (y) { return y[0] === s; })[0] || STAGES[0]; }
  function stageChip(s) { var x = stageInfo(s); return chip(x[1], x[2]); }
  function gameInfo(t) { return GAME[t] || { name: t || 'Игра', short: t || 'Игра', stage: null }; }
  function store(key, value) { try { if (value == null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch (e) { /* приватный режим */ } }
  function stored(key) { try { return localStorage.getItem(key) || ''; } catch (e) { return ''; } }
  function val(form, name) { var el = form.elements.namedItem(name); return el ? String(el.value || '').trim() : ''; }
  function validEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s); }

  // ---------- данные ----------------------------------------------------------
  var D = { me: null, users: [], clients: [], games: [], pays: [], report: '' };
  function setData(d) {
    D = {
      me: d.me, users: d.users || [], clients: d.clients || [], games: d.games || [],
      pays: d.pays || [], report: d.report || ''
    };
    NOW = Date.now();
  }
  function me() { return D.me; }
  function isAdmin() { return !!D.me && D.me.role === 'admin'; }
  function user(email) { return D.users.filter(function (u) { return u.email === email; })[0]; }
  function userName(email) { var u = user(email); return u ? u.name : (email || 'не закреплён'); }
  function firstName(email) { return email ? userName(email).split(' ')[0] : 'не закреплён'; }
  function client(id) { return D.clients.filter(function (c) { return c.id === id; })[0]; }
  function game(id) { return D.games.filter(function (g) { return g.id === id; })[0]; }
  function gamesOf(cid) { return D.games.filter(function (g) { return g.client === cid; }).sort(function (a, b) { return a.at - b.at; }); }
  function paysOf(cid) { return D.pays.filter(function (p) { return p.client === cid; }).sort(function (a, b) { return a.date - b.date; }); }
  function paidAt(p) { return p.paidAt || p.date; }

  function stageOf(c) {
    if (c.lost) return 'lost';
    var r = -1, s = 'demo';
    function up(k) { if (k && RANK[k] > r) { r = RANK[k]; s = k; } }
    gamesOf(c.id).forEach(function (g) {
      if (g.status === 'declined' || g.status === 'cancelled') return;
      up(g.type === 'demo' ? (g.status === 'done' ? 'demo_done' : 'demo') : gameInfo(g.type).stage);
    });
    paysOf(c.id).forEach(function (p) { if (p.status !== 'cancelled' && p.status !== 'unpaid') up(p.stage); });
    return s;
  }
  function isOpen(g) { return g.status === 'pending' || g.status === 'confirmed' || g.status === 'proposed'; }
  function nextGame(c) { return gamesOf(c.id).filter(function (g) { return isOpen(g) && g.at > NOW; })[0]; }
  function annualNo(g) {
    var list = gamesOf(g.client).filter(function (x) { return x.type === 'annual' && x.status !== 'declined' && x.status !== 'cancelled'; });
    return list.indexOf(g) + 1;
  }
  function gameTitle(g) { var n = g.type === 'annual' ? annualNo(g) : 0; return gameInfo(g.type).name + (n ? ' · ' + n + '-я из 12' : ''); }
  function formatText(g) {
    if (g.type === 'demo') return 'Онлайн, 60 минут';
    return g.format === 'offline' ? 'Офлайн, ведущий на месте' + (g.address ? ' · ' + g.address : '') : 'Онлайн: зал клиента, ведущий по видеосвязи';
  }
  function hintsOf(c) {
    var h = [];
    if (c.lost) return h;
    var gs = gamesOf(c.id);
    gs.forEach(function (g) {
      if (g.status === 'proposed') h.push('Предложено другое время для игры «' + gameInfo(g.type).short + '» — согласуйте с клиентом');
      if (g.status === 'confirmed' && g.at < NOW) h.push('Игра прошла — отметьте, сколько было участников');
    });
    if (!gs.some(function (g) { return isOpen(g) && g.at > NOW; })) {
      var st = stageOf(c);
      var last = gs.filter(function (g) { return g.status === 'done'; }).pop();
      if (st === 'demo_done' && last) h.push('Демо прошло ' + ago(last.at) + ' — назначьте пробную игру или отметьте отказ');
      else if (st === 'pilot' && last && last.type === 'pilot') h.push('Пробная игра прошла ' + ago(last.at) + ' — предложите разовую игру или годовую программу');
      else if (st === 'single' && last && last.type === 'single') h.push('Разовая игра прошла ' + ago(last.at) + ' — предложите годовую программу');
      else if (st === 'annual') h.push('Назначьте следующую игру годовой программы');
      else if (!gs.some(isOpen) && st === 'demo') h.push('Нет назначенной игры — назначьте демо или отметьте отказ');
    }
    paysOf(c.id).forEach(function (p) {
      if (p.status === 'invoice' && NOW - p.date > 5 * DAY) h.push('Счёт на ' + rub(p.amount) + ' выставлен ' + ago(p.date) + ' и ещё не оплачен');
    });
    return h;
  }
  function idleDays(c) { return Math.floor((NOW - (c.last || c.created)) / DAY); }
  function isIdle(c) { return !c.lost && c.owner && idleDays(c) > 30 && !nextGame(c); }
  function paidSum(c) { return paysOf(c.id).filter(function (p) { return p.status === 'paid'; }).reduce(function (s, p) { return s + p.amount; }, 0); }
  function waitSum(c) { return paysOf(c.id).filter(function (p) { return p.status === 'invoice'; }).reduce(function (s, p) { return s + p.amount; }, 0); }
  function thisMonth(ms) { return ymd(ms, MSK).slice(0, 7) === ymd(NOW, MSK).slice(0, 7); }
  function rateOf(email) { var u = user(email); return u && u.rate ? +u.rate : 0; }

  // ---------- состояние и связь с сервером --------------------------------------
  var S = { view: 'boot', tab: 'clients', stage: 'all', mgr: 'all', sel: null, modal: null, busy: false, fatal: '', login: { step: 'email', email: '', err: '' } };
  var app = document.getElementById('app');
  var modalRoot = document.getElementById('modal');
  var toastEl = document.getElementById('toast');
  var toastTimer, busyEl;

  function toast(t, bad) {
    toastEl.textContent = t;
    toastEl.className = 'toast' + (bad ? ' toast--bad' : '');
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, bad ? 7000 : 3600);
  }
  function showBusy(on) {
    if (on && !busyEl) { busyEl = document.createElement('div'); busyEl.className = 'busy'; busyEl.setAttribute('aria-hidden', 'true'); document.body.appendChild(busyEl); }
    if (!on && busyEl) { busyEl.remove(); busyEl = null; }
  }
  function mkErr(message, code) { var e = new Error(message); e.code = code || ''; return e; }

  function api(action, payload) {
    var body = Object.assign({ api: 'crm', action: action, token: stored(TOKEN_KEY) }, payload || {});
    return fetch(CFG.endpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) })
      .then(function (r) {
        if (!r.ok) throw mkErr('Сервер не ответил (' + r.status + '). Попробуйте ещё раз.');
        return r.text();
      }, function () { throw mkErr('Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.'); })
      .then(function (text) {
        var res;
        try { res = JSON.parse(text); } catch (e) { throw mkErr('Скрипт ответил не так, как ожидалось. Проверьте, что он развёрнут, и попробуйте ещё раз.'); }
        if (res && res.crm && res.status === 'ok') { if (res.data) setData(res.data); return res; }
        if (res && res.crm && res.code === 'auth') throw mkErr(res.message || 'Войдите заново.', 'auth');
        if (res && res.crm) throw mkErr(res.message || 'Не получилось. Попробуйте ещё раз.');
        throw mkErr(OLD_SCRIPT, 'old');
      });
  }

  // Действие с кнопки: полоса загрузки, ошибки — во всплывашке
  function run(action, payload, after) {
    if (S.busy) return;
    S.busy = true; showBusy(true);
    api(action, payload).then(function (res) {
      S.busy = false; showBusy(false);
      if (after) after(res); else render(true);
    }, function (err) {
      S.busy = false; showBusy(false);
      handleError(err);
    });
  }
  // Действие из формы: кнопка «Сохраняем…», ошибка — под формой, введённое не теряется
  function submitForm(form, action, payload, after) {
    if (S.busy) return;
    var btn = form.querySelector('button:not([type=button])');
    var label = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Сохраняем…'; }
    S.busy = true; showBusy(true);
    api(action, payload).then(function (res) {
      S.busy = false; showBusy(false);
      after(res);
    }, function (err) {
      S.busy = false; showBusy(false);
      if (btn) { btn.disabled = false; btn.textContent = label; }
      if (err.code === 'auth') return handleError(err);
      fail(form, err.message);
    });
  }
  function handleError(err) {
    if (err.code === 'auth') {
      store(TOKEN_KEY, null);
      S.view = 'login'; S.modal = null;
      S.login = { step: 'email', email: stored(EMAIL_KEY), err: err.message || 'Сессия закончилась — войдите снова.' };
      render();
      return;
    }
    toast(err.message, true);
  }
  function fail(form, msg) { var el = form.querySelector('.err'); if (el) el.textContent = msg; }

  // ---------- каркас ----------------------------------------------------------
  function pendingCount() { return D.games.filter(function (g) { return g.status === 'pending'; }).length; }
  function visibleClients() {
    return D.clients.filter(function (c) { return !isAdmin() || S.mgr === 'all' || c.owner === S.mgr; });
  }
  function shell() {
    var u = me();
    var tabs = isAdmin()
      ? [['queue', 'На подтверждение', pendingCount()], ['clients', 'Клиенты'], ['games', 'Игры'], ['pay', 'Оплаты'], ['team', 'Команда'], ['report', 'Отчёт в Telegram']]
      : [['clients', 'Мои клиенты', D.clients.length, true], ['games', 'Игры'], ['pay', 'Оплаты']];
    if (!tabs.some(function (t) { return t[0] === S.tab; })) S.tab = tabs[0][0];
    var nav = tabs.map(function (t) {
      var badge = t[2] ? '<span class="badge' + (t[3] ? ' badge--soft' : '') + '">' + t[2] + '</span>' : '';
      return '<button type="button" class="tab" data-act="tab" data-tab="' + t[0] + '"' + (S.tab === t[0] ? ' aria-current="page"' : '') + '>' + t[1] + badge + '</button>';
    }).join('');
    var body = { clients: clientsView, games: gamesView, pay: paysView, queue: queueView, team: teamView, report: reportView }[S.tab]();
    return '<header class="top"><div class="wrap"><div class="top__in"><a class="logo" href="/" style="color:inherit;text-decoration:none">Бизнес <em>Квест</em><small>CRM</small></a>' +
      '<span class="me">' + esc(u.name || u.email) + ' · ' + (ROLE[u.role] || '') + '</span>' +
      '<button type="button" class="btn btn--ghost btn--sm" data-act="logout">Выйти</button></div>' +
      '<nav class="tabs" aria-label="Разделы CRM">' + nav + '</nav></div></header>' +
      '<main class="wrap main">' + body + '</main>';
  }
  function managers() { return D.users.filter(function (u) { return u.role === 'manager' || u.role === 'admin'; }); }
  function mgrFilter() {
    if (!isAdmin()) return '';
    var opts = '<option value="all">Все менеджеры</option>' + managers().map(function (u) {
      return '<option value="' + esc(u.email) + '"' + (S.mgr === u.email ? ' selected' : '') + '>' + esc(u.name || u.email) + '</option>';
    }).join('');
    return '<label class="sr" for="mgrSel">Менеджер</label><select id="mgrSel" class="sel" data-change="mgr">' + opts + '</select>';
  }

  // ---------- клиенты ---------------------------------------------------------
  function clientsView() {
    var all = visibleClients();
    var counts = { all: all.length };
    all.forEach(function (c) { var s = stageOf(c); counts[s] = (counts[s] || 0) + 1; });
    var list = all.filter(function (c) { return S.stage === 'all' || stageOf(c) === S.stage; })
      .sort(function (a, b) { return (b.last || b.created) - (a.last || a.created); });
    if (S.sel && !client(S.sel)) S.sel = null;
    if (!S.sel && window.matchMedia('(min-width: 900px)').matches && list.length) S.sel = list[0].id;
    var chips = '<button type="button" class="fchip" data-act="stage" data-s="all" aria-pressed="' + (S.stage === 'all') + '">Все <i>' + counts.all + '</i></button>' +
      STAGES.map(function (s) {
        return '<button type="button" class="fchip" data-act="stage" data-s="' + s[0] + '" aria-pressed="' + (S.stage === s[0]) + '">' + s[1] + ' <i>' + (counts[s[0]] || 0) + '</i></button>';
      }).join('');
    var empty = all.length
      ? '<p class="empty">На этом этапе клиентов нет.</p>'
      : '<p class="empty">Клиентов пока нет. Нажмите «+ Клиент», когда договоритесь с компанией о первой игре.</p>';
    var rows = list.length ? list.map(clientRow).join('') : empty;
    var sel = S.sel ? client(S.sel) : null;
    return '<div class="bar"><div class="bar__l"><h1>' + (isAdmin() ? 'Клиенты' : 'Мои клиенты') + '</h1>' + mgrFilter() + '</div>' +
      '<button type="button" class="btn" data-act="newClient">+ Клиент</button></div>' +
      '<div class="filters" role="group" aria-label="Этап">' + chips + '</div>' +
      '<div class="cl"' + (sel ? ' data-sel' : '') + '><div class="cl__list"><div class="list">' + rows + '</div></div>' +
      '<div class="cl__detail">' + (sel ? clientCard(sel) : '') + '</div></div>';
  }
  function clientRow(c) {
    var g = nextGame(c), h = hintsOf(c), line = '';
    if (h.length) line = '<span class="row__next row__next--warn">' + esc(h[0]) + '</span>';
    else if (g) line = '<span class="row__next">' + esc(gameInfo(g.type).short + ' · ' + dayShort(g.at, g.tz) + ', ' + hm(g.at, g.tz) + ' (' + tzCity(g.tz) + ') · ' + gstat(g.status)[0]) + '</span>';
    else if (c.lost) line = '<span class="row__next mute">' + esc(c.lost.reason) + '</span>';
    var sub = [c.region === ABROAD ? c.city || ABROAD : c.region, c.lpr.name].concat(isAdmin() ? [firstName(c.owner)] : []);
    return '<button type="button" class="row" data-act="open" data-id="' + esc(c.id) + '"' + (S.sel === c.id ? ' aria-current="true"' : '') + '>' +
      '<span class="row__top"><b>' + esc(c.name) + '</b>' + stageChip(stageOf(c)) + '</span>' +
      '<span class="row__sub">' + esc(sub.filter(Boolean).join(' · ')) + '</span>' + line + '</button>';
  }
  function copyBtn(text) { return text ? '<button type="button" class="copy" data-act="copy" data-text="' + esc(text) + '">Копировать</button>' : ''; }
  function assignSelect(c) {
    var opts = managers().filter(function (u) { return u.active || u.email === c.owner; }).map(function (u) {
      return '<option value="' + esc(u.email) + '"' + (u.email === c.owner ? ' selected' : '') + '>' + esc(u.name || u.email) + '</option>';
    }).join('');
    return '<label class="assign">Менеджер <select data-change="assign" data-id="' + esc(c.id) + '"><option value=""' + (c.owner ? '' : ' selected') + '>не закреплён</option>' + opts + '</select></label>';
  }
  function clientCard(c) {
    var admin = isAdmin();
    var hints = hintsOf(c).map(function (t) { return '<p class="hint">' + esc(t) + '</p>'; }).join('');
    if (c.lost) hints = '<p class="hint hint--lost">' + esc(c.lost.reason) + (c.lost.note ? ': ' + esc(c.lost.note) : '') + (c.lost.at ? ' · отмечено ' + ago(c.lost.at) : '') + '</p>';
    if (admin && isIdle(c)) hints += '<p class="hint">Нет движения ' + idleDays(c) + ' ' + plural(idleDays(c), 'день', 'дня', 'дней') + '. <button type="button" class="btn btn--ghost btn--sm" data-act="release" data-id="' + esc(c.id) + '">Снять закрепление</button></p>';
    var owned = admin ? assignSelect(c) : 'Закреплён за вами';
    var acts = c.lost
      ? '<button type="button" class="btn btn--line btn--sm" data-act="unlose" data-id="' + esc(c.id) + '">Вернуть в работу</button>'
      : '<button type="button" class="btn btn--sm" data-act="newGame" data-id="' + esc(c.id) + '">Назначить игру</button>' +
        '<button type="button" class="btn btn--line btn--sm" data-act="newPay" data-id="' + esc(c.id) + '">Добавить оплату</button>' +
        '<button type="button" class="btn btn--ghost btn--sm" data-act="lose" data-id="' + esc(c.id) + '">Отказ / пауза</button>';
    var L = c.lpr;
    var contacts = '<dl class="kv"><dt>ЛПР</dt><dd><b>' + esc(L.name) + '</b>' + (L.title ? '<span class="mute">' + esc(L.title) + '</span>' : '') + '</dd>' +
      '<dt>Телефон</dt><dd class="num">' + esc(L.phone) + copyBtn(L.phone) + '</dd>' +
      (L.email ? '<dt>Почта</dt><dd>' + esc(L.email) + copyBtn(L.email) + '</dd>' : '') +
      (L.tg ? '<dt>Telegram</dt><dd>' + esc(L.tg) + copyBtn(L.tg) + '</dd>' : '') +
      (c.inn ? '<dt>ИНН</dt><dd class="num">' + esc(c.inn) + '</dd>' : '') +
      (c.site ? '<dt>Сайт</dt><dd>' + esc(c.site) + '</dd>' : '') + '</dl>';
    var gs = gamesOf(c.id).slice().reverse();
    var gamesHtml = gs.length ? gs.map(function (g) { return gameEvent(g, c); }).join('') : '<p class="mute">Игр пока нет.</p>';
    var ps = paysOf(c.id).slice().reverse();
    var paysHtml = ps.length ? ps.map(function (p) { return payEvent(p, c); }).join('') : '<p class="mute">Оплат пока нет.</p>';
    var paid = paidSum(c), wait = waitSum(c);
    return '<button type="button" class="btn btn--ghost btn--sm back" data-act="back">← Все клиенты</button>' +
      '<article class="card" aria-labelledby="cardTitle"><div class="card__head"><div><h2 id="cardTitle">' + esc(c.name) + '</h2>' +
      '<p class="card__meta">' + esc([c.region === ABROAD ? ABROAD : c.region, c.city].filter(Boolean).join(' · ')) + ' · в CRM с ' + esc(dayShort(c.created, MSK)) + '</p>' +
      '<p class="card__meta">' + owned + '</p></div>' +
      stageChip(stageOf(c)) + '</div>' + hints + '<div class="acts">' + acts + '</div>' +
      '<section class="sec"><div class="sec__h"><h3>Контакты</h3><button type="button" class="btn btn--ghost btn--sm" data-act="edit" data-id="' + esc(c.id) + '">Изменить</button></div>' + contacts + '</section>' +
      '<section class="sec"><div class="sec__h"><h3>Игры</h3></div>' + gamesHtml + '</section>' +
      '<section class="sec"><div class="sec__h"><h3>Оплаты</h3></div>' + paysHtml +
      '<div class="total"><span>Принёс: <b>' + rub(paid) + '</b></span>' + (wait ? '<span class="mute">ожидается ' + rub(wait) + '</span>' : '') + '</div></section></article>';
  }
  function gameActions(g, c) {
    var a = [], id = esc(g.id);
    if (isAdmin() && g.status === 'pending') {
      a.push('<button type="button" class="btn btn--ok btn--sm" data-act="confirm" data-id="' + id + '">Подтвердить</button>');
      a.push('<button type="button" class="btn btn--line btn--sm" data-act="propose" data-id="' + id + '">Другое время</button>');
      a.push('<button type="button" class="btn btn--ghost btn--sm" data-act="decline" data-id="' + id + '">Отклонить</button>');
    }
    if (g.status === 'proposed' && (!isAdmin() || c.owner === me().email)) {
      a.push('<button type="button" class="btn btn--ok btn--sm" data-act="accept" data-id="' + id + '">Клиент согласен</button>');
      a.push('<button type="button" class="btn btn--line btn--sm" data-act="repropose" data-id="' + id + '">Предложить другое</button>');
    }
    if (g.status === 'confirmed' && g.at < NOW) a.push('<button type="button" class="btn btn--sm" data-act="done" data-id="' + id + '">Отметить, как прошла</button>');
    return a.length ? '<div class="ev__acts">' + a.join('') + '</div>' : '';
  }
  function gameEvent(g, c) {
    var w = when(g.at, g.tz), st = gstat(g.status);
    var meta = [formatText(g)];
    if (g.status === 'done' && g.participants) meta.push(g.participants + ' ' + plural(g.participants, 'участник', 'участника', 'участников'));
    else if (g.people) meta.push('~' + g.people + ' участников');
    if (g.note) meta.push(g.note);
    var note = g.adminNote && g.status === 'proposed' ? '<span class="ev__m"><b>Комментарий:</b> ' + esc(g.adminNote) + '</span>' : '';
    var why = g.reason && g.status === 'declined' ? '<span class="ev__m"><b>Причина:</b> ' + esc(g.reason) + '</span>' : '';
    return '<div class="ev"><span class="ev__t">' + esc(gameTitle(g)) + '</span>' + chip(st[0], st[1]) +
      '<span class="ev__w ev__m" style="color:var(--ink)">' + esc(w.local) + ' · ' + esc(w.zone) + '</span>' +
      (w.extra ? '<span class="ev__m">' + esc(w.extra) + '</span>' : '') +
      '<span class="ev__m">' + esc(meta.join(' · ')) + '</span>' + note + why + gameActions(g, c) + '</div>';
  }
  function payEvent(p, c) {
    var rate = rateOf(c.owner), extra = '', st = pstat(p.status);
    if (!isAdmin() && rate && (p.status === 'invoice' || p.status === 'paid')) {
      extra = '<span class="ev__m">Ваш процент: ' + Math.round(rate * 100) + '% = ' + rub(p.amount * rate) + (p.status === 'paid' ? '' : ' — после оплаты') + '</span>';
    }
    var acts = isAdmin() && p.status === 'invoice'
      ? '<div class="ev__acts"><button type="button" class="btn btn--ok btn--sm" data-act="paid" data-id="' + esc(p.id) + '">Оплачено</button><button type="button" class="btn btn--ghost btn--sm" data-act="unpaid" data-id="' + esc(p.id) + '">Не оплачено</button></div>'
      : '';
    return '<div class="ev"><span class="ev__t">' + esc(p.name) + ' · <span class="num">' + rub(p.amount) + '</span></span>' + chip(st[0], st[1]) +
      '<span class="ev__m">' + (p.status === 'paid' ? 'оплачено ' + esc(dayShort(paidAt(p), MSK)) : 'счёт от ' + esc(dayShort(p.date, MSK))) + (p.note ? ' · ' + esc(p.note) : '') + '</span>' + extra + acts + '</div>';
  }

  // ---------- игры ------------------------------------------------------------
  function visibleGames() {
    var ids = visibleClients().map(function (c) { return c.id; });
    return D.games.filter(function (g) { return ids.indexOf(g.client) !== -1; });
  }
  function gameRow(g) {
    var c = client(g.client);
    if (!c) return '';
    var w = when(g.at, g.tz), st = gstat(g.status), n = g.type === 'annual' ? annualNo(g) : 0;
    var what = [gameInfo(g.type).short + (n ? ' ' + n + '/12' : ''), g.type === 'demo' ? 'онлайн' : (g.format === 'offline' ? 'офлайн' : 'онлайн')];
    if (g.status === 'done' && g.participants) what.push(g.participants + ' уч.');
    else if (g.people) what.push('~' + g.people + ' уч.');
    if (isAdmin()) what.push(firstName(c.owner));
    return '<div class="grow"><div class="grow__w"><b>' + esc(w.local) + '</b><small>' + esc(w.zone) + (w.extra ? ' · ' + esc(w.extra) : '') + '</small></div>' +
      '<div class="grow__x"><button type="button" class="lnk" data-act="openc" data-id="' + esc(c.id) + '">' + esc(c.name) + '</button><small>' + esc(what.join(' · ')) + '</small></div>' +
      '<div>' + chip(st[0], st[1]) + '</div>' + gameActions(g, c).replace('ev__acts', 'grow__acts') + '</div>';
  }
  function gamesView() {
    var gs = visibleGames();
    var groups = [
      ['Ждут подтверждения', gs.filter(function (g) { return g.status === 'pending'; }), 1],
      ['Предложено другое время', gs.filter(function (g) { return g.status === 'proposed'; }), 1],
      ['Отметьте, как прошли', gs.filter(function (g) { return g.status === 'confirmed' && g.at < NOW; }), 1],
      ['Подтверждены', gs.filter(function (g) { return g.status === 'confirmed' && g.at >= NOW; }), 1],
      ['Прошедшие', gs.filter(function (g) { return g.status === 'done' || g.status === 'cancelled' || g.status === 'declined'; }), -1]
    ];
    var html = groups.filter(function (x) { return x[1].length; }).map(function (x) {
      var list = x[1].sort(function (a, b) { return (a.at - b.at) * x[2]; });
      return '<section class="group"><h2>' + x[0] + ' <span class="badge badge--soft">' + list.length + '</span></h2>' + list.map(gameRow).join('') + '</section>';
    }).join('');
    return '<div class="bar"><div class="bar__l"><h1>Игры</h1>' + mgrFilter() + '</div></div>' +
      '<p class="caption">Время показано у клиента, по Москве и у вас (' + esc(tzCity(VTZ)) + ').</p>' + (html || '<p class="empty">Игр пока нет.</p>');
  }

  // ---------- оплаты ----------------------------------------------------------
  function monthIn() {
    var m = new Intl.DateTimeFormat('ru-RU', { timeZone: MSK, month: 'long' }).format(new Date(NOW));
    return m === 'май' ? 'мае' : m.replace(/ь$/, 'е').replace(/т$/, 'те');
  }
  function paysView() {
    var ids = visibleClients().map(function (c) { return c.id; });
    var ps = D.pays.filter(function (p) { return ids.indexOf(p.client) !== -1; }).sort(function (a, b) { return b.date - a.date; });
    var paidM = ps.filter(function (p) { return p.status === 'paid' && thisMonth(paidAt(p)); }).reduce(function (s, p) { return s + p.amount; }, 0);
    var wait = ps.filter(function (p) { return p.status === 'invoice'; }).reduce(function (s, p) { return s + p.amount; }, 0);
    var all = ps.filter(function (p) { return p.status === 'paid'; }).reduce(function (s, p) { return s + p.amount; }, 0);
    var rate = rateOf(me().email);
    var tiles = '<div class="tile"><span>Оплачено в ' + monthIn() + '</span><b>' + rub(paidM) + '</b></div>' +
      '<div class="tile"><span>Ожидается по счетам</span><b>' + rub(wait) + '</b></div>' +
      (isAdmin() ? '<div class="tile"><span>Оплачено за всё время</span><b>' + rub(all) + '</b></div>'
        : '<div class="tile"><span>Ваш процент за месяц' + (rate ? ' (' + Math.round(rate * 100) + '%)' : '') + '</span><b>' + rub(paidM * rate) + '</b></div>');
    var rows = ps.map(function (p) {
      var c = client(p.client), st = pstat(p.status);
      var act = isAdmin() && p.status === 'invoice'
        ? '<button type="button" class="btn btn--ok btn--sm" data-act="paid" data-id="' + esc(p.id) + '">Оплачено</button> <button type="button" class="btn btn--ghost btn--sm" data-act="unpaid" data-id="' + esc(p.id) + '">Не оплачено</button>' : '';
      return '<tr><td class="num">' + esc(dayShort(p.status === 'paid' ? paidAt(p) : p.date, MSK)) + '</td><td><button type="button" class="lnk" data-act="openc" data-id="' + esc(c.id) + '">' + esc(c.name) + '</button>' +
        (isAdmin() ? '<br><span class="mute">' + esc(firstName(c.owner)) + '</span>' : '') + '</td><td>' + esc(p.name) + '</td><td class="r">' + rub(p.amount) + '</td><td>' +
        chip(st[0], st[1]) + (act ? '<div style="margin-top:6px">' + act + '</div>' : '') + '</td></tr>';
    }).join('');
    return '<div class="bar"><div class="bar__l"><h1>Оплаты</h1>' + mgrFilter() + '</div></div>' +
      (isAdmin() ? '' : '<p class="caption">Вы отмечаете выставленный счёт, «оплачено» ставит администратор, когда деньги пришли.</p>') +
      '<div class="tiles">' + tiles + '</div>' +
      (ps.length ? '<div class="tbl-wrap"><table><thead><tr><th>Дата</th><th>Клиент</th><th>Пакет</th><th class="r">Сумма</th><th>Статус</th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '<p class="empty">Оплат пока нет.</p>');
  }

  // ---------- очередь подтверждения (админ) ------------------------------------
  function queueCard(g) {
    var c = client(g.client);
    if (!c) return '';
    var w = when(g.at, g.tz), id = esc(g.id);
    return '<article class="qcard"><div><p style="margin:0 0 6px">' + chip(gameTitle(g), 'var(--info)') + '</p>' +
      '<button type="button" class="lnk" data-act="openc" data-id="' + esc(c.id) + '" style="font-size:16px">' + esc(c.name) + '</button>' +
      '<p class="mute" style="margin:2px 0 0">' + esc([c.region, c.city].filter(Boolean).join(' · ')) + '</p>' +
      '<p style="margin:8px 0 0">' + esc(formatText(g)) + (g.people ? ' · ~' + esc(g.people) + ' участников' : '') + '</p>' +
      (g.note ? '<p class="mute" style="margin:2px 0 0">' + esc(g.note) + '</p>' : '') +
      '<p class="mute" style="margin:6px 0 0">Менеджер: ' + esc(userName(c.owner)) + ' · внесено ' + ago(g.createdAt || NOW) + '</p></div>' +
      '<div class="qcard__time"><b>' + esc(w.local) + '</b><span class="mute">' + esc(w.zone) + '</span>' + (w.extra ? '<br><span>' + esc(w.extra) + '</span>' : '') + '</div>' +
      '<div class="qcard__acts"><button type="button" class="btn btn--ok" data-act="confirm" data-id="' + id + '">Подтвердить</button>' +
      '<button type="button" class="btn btn--line" data-act="propose" data-id="' + id + '">Предложить другое время</button>' +
      '<button type="button" class="btn btn--ghost" data-act="decline" data-id="' + id + '">Отклонить</button></div></article>';
  }
  function queueView() {
    var pend = D.games.filter(function (g) { return g.status === 'pending'; }).sort(function (a, b) { return a.at - b.at; });
    var prop = D.games.filter(function (g) { return g.status === 'proposed'; });
    var idle = D.clients.filter(isIdle);
    return '<div class="bar"><h1>На подтверждение</h1></div>' +
      '<p class="caption">Новые игры от менеджеров. О каждой приходит сообщение в Telegram; менеджер получит письмо с вашим решением.</p>' +
      (pend.length ? pend.map(queueCard).join('') : '<p class="empty">Все игры подтверждены. Новые появятся здесь и в Telegram.</p>') +
      (prop.length ? '<section class="group" style="margin-top:26px"><h2>Ждут ответа менеджера <span class="badge badge--soft">' + prop.length + '</span></h2>' + prop.map(gameRow).join('') + '</section>' : '') +
      (idle.length ? '<section class="group"><h2>Нет движения больше 30 дней <span class="badge badge--soft">' + idle.length + '</span></h2>' + idle.map(function (c) {
        return '<div class="grow"><div class="grow__w"><b>' + esc(c.name) + '</b><small>' + esc(c.region) + ' · ' + esc(userName(c.owner)) + '</small></div>' +
          '<div class="grow__x"><small>' + esc(stageInfo(stageOf(c))[1]) + ' · последнее движение ' + ago(c.last || c.created) + '</small></div><div></div>' +
          '<div class="grow__acts"><button type="button" class="btn btn--line btn--sm" data-act="openc" data-id="' + esc(c.id) + '">Открыть</button><button type="button" class="btn btn--ghost btn--sm" data-act="release" data-id="' + esc(c.id) + '">Снять закрепление</button></div></div>';
      }).join('') + '</section>' : '');
  }

  // ---------- команда (админ) -------------------------------------------------
  function teamView() {
    var rows = D.users.map(function (u) {
      var n = D.clients.filter(function (c) { return c.owner === u.email; }).length;
      var toggle = u.email === me().email ? '<span class="mute">это вы</span>'
        : '<button type="button" class="btn btn--' + (u.active ? 'ghost' : 'line') + ' btn--sm" data-act="toggleUser" data-email="' + esc(u.email) + '">' + (u.active ? 'Отключить' : 'Включить') + '</button>';
      return '<tr><td><b>' + esc(u.name || '—') + '</b>' + (u.role === 'manager' && u.plan ? '<br><span class="mute">' + esc(u.plan) + '</span>' : '') + '</td><td>' + esc(u.email) + '</td><td>' + esc(ROLE[u.role] || u.role) + '</td>' +
        '<td class="r">' + n + '</td><td>' + (u.active ? chip('есть доступ', 'var(--ok)') : chip('отключён', 'var(--mute)')) + '</td><td>' + toggle + '</td></tr>';
    }).join('');
    var plans = PLANS.map(function (p) { return '<option value="' + p.rate + '">' + esc(p.label) + '</option>'; }).join('');
    return '<div class="bar"><h1>Команда</h1></div>' +
      '<p class="caption">Войти в CRM могут только почты из этого списка: на почту приходит код, вход держится 30 дней. Отключённый сотрудник сразу теряет доступ, его клиенты остаются в CRM. Тот же список — на листе «CRM — команда» в таблице.</p>' +
      '<div class="tbl-wrap"><table><thead><tr><th>Сотрудник</th><th>Почта</th><th>Роль</th><th class="r">Клиентов</th><th>Доступ</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<form data-form="user" class="card" style="margin-top:18px" novalidate><h2 style="font-family:var(--disp);font-size:17px;margin:0 0 10px">Добавить сотрудника</h2>' +
      '<div class="grid2"><div class="f"><label class="req" for="uName">Имя и фамилия</label><input id="uName" name="uname" autocomplete="off"></div>' +
      '<div class="f"><label class="req" for="uEmail">Почта</label><input id="uEmail" name="email" type="email" autocomplete="off"></div>' +
      '<div class="f"><label for="uRole">Роль</label><select id="uRole" name="role"><option value="manager">Менеджер — видит только своих клиентов</option><option value="admin">Админ — видит всё</option></select></div>' +
      '<div class="f"><label for="uPlan">Условия менеджера</label><select id="uPlan" name="plan">' + plans + '</select></div></div>' +
      '<p class="err" role="alert"></p><div class="acts" style="justify-content:flex-end;margin-top:0"><button class="btn">Добавить</button></div></form>';
  }

  // ---------- отчёт -----------------------------------------------------------
  function reportView() {
    return '<div class="bar"><h1>Отчёт в Telegram</h1><button type="button" class="btn btn--line" data-act="sendReport">Отправить отчёт сейчас</button></div>' +
      '<p class="caption">Каждый день около 9:00 по Москве отчёт приходит в группу, куда падают заявки с сайта. О каждой новой игре сообщение приходит сразу. Ниже — отчёт по сегодняшним данным.</p>' +
      '<div class="tgwrap"><span class="tghead">Ежедневный отчёт</span><div class="tg">' + (D.report || 'Отчёт появится, когда в CRM будут данные.') + '</div></div>';
  }

  // ---------- вход и ошибки ---------------------------------------------------
  function loginView() {
    var L = S.login;
    var body = L.step === 'email'
      ? '<form data-form="loginEmail" class="stack" novalidate><div class="f"><label for="lEmail">Рабочая почта</label><input id="lEmail" name="email" type="email" autocomplete="email" value="' + esc(L.email) + '" placeholder="name@example.com"></div>' +
        '<p class="err" role="alert">' + esc(L.err) + '</p><button class="btn">Получить код</button></form>'
      : '<form data-form="loginCode" class="stack" novalidate><p style="margin:0">Код отправлен на <b>' + esc(L.email) + '</b>. Он действует 10 минут. Письмо может попасть в «Спам».</p>' +
        '<div class="f"><label for="lCode">Код из письма</label><input id="lCode" name="code" class="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="••••••"></div>' +
        '<p class="err" role="alert">' + esc(L.err) + '</p><button class="btn">Войти</button>' +
        '<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><button type="button" class="btn btn--ghost btn--sm" data-act="resend">Отправить код ещё раз</button><button type="button" class="btn btn--ghost btn--sm" data-act="otherEmail">Другая почта</button></div></form>';
    return '<div class="wrap login"><div class="login__card"><a class="logo" href="/" style="color:inherit;text-decoration:none">Бизнес <em>Квест</em><small>CRM</small></a>' +
      '<h1>Вход для команды</h1><p class="mute" style="margin:0">Пароль не нужен: пришлём одноразовый код на почту. Вход сохранится на этом устройстве на 30 дней.</p>' + body + '</div></div>';
  }
  function fatalView() {
    return '<div class="wrap login"><div class="login__card"><span class="logo">Бизнес <em>Квест</em><small>CRM</small></span>' +
      '<div class="alert" style="margin:0"><b>CRM сейчас не открывается</b>' + esc(S.fatal) + '</div>' +
      '<div class="acts" style="margin:0"><button type="button" class="btn" data-act="retry">Попробовать ещё раз</button><button type="button" class="btn btn--ghost" data-act="logout">Выйти</button></div></div></div>';
  }

  // ---------- окна ------------------------------------------------------------
  function tzOptions(sel, ms) {
    var t = ms || NOW;
    var has = TZ_RU.concat(TZ_WORLD).some(function (x) { return x[0] === sel; });
    var o = function (x) { return '<option value="' + x[0] + '"' + (x[0] === sel ? ' selected' : '') + '>' + esc(x[1]) + ' — ' + (isRuTz(x[0]) ? mskLabel(x[0], t) : utcLabel(x[0], t) + ', ' + mskLabel(x[0], t)) + '</option>'; };
    return (has || !validTz(sel) ? '' : o([sel, tzCity(sel)])) + '<optgroup label="Россия">' + TZ_RU.map(o).join('') + '</optgroup><optgroup label="Другие страны">' + TZ_WORLD.map(o).join('') + '</optgroup>';
  }
  function regionOptions(sel) {
    var list = REGIONS.map(function (r) { return '<option value="' + esc(r[0]) + '" data-g="' + r[1] + '"' + (r[0] === sel ? ' selected' : '') + '>' + esc(r[0]) + '</option>'; }).join('');
    return '<option value="">Выберите регион</option>' + list + '<option value="' + ABROAD + '"' + (sel === ABROAD ? ' selected' : '') + '>' + ABROAD + '</option>';
  }
  function gameFields(d) {
    var types = Object.keys(GAME).map(function (k) { return '<option value="' + k + '"' + (d.type === k ? ' selected' : '') + '>' + GAME[k].name + (k === 'demo' ? ' — 60 минут онлайн, бесплатно' : '') + '</option>'; }).join('');
    var inPerson = CFG.inPerson ? '+' + rub(CFG.inPerson).replace(/\s/g, ' ') + ' и дорога' : 'оплачивается отдельно';
    return '<div class="grid2"><div class="f span2"><label for="gType">Какая игра</label><select id="gType" name="type"' + (d.lockType ? ' disabled' : '') + '>' + types + '</select></div>' +
      '<div class="f"><label class="req" for="gDate">Дата</label><input id="gDate" name="date" type="date" value="' + esc(d.date || '') + '" min="' + ymd(NOW, MSK) + '"></div>' +
      '<div class="f"><label class="req" for="gTime">Время у клиента</label><input id="gTime" name="time" type="time" step="900" value="' + esc(d.time || '19:00') + '"></div>' +
      '<div class="f span2"><label for="gTz">Часовой пояс клиента</label><select id="gTz" name="tz"' + (d.tzTouched ? ' data-touched="1"' : '') + '>' + tzOptions(d.tz || MSK) + '</select></div></div>' +
      '<div class="f" style="margin-top:12px"><span class="flabel">Формат</span><div class="radios radios--2">' +
      '<label class="radio"><input type="radio" name="format" value="online"' + (d.format !== 'offline' ? ' checked' : '') + '><span><b>Онлайн</b><small>Участники в зале клиента, ведущий по видеосвязи на большом экране</small></span></label>' +
      '<label class="radio"><input type="radio" name="format" value="offline"' + (d.format === 'offline' ? ' checked' : '') + '><span><b>Офлайн</b><small>Ведущий приезжает на место: ' + esc(inPerson) + '</small></span></label></div>' +
      '<p class="note" id="demoNote" style="margin:4px 0 0">Демо-игра всегда онлайн и длится 60 минут.</p></div>' +
      '<div class="f" id="addrRow" style="margin-top:10px"><label class="req" for="gAddr">Адрес проведения</label><input id="gAddr" name="address" value="' + esc(d.address || '') + '" placeholder="Город, улица, дом, зал"></div>' +
      '<div class="grid2" style="margin-top:10px"><div class="f"><label for="gPeople">Участников, примерно</label><input id="gPeople" name="people" type="number" min="1" max="500" inputmode="numeric" value="' + esc(d.people || '') + '"></div>' +
      '<div class="f"><label for="gNote">Комментарий для ведущего</label><input id="gNote" name="note" maxlength="300" value="' + esc(d.note || '') + '"></div></div>' +
      '<div class="preview" id="whenPreview" aria-live="polite"></div>';
  }
  function syncGame(form) {
    var typeEl = form.elements.namedItem('type');
    var isDemo = !!typeEl && typeEl.value === 'demo';
    var off = form.querySelector('input[name="format"][value="offline"]');
    if (off) {
      off.disabled = isDemo;
      off.closest('.radio').setAttribute('aria-disabled', isDemo ? 'true' : 'false');
      if (isDemo) form.querySelector('input[name="format"][value="online"]').checked = true;
    }
    var dn = form.querySelector('#demoNote'); if (dn) dn.hidden = !isDemo;
    var fmt = form.querySelector('input[name="format"]:checked');
    var ar = form.querySelector('#addrRow'); if (ar) ar.hidden = !fmt || fmt.value !== 'offline';
    var pv = form.querySelector('#whenPreview');
    if (!pv) return;
    var date = val(form, 'date'), time = val(form, 'time'), tz = val(form, 'tz');
    if (!date || !time || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{1,2}:\d{2}/.test(time)) { pv.innerHTML = '<span class="mute">Выберите дату и время — здесь будет видно, сколько это по Москве и у вас.</span>'; return; }
    var ms = toUtc(date, time, tz), w = when(ms, tz);
    pv.innerHTML = '<b>' + esc(w.local) + '</b> · ' + esc(w.zone) + (w.extra ? '<br>' + esc(w.extra) : '') +
      (ms < Date.now() ? '<br><span style="color:var(--bad);font-weight:700">Это время уже прошло.</span>' : '');
  }
  function companyFields(c) {
    c = c || { lpr: {} };
    var L = c.lpr || {};
    return '<fieldset><legend>Компания</legend><div class="grid2">' +
      '<div class="f span2"><label class="req" for="cName">Название</label><input id="cName" name="cname" autocomplete="off" maxlength="160" value="' + esc(c.name) + '" placeholder="ООО «…» или название сообщества"></div>' +
      '<div class="f"><label class="req" for="cRegion">Регион</label><select id="cRegion" name="region">' + regionOptions(c.region) + '</select></div>' +
      '<div class="f"><label for="cCity">Город</label><input id="cCity" name="city" maxlength="80" value="' + esc(c.city) + '"></div>' +
      '<div class="f"><label for="cInn">ИНН</label><input id="cInn" name="inn" inputmode="numeric" maxlength="12" value="' + esc(c.inn) + '"></div>' +
      '<div class="f"><label for="cSite">Сайт</label><input id="cSite" name="site" inputmode="url" maxlength="120" value="' + esc(c.site) + '"></div></div>' +
      '<div id="dupWarn" class="warnbox" hidden></div></fieldset>' +
      '<fieldset><legend>Лицо, принимающее решение</legend><div class="grid2">' +
      '<div class="f"><label class="req" for="pName">ФИО</label><input id="pName" name="pname" autocomplete="off" maxlength="100" value="' + esc(L.name) + '"></div>' +
      '<div class="f"><label for="pTitle">Должность</label><input id="pTitle" name="ptitle" maxlength="100" value="' + esc(L.title) + '"></div>' +
      '<div class="f"><label class="req" for="pPhone">Телефон</label><input id="pPhone" name="phone" type="tel" inputmode="tel" maxlength="40" value="' + esc(L.phone) + '" placeholder="+7 900 000-00-00"></div>' +
      '<div class="f"><label for="pEmail">Почта</label><input id="pEmail" name="pemail" type="email" maxlength="120" value="' + esc(L.email) + '"></div>' +
      '<div class="f span2"><label for="pTg">Telegram</label><input id="pTg" name="tg" maxlength="60" value="' + esc(L.tg) + '" placeholder="@username"></div></div></fieldset>';
  }
  function clientTz(c) {
    var g = gamesOf(c.id).slice(-1)[0];
    if (g && validTz(g.tz)) return g.tz;
    var r = REGIONS.filter(function (x) { return x[0] === c.region; })[0];
    return r ? GROUP_TZ[r[1]] : MSK;
  }
  function nextType(c) { return { demo: 'demo', demo_done: 'pilot', pilot: 'single', single: 'annual', annual: 'annual', lost: 'demo' }[stageOf(c)]; }
  function actsHtml(submit) { return '<p class="err" role="alert"></p><div class="acts"><button type="button" class="btn btn--line" data-act="close">Отмена</button><button class="btn">' + submit + '</button></div>'; }
  function modalView() {
    var m = S.modal, inner = '';
    if (m.kind === 'client') {
      inner = '<form data-form="client" novalidate><h2 id="mTitle">Новый клиент</h2>' +
        '<p class="lead">Вносите только тех, с кем уже договорились об игре: без даты первой игры карточку не сохранить.</p>' +
        companyFields() + '<fieldset><legend>Первая игра</legend>' + gameFields({ type: 'demo', date: ymd(NOW + 3 * DAY, MSK) }) + '</fieldset>' +
        actsHtml('Сохранить и отправить на подтверждение') + '</form>';
    }
    if (m.kind === 'edit') {
      inner = '<form data-form="edit" novalidate><h2 id="mTitle">Компания и контакты</h2><p class="lead">Изменения сразу сохранятся в таблице.</p>' +
        companyFields(client(m.cid)) + actsHtml('Сохранить') + '</form>';
    }
    if (m.kind === 'game') {
      var c = client(m.cid), g = m.gid ? game(m.gid) : null;
      var d = g ? { type: g.type, lockType: true, date: ymd(g.at, g.tz), time: hm(g.at, g.tz), tz: g.tz, tzTouched: true, format: g.format, address: g.address, people: g.people, note: g.note }
        : { type: nextType(c), date: ymd(NOW + 3 * DAY, MSK), tz: clientTz(c), tzTouched: true, format: 'online' };
      inner = '<form data-form="game" novalidate><h2 id="mTitle">' + (g ? 'Другое время' : 'Назначить игру') + '</h2><p class="lead">' + esc(c.name) + '. Игра уйдёт на подтверждение, вам придёт письмо с решением.</p>' +
        gameFields(d) + actsHtml('Отправить на подтверждение') + '</form>';
    }
    if (m.kind === 'propose') {
      var pg = game(m.gid);
      inner = '<form data-form="propose" novalidate><h2 id="mTitle">Предложить другое время</h2><p class="lead">' + esc(gameTitle(pg)) + ' · ' + esc(client(pg.client).name) + '. Менеджер получит письмо и согласует новое время с клиентом.</p>' +
        '<div class="grid2"><div class="f"><label class="req" for="gDate">Дата</label><input id="gDate" name="date" type="date" value="' + ymd(pg.at, pg.tz) + '"></div>' +
        '<div class="f"><label class="req" for="gTime">Время у клиента</label><input id="gTime" name="time" type="time" step="900" value="' + hm(pg.at, pg.tz) + '"></div>' +
        '<div class="f span2"><label for="gTz">Часовой пояс клиента</label><select id="gTz" name="tz">' + tzOptions(pg.tz) + '</select></div>' +
        '<div class="f span2"><label for="aNote">Комментарий менеджеру</label><input id="aNote" name="anote" maxlength="300" placeholder="Например: в 17:00 ведущий занят"></div></div>' +
        '<div class="preview" id="whenPreview" aria-live="polite"></div>' + actsHtml('Отправить менеджеру') + '</form>';
    }
    if (m.kind === 'decline') {
      var dg = game(m.gid);
      inner = '<form data-form="decline" novalidate><h2 id="mTitle">Отклонить игру</h2><p class="lead">' + esc(gameTitle(dg)) + ' · ' + esc(client(dg.client).name) + '</p>' +
        '<div class="f"><label class="req" for="dReason">Причина для менеджера</label><textarea id="dReason" name="reason" rows="3" maxlength="300"></textarea></div>' +
        actsHtml('Отклонить и написать менеджеру') + '</form>';
    }
    if (m.kind === 'done') {
      var og = game(m.gid);
      inner = '<form data-form="done" novalidate><h2 id="mTitle">Как прошла игра?</h2><p class="lead">' + esc(gameTitle(og)) + ' · ' + esc(client(og.client).name) + '</p>' +
        '<div class="radios radios--2"><label class="radio"><input type="radio" name="res" value="done" checked><span><b>Прошла</b><small>Укажите, сколько было участников</small></span></label>' +
        '<label class="radio"><input type="radio" name="res" value="cancelled"><span><b>Не состоялась</b><small>Клиент отменил или не собрал зал</small></span></label></div>' +
        '<div class="f" style="margin-top:10px"><label for="dPeople">Участников</label><input id="dPeople" name="participants" type="number" min="0" max="500" inputmode="numeric" value="' + esc(og.people || '') + '"></div>' +
        '<div class="f" style="margin-top:10px"><label for="dNote">Комментарий</label><input id="dNote" name="dnote" maxlength="300"></div>' + actsHtml('Сохранить') + '</form>';
    }
    if (m.kind === 'pay') {
      var pc = client(m.cid);
      var def = { demo_done: 'pilot', pilot: 'single', single: 'annual', annual: 'extra' }[stageOf(pc)] || 'pilot';
      var opts = PRICES.map(function (p) { return '<option value="' + p.id + '"' + (p.id === def ? ' selected' : '') + '>' + esc(p.name) + (p.amount ? ' — ' + rub(p.amount) : '') + '</option>'; }).join('');
      inner = '<form data-form="pay" novalidate><h2 id="mTitle">Добавить оплату</h2><p class="lead">' + esc(pc.name) + '</p>' +
        '<div class="grid2"><div class="f span2"><label for="yPkg">Что оплачивают</label><select id="yPkg" name="pkg">' + opts + '</select></div>' +
        '<div class="f"><label class="req" for="yAmount">Сумма, ₽</label><input id="yAmount" name="amount" inputmode="numeric" maxlength="12"></div>' +
        '<div class="f" id="yStageRow"><label for="yStage">Это оплата за</label><select id="yStage" name="pstage"><option value="pilot">Пробную игру</option><option value="single">Разовую игру</option><option value="annual">Годовой контракт</option><option value="">Другое</option></select></div>' +
        '<div class="f"><label for="yDate">Дата счёта</label><input id="yDate" name="date" type="date" value="' + ymd(NOW, MSK) + '"></div>' +
        (isAdmin() ? '<div class="f"><label for="yStatus">Статус</label><select id="yStatus" name="status"><option value="invoice">Счёт выставлен</option><option value="paid">Оплачено</option><option value="unpaid">Не оплачено</option></select></div>' : '') +
        '<div class="f span2"><label for="yNote">Комментарий</label><input id="yNote" name="pnote" maxlength="200" placeholder="Номер счёта, условия договора"></div></div>' +
        (isAdmin() ? '' : '<p class="preview" id="yRate" data-rate="' + rateOf(pc.owner) + '"></p><p class="note">Оплату подтверждает администратор, когда деньги придут на счёт.</p>') +
        actsHtml(isAdmin() ? 'Сохранить' : 'Добавить счёт') + '</form>';
    }
    if (m.kind === 'lose') {
      var lc = client(m.cid);
      inner = '<form data-form="lose" novalidate><h2 id="mTitle">Отказ или пауза</h2><p class="lead">' + esc(lc.name) + '. Клиент останется в CRM, его можно вернуть в работу.</p>' +
        '<div class="radios">' + LOST_REASONS.map(function (r, i) { return '<label class="radio"><input type="radio" name="lreason" value="' + esc(r) + '"' + (i === 0 ? ' checked' : '') + '><span><b>' + esc(r) + '</b></span></label>'; }).join('') + '</div>' +
        '<div class="f" style="margin-top:10px"><label for="lNote">Комментарий</label><input id="lNote" name="lnote" maxlength="300" placeholder="Например: вернуться в феврале"></div>' + actsHtml('Сохранить') + '</form>';
    }
    if (m.kind === 'sent') {
      inner = '<h2 id="mTitle">' + esc(m.title) + '</h2><p class="lead">' + esc(m.lead) + '</p>' +
        (m.tg ? '<div class="tgwrap"><span class="tghead">Сообщение в Telegram</span><div class="tg">' + m.tg + '</div></div>' : '') +
        '<div class="acts"><button type="button" class="btn" data-act="close">Понятно</button></div>';
    }
    if (m.kind === 'mail') {
      var mail = m.mail || {};
      inner = '<h2 id="mTitle">' + esc(m.title) + '</h2>' +
        (mail.to ? '<p class="lead">' + (m.sent === false ? 'Письмо не ушло: ' + esc(m.mailError || 'ошибка почты') + '. Сообщите менеджеру сами.' : 'Менеджер получил письмо:') + '</p>' +
          '<div class="mail"><div class="mail__h"><span>Кому: <b>' + esc(mail.to) + '</b></span><span>Тема: <b>' + esc(mail.subject) + '</b></span></div><div class="mail__b">' + esc(mail.body) + '</div></div>' : '') +
        '<div class="acts"><button type="button" class="btn" data-act="close">Готово</button></div>';
    }
    return '<div class="scrim" data-act="scrim"><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="mTitle">' + inner + '</div></div>';
  }
  function syncPay(form) {
    var pkg = PRICES.filter(function (p) { return p.id === val(form, 'pkg'); })[0] || PRICES[0];
    var amount = form.elements.namedItem('amount');
    var custom = pkg.amount == null;
    if (!custom) amount.value = pkg.amount; else if (form.dataset.lastPkg && form.dataset.lastPkg !== pkg.id) amount.value = '';
    amount.readOnly = !custom;
    form.dataset.lastPkg = pkg.id;
    form.querySelector('#yStageRow').hidden = !custom;
    var r = form.querySelector('#yRate');
    if (r) {
      var rate = +r.dataset.rate, n = +String(amount.value).replace(/\D/g, '');
      r.textContent = !rate ? 'Процент для вас не указан — спросите администратора.' : n ? 'Ваш процент после оплаты: ' + Math.round(rate * 100) + '% = ' + rub(n * rate) : 'Укажите сумму — здесь будет ваш процент.';
    }
  }

  // ---------- отрисовка -------------------------------------------------------
  function render(keepFocus) {
    NOW = Date.now();
    if (S.view === 'boot') app.innerHTML = '<p class="boot">Загружаем CRM…</p>';
    else if (S.view === 'login') app.innerHTML = loginView();
    else if (S.view === 'fatal') app.innerHTML = fatalView();
    else app.innerHTML = shell();
    modalRoot.innerHTML = S.modal && S.view === 'app' ? modalView() : '';
    if (S.modal && S.view === 'app') {
      var f = modalRoot.querySelector('form');
      if (f) { syncGame(f); if (f.dataset.form === 'pay') syncPay(f); }
      var first = modalRoot.querySelector('input:not([type=radio]):not([disabled]), select, textarea, .btn');
      if (first && !keepFocus) first.focus();
    } else if (S.view === 'login' && !keepFocus) {
      var li = app.querySelector('#lEmail, #lCode'); if (li) li.focus();
    }
  }
  function open(kind, extra) { S.modal = Object.assign({ kind: kind }, extra || {}); render(); }
  function close() { S.modal = null; render(true); }
  function openClient(id) {
    S.tab = 'clients'; S.sel = id; S.stage = 'all';
    var c = client(id); if (c && isAdmin() && S.mgr !== 'all' && c.owner !== S.mgr) S.mgr = 'all';
    render(); window.scrollTo(0, 0);
  }
  function initialTab() { return isAdmin() ? 'queue' : 'clients'; }
  function enterApp() { S.view = 'app'; S.tab = initialTab(); S.sel = null; S.stage = 'all'; S.mgr = 'all'; S.modal = null; render(); }
  function logout() {
    store(TOKEN_KEY, null);
    D = { me: null, users: [], clients: [], games: [], pays: [], report: '' };
    S.view = 'login'; S.modal = null; S.login = { step: 'email', email: stored(EMAIL_KEY), err: '' };
    render();
  }
  function sentModal(res, title) {
    return { kind: 'sent', title: title, tg: res.tg || '',
      lead: res.tgSent === false ? 'Сообщение в Telegram не ушло — напишите администратору сами. Игра сохранена.' : 'Администратору ушло сообщение. Когда он ответит, вам придёт письмо.' };
  }
  function mailModal(res, title) { return { kind: 'mail', title: title, mail: res.mail, sent: res.mailSent, mailError: res.mailError }; }

  // ---------- действия --------------------------------------------------------
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-act]');
    if (!t) return;
    var a = t.dataset.act, id = t.dataset.id;
    if (a === 'scrim') { if (e.target === t && !S.busy) close(); return; }
    switch (a) {
      case 'logout': logout(); break;
      case 'retry': S.view = 'boot'; render(); boot(); break;
      case 'tab': S.tab = t.dataset.tab; S.sel = null; render(); break;
      case 'stage': S.stage = t.dataset.s; S.sel = null; render(); break;
      case 'open': S.sel = id; render(); if (!window.matchMedia('(min-width: 900px)').matches) window.scrollTo(0, 0); break;
      case 'openc': S.modal = null; openClient(id); break;
      case 'back': S.sel = null; render(); break;
      case 'close': if (!S.busy) close(); break;
      case 'newClient': open('client'); break;
      case 'edit': open('edit', { cid: id }); break;
      case 'newGame': open('game', { cid: id }); break;
      case 'repropose': open('game', { cid: game(id).client, gid: id }); break;
      case 'newPay': open('pay', { cid: id }); break;
      case 'lose': open('lose', { cid: id }); break;
      case 'propose': open('propose', { gid: id }); break;
      case 'decline': open('decline', { gid: id }); break;
      case 'done': open('done', { gid: id }); break;
      case 'unlose': run('client.unlose', { id: id }, function () { render(); toast('Клиент снова в работе'); }); break;
      case 'confirm': run('game.confirm', { id: id }, function (res) { S.modal = mailModal(res, 'Время подтверждено'); render(); }); break;
      case 'accept': run('game.accept', { id: id }, function () { render(); toast('Время согласовано с клиентом — игра подтверждена'); }); break;
      case 'paid': run('pay.status', { id: id, status: 'paid' }, function () { render(); toast('Оплата отмечена'); }); break;
      case 'unpaid': run('pay.status', { id: id, status: 'unpaid' }, function () { render(); toast('Отмечено: не оплачено'); }); break;
      case 'release': run('client.assign', { id: id, owner: '' }, function () { render(); toast('Закрепление снято — клиента можно отдать другому менеджеру'); }); break;
      case 'toggleUser': run('team.toggle', { email: t.dataset.email }, function () { render(); toast('Доступ изменён'); }); break;
      case 'sendReport': run('report.send', {}, function () { render(); toast('Отчёт отправлен в группу'); }); break;
      case 'copy': {
        var text = t.dataset.text;
        try { navigator.clipboard.writeText(text).then(function () { toast('Скопировано: ' + text); }, function () { toast(text); }); } catch (err) { toast(text); }
        break;
      }
      case 'resend':
        run('auth.request', { email: S.login.email }, function () { S.login.err = ''; render(true); toast('Новый код отправлен на ' + S.login.email); });
        break;
      case 'otherEmail': S.login = { step: 'email', email: S.login.email, err: '' }; render(); break;
    }
  });
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.dataset.change === 'mgr') { S.mgr = t.value; S.sel = null; render(); return; }
    if (t.dataset.change === 'assign') {
      run('client.assign', { id: t.dataset.id, owner: t.value }, function () { render(); toast(t.value ? 'Клиент закреплён за ' + userName(t.value) : 'Закрепление снято'); });
      return;
    }
    var form = t.closest('form');
    if (!form) return;
    if (t.name === 'tz') t.dataset.touched = '1';
    if (t.name === 'region') {
      var tz = form.elements.namedItem('tz');
      var opt = t.options[t.selectedIndex];
      if (tz && !tz.dataset.touched && opt && opt.dataset.g) tz.value = GROUP_TZ[opt.dataset.g];
    }
    if (form.dataset.form === 'pay') syncPay(form);
    syncGame(form);
  });
  document.addEventListener('input', function (e) {
    var form = e.target.closest('form');
    if (!form) return;
    if ((form.dataset.form === 'client' || form.dataset.form === 'edit') && (e.target.name === 'cname' || e.target.name === 'inn')) dupCheck(form);
    if (form.dataset.form === 'pay' && e.target.name === 'amount') syncPay(form);
    if (e.target.name === 'date' || e.target.name === 'time') syncGame(form);
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && S.modal && !S.busy) close(); });

  function normName(s) {
    return String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[«»"'„“”()]/g, ' ')
      .replace(/(^|\s)(ооо|ип|ао|пао|зао|нко|ано)(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim();
  }
  // Проверка по своим клиентам. Чужих менеджер не видит — их проверяет сервер при сохранении.
  function dupCheck(form) {
    var box = form.querySelector('#dupWarn');
    var self = S.modal && S.modal.cid;
    var n = normName(val(form, 'cname')), inn = val(form, 'inn');
    var hit = D.clients.filter(function (c) {
      if (c.id === self) return false;
      var cn = normName(c.name);
      if (inn && c.inn && inn === c.inn) return true;
      return n.length >= 4 && cn && (cn === n || (n.length >= 6 && (cn.indexOf(n) !== -1 || n.indexOf(cn) !== -1)));
    })[0];
    if (!hit) { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = !hit.owner ? esc(hit.name) + ' уже есть в CRM без менеджера.'
      : hit.owner === me().email ? esc(hit.name) + ' уже есть среди ваших клиентов. <button type="button" class="btn btn--ghost btn--sm" data-act="openc" data-id="' + esc(hit.id) + '">Открыть карточку</button>'
        : esc(hit.name) + ' уже в работе у менеджера ' + esc(userName(hit.owner)) + '.';
  }
  function readGame(form) {
    var date = val(form, 'date'), time = val(form, 'time'), tz = val(form, 'tz');
    var fmt = form.querySelector('input[name="format"]:checked');
    var ok = /^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d{1,2}:\d{2}/.test(time);
    return { type: val(form, 'type'), at: ok ? toUtc(date, time, tz) : 0, tz: tz,
      format: fmt ? fmt.value : 'online', address: val(form, 'address'), people: val(form, 'people'), note: val(form, 'note') };
  }
  function gameError(g) {
    if (!g.at) return 'Укажите дату и время игры.';
    if (g.at < Date.now()) return 'Это время уже прошло — выберите будущее.';
    if (g.type !== 'demo' && g.format === 'offline' && !g.address) return 'Для офлайн-игры укажите адрес.';
    return '';
  }
  function readCompany(form) {
    return { name: val(form, 'cname'), region: val(form, 'region'), city: val(form, 'city'), inn: val(form, 'inn'), site: val(form, 'site'),
      lpr: { name: val(form, 'pname'), title: val(form, 'ptitle'), phone: val(form, 'phone'), email: val(form, 'pemail'), tg: val(form, 'tg') } };
  }
  function companyError(c) {
    if (!c.name) return 'Укажите название компании.';
    if (!c.region) return 'Выберите регион.';
    if (c.inn && !/^\d{10}(\d{2})?$/.test(c.inn)) return 'ИНН — 10 или 12 цифр.';
    if (!c.lpr.name) return 'Укажите, кто принимает решение.';
    if (c.lpr.phone.replace(/\D/g, '').length < 10) return 'Проверьте телефон ЛПР.';
    if (c.lpr.email && !validEmail(c.lpr.email)) return 'Проверьте почту ЛПР.';
    return '';
  }

  document.addEventListener('submit', function (e) {
    var form = e.target, kind = form.dataset.form;
    if (!kind) return;
    e.preventDefault();
    if (S.busy) return;
    fail(form, '');

    if (kind === 'loginEmail') {
      var em = val(form, 'email').toLowerCase();
      if (!validEmail(em)) return fail(form, 'Проверьте адрес почты.');
      store(EMAIL_KEY, em);
      return submitForm(form, 'auth.request', { email: em }, function () { S.login = { step: 'code', email: em, err: '' }; render(); });
    }
    if (kind === 'loginCode') {
      var code = val(form, 'code').replace(/\D/g, '');
      if (code.length !== 6) return fail(form, 'Введите 6 цифр из письма.');
      return submitForm(form, 'auth.verify', { email: S.login.email, code: code }, function (res) {
        store(TOKEN_KEY, res.token);
        enterApp();
        toast('Вы вошли как ' + (me().name || me().email));
      });
    }
    if (kind === 'client') {
      var c = readCompany(form), err = companyError(c);
      if (err) return fail(form, err);
      var g = readGame(form), gerr = gameError(g);
      if (gerr) return fail(form, gerr);
      return submitForm(form, 'client.create', { client: c, game: g }, function (res) {
        S.sel = res.id || null; S.tab = 'clients'; S.stage = 'all';
        S.modal = sentModal(res, 'Клиент внесён, игра ушла на подтверждение');
        render();
      });
    }
    if (kind === 'edit') {
      var ec = readCompany(form), eerr = companyError(ec);
      if (eerr) return fail(form, eerr);
      return submitForm(form, 'client.update', { id: S.modal.cid, client: ec }, function () { close(); toast('Сохранено'); });
    }
    if (kind === 'game') {
      var gm = readGame(form), er = gameError(gm);
      if (er) return fail(form, er);
      if (S.modal.gid) {
        return submitForm(form, 'game.reschedule', { id: S.modal.gid, game: gm }, function (res) { S.modal = sentModal(res, 'Новое время отправлено на подтверждение'); render(); });
      }
      return submitForm(form, 'game.create', { client: S.modal.cid, game: gm }, function (res) { S.modal = sentModal(res, 'Игра отправлена на подтверждение'); render(); });
    }
    if (kind === 'propose') {
      var date = val(form, 'date'), time = val(form, 'time'), tz = val(form, 'tz');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{1,2}:\d{2}/.test(time)) return fail(form, 'Укажите дату и время.');
      var ms = toUtc(date, time, tz);
      if (ms < Date.now()) return fail(form, 'Это время уже прошло.');
      return submitForm(form, 'game.propose', { id: S.modal.gid, at: ms, tz: tz, note: val(form, 'anote') }, function (res) { S.modal = mailModal(res, 'Новое время отправлено менеджеру'); render(); });
    }
    if (kind === 'decline') {
      var reason = val(form, 'reason');
      if (!reason) return fail(form, 'Напишите причину — менеджер увидит её в письме.');
      return submitForm(form, 'game.decline', { id: S.modal.gid, reason: reason }, function (res) { S.modal = mailModal(res, 'Игра отклонена'); render(); });
    }
    if (kind === 'done') {
      var res = form.querySelector('input[name="res"]:checked').value;
      return submitForm(form, 'game.result', { id: S.modal.gid, result: res, participants: val(form, 'participants'), note: val(form, 'dnote') }, function () {
        close(); toast(res === 'done' ? 'Игра отмечена как проведённая' : 'Отмечено: игра не состоялась');
      });
    }
    if (kind === 'pay') {
      var pkg = PRICES.filter(function (x) { return x.id === val(form, 'pkg'); })[0];
      var amount = +val(form, 'amount').replace(/\D/g, '');
      if (!amount) return fail(form, 'Укажите сумму.');
      var custom = pkg.amount == null;
      return submitForm(form, 'pay.create', {
        client: S.modal.cid, name: custom ? 'Нестандартный договор' : pkg.name, amount: amount,
        stage: custom ? val(form, 'pstage') : (pkg.stage || ''), status: isAdmin() ? val(form, 'status') : 'invoice',
        date: /^\d{4}-\d{2}-\d{2}$/.test(val(form, 'date')) ? toUtc(val(form, 'date'), '12:00', MSK) : Date.now(), note: val(form, 'pnote')
      }, function () { close(); toast(isAdmin() ? 'Оплата добавлена' : 'Счёт добавлен — оплату подтвердит администратор'); });
    }
    if (kind === 'lose') {
      return submitForm(form, 'client.lose', { id: S.modal.cid, reason: form.querySelector('input[name="lreason"]:checked').value, note: val(form, 'lnote') }, function () {
        close(); toast('Клиент перенесён в «Отказ / пауза»');
      });
    }
    if (kind === 'user') {
      var un = val(form, 'uname'), ue = val(form, 'email').toLowerCase();
      if (!un) return fail(form, 'Укажите имя.');
      if (!validEmail(ue)) return fail(form, 'Проверьте адрес почты.');
      return submitForm(form, 'team.add', { name: un, email: ue, role: val(form, 'role'), rate: +val(form, 'plan') }, function () {
        render(); toast('Сотрудник добавлен — он может войти по коду на почту');
      });
    }
  });

  // ---------- запуск и обновление -----------------------------------------------
  function boot() {
    if (!CFG.endpoint) { S.view = 'fatal'; S.fatal = 'Не задан адрес скрипта: src/_data/site.json → formEndpoint.'; render(); return; }
    if (!stored(TOKEN_KEY)) { S.view = 'login'; S.login = { step: 'email', email: stored(EMAIL_KEY), err: '' }; render(); return; }
    api('load').then(function () { enterApp(); }, function (err) {
      if (err.code === 'auth') return handleError(err);
      S.view = 'fatal'; S.fatal = err.message; render();
    });
  }
  // Пока вкладка открыта, данные тихо обновляются раз в 2 минуты и при возвращении на вкладку
  function refresh() {
    if (S.view !== 'app' || S.modal || S.busy || document.hidden) return;
    api('load').then(function () { if (S.view === 'app' && !S.modal && !S.busy) render(true); }, function (err) { if (err.code === 'auth') handleError(err); });
  }
  setInterval(refresh, 120000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) refresh(); });

  var resizeTimer, wasWide = window.matchMedia('(min-width: 900px)').matches;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      var wide = window.matchMedia('(min-width: 900px)').matches;
      if (wide !== wasWide) { wasWide = wide; if (!S.modal && S.view === 'app') render(true); }
    }, 150);
  });

  boot();
})();
