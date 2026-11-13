// Настройки пересборки документов: обложка, колонтитул, замены в тексте и перенос блоков на новые листы.
// split — функции, которые выполняются в браузере: pages — листы оригинала по порядку,
// h.continueAfter(лист, { sub, layout }) создаёт пустой лист-продолжение и возвращает { page, body }.
// tight — номера листов оригинала (с нуля), которым нужен плотный вариант: тот же кегль, меньше воздуха.
// airy — просторный вариант: кегль крупнее, когда текста меньше, чем места. Листы-продолжения наследуют вариант.

// Карточка «Что показывают индексы» с первого листа — на свой лист, показатели в три колонки
const INDEX_PAGE = (pages, h) => {
  const p = pages[0];
  const card = p.querySelector(".grid > div:first-child > .card:last-child");
  const { body } = h.continueAfter(p, { sub: "Что показывают индексы — по каждому показателю", layout: "solo" });
  body.append(card);
};

// Первый лист оригинала — на два. Первый: баннер и главное. Второй: факты, готовность, как говорить, риски.
// Три колонки сохраняются на обоих.
const SPLIT_FIRST = (pages, h) => {
  const p = pages[0];
  const grid = p.querySelector(".grid");
  const [col1, mid, col3] = grid.children;
  const card = (cls, title, ...nodes) => {
    const el = document.createElement("div");
    el.className = "card " + cls;
    if (title) { const t = document.createElement("div"); t.className = "card-title"; t.textContent = title; el.append(t); }
    el.append(...nodes);
    return el;
  };
  const column = (...cards) => { const d = document.createElement("div"); d.className = "col"; d.append(...cards.filter(Boolean)); return d; };

  // Из средней карточки: факты, готовность, реплики
  let facts = null;
  const fb = mid.querySelector(".fact-block");
  if (fb) { const l = fb.querySelector(".fact-label"); const title = l.textContent; l.remove(); facts = card("", title, fb); }
  let ready = null;
  const lb = mid.querySelector(".level-block");
  if (lb) { const t = lb.querySelector(".card-title"); const title = t.textContent; t.remove(); ready = card("blue", title, lb); }
  let talk = null;
  const tt = [...mid.querySelectorAll(":scope > .card-title")].find((t) => /говорить/.test(t.textContent));
  if (tt) { const lines = []; let n = tt.nextElementSibling; while (n && n.classList.contains("script-box")) { lines.push(n); n = n.nextElementSibling; } talk = card("gold", tt.textContent, ...lines); tt.remove(); }

  // Из правой колонки: всё, кроме последней карточки («Что с ним делать»)
  const risks = [...col3.children].slice(0, -1);
  const leave = risks.find((r) => /уйд/.test(r.textContent));
  const rest = risks.filter((r) => r !== leave);

  const { body } = h.continueAfter(p, { sub: "Факты, готовность, риски и как говорить", layout: "grid" });
  body.append(column(facts, ready), column(talk, leave), column(...rest));
};

// Третья инструкция: «Цепочка развития» и «Что делать после 21 дня» — в начало памятки,
// у которой и так есть раздел «После Шлюза»
const AFTER_EXPERIMENT = (pages) => {
  const from = pages[3], to = pages[4];
  const grid = from.querySelector(".shluz-grid");
  const tail = [];
  for (let n = grid.nextElementSibling; n && !n.classList.contains("folio"); n = n.nextElementSibling) tail.push(n);
  to.querySelector(":scope > .header").after(...tail);
};

// Аватар: в оригинале одна длинная лента. Каждый раздел (h2 + слой) — на свой лист,
// первым идёт шапка компании со статусом и первым слоем
const AVATAR_PAGES = (pages) => {
  const orig = pages[0];
  const folio = orig.querySelector(":scope > .folio");
  const kids = [...orig.children].filter((k) => k !== folio);
  const sheet = (title, sub) => {
    const s = document.createElement("div");
    s.className = "page sheet";
    const head = document.createElement("div");
    head.className = "header";
    head.innerHTML = "<div class=\"header-left\"><h1></h1></div>";
    head.querySelector("h1").textContent = title;
    if (sub) { const p = document.createElement("p"); p.textContent = sub; head.firstChild.append(p); }
    s.append(head);
    orig.before(s);
    return s;
  };
  let cur = null;
  const h1 = kids.find((k) => k.tagName === "H1");
  const sub = kids.find((k) => k.classList.contains("subtitle"));
  cur = sheet(h1.textContent, sub?.textContent);
  for (const k of kids) {
    if (k === h1 || k === sub) continue;
    if (k.tagName === "H2") {
      // первый раздел остаётся на листе с шапкой компании
      if (cur.querySelector(".layer")) cur = sheet(k.textContent);
      else { const p = document.createElement("p"); p.className = "layer-name"; p.textContent = k.textContent; cur.append(p); }
      continue;
    }
    cur.append(k);
  }
  for (const s of document.querySelectorAll(".sheet.page")) s.append(folio.cloneNode(true));
  orig.remove();
  // Роли: пять человек не помещаются — последние двое на лист-продолжение
  const roles = [...document.querySelectorAll(".role-card")];
  if (roles.length > 3) {
    const src = roles[0].closest(".sheet");
    const s = document.createElement("div");
    s.className = "page sheet";
    const head = src.querySelector(".header").cloneNode(true);
    const p = document.createElement("p");
    p.textContent = "Продолжение";
    head.firstChild.append(p);
    const layer = document.createElement("div");
    layer.className = "layer layer--wide";
    const content = document.createElement("div");
    content.className = "layer-content";
    content.append(...roles.slice(3));
    layer.append(content);
    s.append(head, layer, src.querySelector(".folio").cloneNode(true));
    src.after(s);
  }
  // Подписи-примечания внизу тачбордов
  for (const tb of document.querySelectorAll(".touchboard")) {
    const last = tb.lastElementChild;
    if (last && !last.className) last.className = "tb-note";
  }
};

// Plasma: в оригинале веб-страница. Первый экран (текст + макет экрана) — первый лист,
// каждый раздел — свой лист: заголовок раздела становится заголовком листа, подпись над ним — строкой под ним
const PLASMA_PAGES = (pages, h) => {
  const sheet = (title, sub) => {
    const s = document.createElement("div");
    s.className = "page sheet";
    const head = document.createElement("div");
    head.className = "header";
    head.innerHTML = "<div class=\"header-left\"><h1></h1></div>";
    head.querySelector("h1").textContent = title;
    if (sub) { const p = document.createElement("p"); p.textContent = sub; head.firstChild.append(p); }
    s.append(head);
    document.body.append(s);
    return s;
  };
  const hero = document.querySelector("header.hero");
  const first = sheet(hero.querySelector("h1").textContent, hero.querySelector(".eyebrow")?.textContent);
  const grid = document.createElement("div");
  grid.className = "hero-grid";
  const text = document.createElement("div");
  text.className = "hero-text";
  text.append(...hero.querySelectorAll(".lead, .lead-hint"));
  grid.append(text, hero.querySelector(".mock"));
  first.append(grid, h.folio());

  for (const sec of document.querySelectorAll("section.blk")) {
    const s = sheet(sec.querySelector("h2").textContent, sec.querySelector(".blk-eyebrow")?.textContent);
    sec.querySelector("h2").remove();
    sec.querySelector(".blk-eyebrow")?.remove();
    const body = document.createElement("div");
    body.className = "blk-body";
    body.append(...sec.children);
    s.append(body, h.folio());
  }
  document.querySelectorAll("body > nav, header.hero, section.blk, footer.foot").forEach((el) => el.remove());

  // «Что это значит в деньгах» и «Как это работает» короткие — на одном листе, у второго свой заголовок
  {
    const all = [...document.querySelectorAll(".page.sheet")];
    const [money, cycle] = all.slice(-2);
    const part = document.createElement("div");
    part.className = "blk-part";
    const t = document.createElement("h2");
    t.className = "blk-part__title";
    t.textContent = cycle.querySelector("h1").textContent;
    const sub = cycle.querySelector(".header-left p");
    part.append(t);
    if (sub) { sub.className = "blk-part__sub"; part.append(sub); }
    part.append(...cycle.querySelector(".blk-body").children);
    money.querySelector(".blk-body").append(part);
    cycle.remove();
  }

  // Четыре индекса с полными описаниями — по два на лист
  const idx = [...document.querySelectorAll(".idx-grid > .idx")];
  if (idx.length === 4) {
    const src = idx[0].closest(".sheet");
    const s = document.createElement("div");
    s.className = "page sheet";
    const head = src.querySelector(".header").cloneNode(true);
    const sub = head.querySelector("p") || head.firstChild.appendChild(document.createElement("p"));
    sub.textContent = "Продолжение";
    const body = document.createElement("div");
    body.className = "blk-body";
    const g = document.createElement("div");
    g.className = "idx-grid";
    g.append(idx[2], idx[3]);
    body.append(g);
    s.append(head, body, h.folio());
    src.after(s);
  }
};

const NOTE = "Демонстрационный пример. Имена, компании и цифры условные: документ показывает формат, а не данные клиента.";

export const DOCS = [
  {
    id: "instruction-entry",
    source: "Пример инструкции один.html",
    title: "Инструкция на входе: Алексей",
    folio: "Инструкция на входе · Алексей",
    cover: {
      kind: "Управленческая инструкция",
      title: "Инструкция на входе",
      who: "Алексей, кандидат на должность менеджера · ООО «Гранит»",
      meta: [["Этап", "До найма"], ["Основа", "12 вопросов, 5 минут"], ["Для кого", "HR, прямой руководитель"]],
      note: NOTE,
    },
    split: [INDEX_PAGE, SPLIT_FIRST],
    tight: [3],
    airy: [0],
  },
  {
    id: "instruction-probation",
    source: "Пример инструкция два.html",
    title: "Инструкция после испытательного срока: Марина",
    folio: "Инструкция после испытательного срока · Марина",
    cover: {
      kind: "Управленческая инструкция",
      title: "Инструкция после испытательного срока",
      who: "Марина, менеджер проектов · ООО «Гранит»",
      meta: [["Этап", "3 месяца в системе"], ["Основа", "30 вопросов, 15 минут"], ["Для кого", "HR, прямой руководитель"]],
      note: NOTE,
    },
    split: [INDEX_PAGE, SPLIT_FIRST],
    tight: [2, 3],
  },
  {
    id: "instruction-veteran",
    source: "Примеры инструкции три.html",
    title: "Инструкция для старожила: Дмитрий",
    folio: "Инструкция для старожила · Дмитрий",
    cover: {
      kind: "Управленческая инструкция",
      title: "Инструкция для старожила",
      who: "Дмитрий, руководитель направления · ООО «Гранит»",
      meta: [["Этап", "5 лет в системе"], ["Основа", "42 вопроса, 20 минут"], ["Для кого", "HR, прямой руководитель, собственник"]],
      note: NOTE,
    },
    split: [INDEX_PAGE, SPLIT_FIRST, AFTER_EXPERIMENT],
    tight: [2, 3],
  },
  {
    id: "company-avatar",
    source: "Аватар.html",
    title: "Аватар компании",
    folio: "Аватар компании · Завод металлоконструкций",
    bodyClass: "avatar",
    replace: [["Уралметконструкция", "Завод металлоконструкций"]],
    cover: {
      kind: "Аватар компании",
      title: "Аватар компании",
      who: "Завод металлоконструкций · Держим форму, когда всё гнётся",
      meta: [["Данные на", "25 сентября 2026"], ["Масштаб", "480 сотрудников, оборот 2,3 млрд ₽"], ["Внутри", "Восемь слоёв, роли, Шлюзы, история ИРК"]],
      note: NOTE,
    },
    split: [AVATAR_PAGES],
  },
  {
    id: "plasma",
    source: "плазма пример.html",
    title: "Plasma: один экран — вся картина компании",
    folio: "Plasma · экран состояния компании",
    bodyClass: "plasma-doc",
    cover: {
      kind: "Plasma",
      title: "Один экран. Вся картина компании",
      who: "Plasma показывает, где компания работает в полную силу, а где решения буксуют",
      meta: [["Для кого", "Собственник и команда руководителей"], ["Внутри", "Экран, четыре индекса, деньги, цикл проверки"]],
      note: NOTE,
    },
    split: [PLASMA_PAGES],
  },
];
