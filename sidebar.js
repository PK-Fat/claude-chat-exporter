const btn = document.getElementById("exportBtn");
const status = document.getElementById("status");

btn.addEventListener("click", async () => {
  status.textContent = "Exporting…";
  btn.disabled = true;
  try {
    const result = await browser.runtime.sendMessage({ type: "export" });
    status.textContent = result?.error ? `Error: ${result.error}` : `Saved as "${result.filename}"`;
  } catch (err) {
    status.textContent = `Error: ${err.message || err}`;
  } finally {
    btn.disabled = false;
  }
});
