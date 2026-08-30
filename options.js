const DEFAULT_MODE = "toolbar";
const radios = document.querySelectorAll('input[name="uiMode"]');

(async () => {
  const { uiMode = DEFAULT_MODE } = await browser.storage.local.get("uiMode");
  for (const r of radios) r.checked = r.value === uiMode;
})();

for (const r of radios) {
  r.addEventListener("change", async () => {
    if (r.checked) await browser.storage.local.set({ uiMode: r.value });
  });
}
