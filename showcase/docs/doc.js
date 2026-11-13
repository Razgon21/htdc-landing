// Лист A4 на узком экране уменьшается целиком, чтобы совпадать с PDF
(() => {
  const fit = () => {
    const sheet = 297 / 25.4 * 96 + 24; // ширина листа в CSS-пикселях с полями
    document.documentElement.style.setProperty("--fit", Math.min(1, innerWidth / sheet).toFixed(3));
  };
  fit();
  addEventListener("resize", fit);
})();
