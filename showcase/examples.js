// Реестр демонстрационных примеров витрины. Один источник для страницы просмотра (example.html),
// лендинга и генератора превью/PDF (tools/previews.mjs). Чтобы добавить пример — добавьте запись
// и запустите `npm run previews`.
//   file    — исходный документ в этой папке (как прислал методолог, не правится)
//   clip    — какую часть документа снять на превью: селектор элемента или высота от верха страницы
//   pdf     — true, если документ свёрстан под печать и его можно отдать как PDF
window.HTDC_EXAMPLES = [
  {
    id: "instr-entry",
    file: "Пример инструкции один.html",
    title: "Инструкция на входе: кандидат",
    product: "Управленческая инструкция",
    clip: { selector: ".page", height: 905 },
    pdf: true,
  },
  {
    id: "instr-probation",
    file: "Пример инструкция два.html",
    title: "Инструкция после испытательного срока",
    product: "Управленческая инструкция",
    clip: { selector: ".page", height: 905 },
    pdf: true,
  },
  {
    id: "instr-veteran",
    file: "Примеры инструкции три.html",
    title: "Инструкция для давнего сотрудника",
    product: "Управленческая инструкция",
    clip: { selector: ".page", height: 905 },
    pdf: true,
  },
  {
    id: "plasma",
    file: "плазма пример.html",
    title: "Plasma: экран состояния компании",
    product: "Plasma",
    clip: { selector: ".mock" },
    pdf: false,
  },
  {
    id: "avatar",
    file: "Аватар.html",
    title: "Аватар компании",
    product: "Аватар компании",
    clip: { height: 800 },
    pdf: true,
  },
];
