// Applies the stored theme before first paint to avoid a theme flash.
// Keep this storage key in sync with src/app/theme/theme.ts.
(function () {
  try {
    var stored = localStorage.getItem('paperlens.theme');
    var preference =
      stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
    var isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var theme = preference === 'system' ? (isDark ? 'dark' : 'light') : preference;
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch (error) {
    document.documentElement.dataset.theme = 'light';
  }
})();
