// Реестр демонстрационных примеров витрины. Один источник для страницы просмотра (example.html),
// страницы инструментов (tools.html) и генератора превью (tools/previews.mjs).
// Документы лежат в showcase/docs/: это оформленные версии, их собирает tools/restyle.mjs
// из оригиналов методолога, а PDF печатает tools/docs.mjs.
//   file    — документ, который открывается в рамке
//   pdf     — готовый PDF рядом с документом
//   sheet   — номер листа, который снимается на превью (первый лист у всех одинаковый: обложка)
window.HTDC_EXAMPLES = [
  {
    id: "instr-entry",
    file: "docs/instruction-entry.html",
    pdf: "docs/instruction-entry.pdf",
    title: "Инструкция на входе: кандидат",
    product: "Управленческая инструкция",
    sheet: 2,
  },
  {
    id: "instr-probation",
    file: "docs/instruction-probation.html",
    pdf: "docs/instruction-probation.pdf",
    title: "Инструкция после испытательного срока",
    product: "Управленческая инструкция",
    sheet: 2,
  },
  {
    id: "instr-veteran",
    file: "docs/instruction-veteran.html",
    pdf: "docs/instruction-veteran.pdf",
    title: "Инструкция для давнего сотрудника",
    product: "Управленческая инструкция",
    sheet: 2,
  },
  {
    id: "plasma",
    file: "docs/plasma.html",
    pdf: "docs/plasma.pdf",
    title: "Plasma: экран состояния компании",
    product: "Plasma",
    sheet: 2,
  },
  {
    id: "avatar",
    file: "docs/company-avatar.html",
    pdf: "docs/company-avatar.pdf",
    title: "Аватар компании",
    product: "Аватар компании",
    sheet: 2,
  },
];
