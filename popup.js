/* NyxDotSkipAdds — logique du menu */

const toggle     = document.getElementById("toggle");
const statusText = document.getElementById("status");
const countEl    = document.getElementById("count");
const resetBtn   = document.getElementById("reset");

function render(enabled, count) {
  toggle.checked = enabled;
  statusText.textContent = enabled ? "Activé" : "Désactivé";
  statusText.className = "status " + (enabled ? "on" : "off");
  countEl.textContent = count;
  document.body.classList.toggle("disabled", !enabled);
}

chrome.storage.local.get({ enabled: true, adsSkipped: 0 }, function (res) {
  render(res.enabled !== false, res.adsSkipped || 0);
});

toggle.addEventListener("change", function () {
  chrome.storage.local.set({ enabled: toggle.checked });
});

resetBtn.addEventListener("click", function () {
  chrome.storage.local.set({ adsSkipped: 0 });
});

chrome.storage.onChanged.addListener(function (changes, area) {
  if (area !== "local") return;
  chrome.storage.local.get({ enabled: true, adsSkipped: 0 }, function (res) {
    render(res.enabled !== false, res.adsSkipped || 0);
  });
});
