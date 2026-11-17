const $ = (selector) => document.querySelector(selector);

const settingsApi = globalThis.newTabSettings;
let settings = settingsApi?.current ?? {};

const clock = $("#clock");
const date = $("#date");
const greeting = $("#greeting");
const theme = $("#theme");
const form = $("#search-form");
const input = $("#q");
const settingsButton = $("#settings-button");
const settingsDialog = $("#settings-dialog");
theme.textContent = "Omarchy";

function moment() {
  const now = new Date();
  const hour = now.getHours();
  let message = "Good evening";
  if (hour < 5) message = "Still up?";
  else if (hour < 12) message = "Good morning";
  else if (hour < 18) message = "Good afternoon";

  const timeOptions = {
    hour: "2-digit",
    minute: "2-digit",
    hour12: settings.clock24 === false,
  };
  if (settings.showSeconds === true) timeOptions.second = "2-digit";

  clock.textContent = now.toLocaleTimeString(undefined, timeOptions);
  date.textContent = now.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  greeting.textContent = message;
}

let clockTimer;

function scheduleTick() {
  const now = new Date();
  const delay =
    settings.showSeconds === true
      ? 250
      : 1000 * (60 - now.getSeconds()) + 50;
  clockTimer = setTimeout(tick, Math.max(250, delay));
}

function tick() {
  moment();
  scheduleTick();
}

function refreshClock() {
  clearTimeout(clockTimer);
  tick();
}

function showThemeName(name) {
  if (name) theme.textContent = name;
}

function looksLikeUrl(value) {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return true;
  if (/^(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(value)) return true;
  return (
    /^[^\s/]+\.[^\s/]{2,}(:\d+)?(\/.*)?$/.test(value) && !/\s/.test(value)
  );
}

function navigate(value) {
  if (looksLikeUrl(value)) {
    const url = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
    window.location.href = url;
    return;
  }

  if (globalThis.chrome?.search?.query) {
    chrome.search.query({ text: value, disposition: "CURRENT_TAB" });
  } else {
    window.location.href = `https://duckduckgo.com/?q=${encodeURIComponent(value)}`;
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const value = input.value.trim();
  if (value) navigate(value);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (settingsDialog?.open) return;
    input.blur();
    return;
  }

  const target = event.target;
  if (settingsDialog?.open) return;
  if (
    target instanceof HTMLElement &&
    (target.matches("input, textarea, select") || target.isContentEditable)
  ) {
    return;
  }

  if (event.key === "/") {
    event.preventDefault();
    input.focus();
    input.select();
  }
});

const settingsControls = settingsDialog
  ? [...settingsDialog.querySelectorAll("[data-setting]")]
  : [];

function updateSettingsOutput(control) {
  const key = control.dataset.setting;
  const output = settingsDialog?.querySelector(`[data-output="${key}"]`);
  if (!output) return;
  const suffix =
    key === "wallpaperDim" ? "%" : key === "wallpaperBlur" ? "px" : "";
  output.textContent = `${control.value}${suffix}`;
}

function syncSettingsPanel() {
  for (const control of settingsControls) {
    const key = control.dataset.setting;
    if (control.type === "checkbox") {
      control.checked = Boolean(settings[key]);
    } else {
      control.value = String(settings[key]);
      updateSettingsOutput(control);
    }
  }
}

if (settingsApi && settingsDialog && settingsButton) {
  for (const control of settingsControls) {
    control.addEventListener("input", () => {
      const key = control.dataset.setting;
      const value =
        control.type === "checkbox" ? control.checked : Number(control.value);
      settings = settingsApi.save({ ...settings, [key]: value });
      settingsApi.apply(settings);
      updateSettingsOutput(control);
    });
  }

  const closeSettings = () => {
    if (settingsDialog.open) settingsDialog.close();
  };

  settingsButton.addEventListener("click", () => {
    settings = settingsApi.current ?? settingsApi.read();
    syncSettingsPanel();
    if (!settingsDialog.open) settingsDialog.showModal();
  });

  $("#settings-close")?.addEventListener("click", closeSettings);
  $("#settings-done")?.addEventListener("click", closeSettings);

  settingsDialog.addEventListener("close", () => settingsButton.focus());
  settingsDialog.addEventListener("click", (event) => {
    if (event.target === settingsDialog) closeSettings();
  });

  $("#settings-reset")?.addEventListener("click", () => {
    settings = settingsApi.save(settingsApi.DEFAULTS);
    settingsApi.apply(settings);
    syncSettingsPanel();
  });
}

const themeVariables = [
  "--bg",
  "--bg-darker",
  "--bg-light",
  "--fg",
  "--fg-bright",
  "--fg-muted",
  "--accent",
  "--selection",
  "--wallpaper",
];
const hexColor = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const wallpaper = /^url\(\s*["']?background-[a-z0-9-]+-[0-9a-f]{10}\.(?:png|jpe?g|webp|gif|avif)["']?\s*\)$/i;

function applyTheme(css) {
  let sheet;
  try {
    sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
  } catch (error) {
    return;
  }

  const root = document.documentElement;
  for (const rule of sheet.cssRules) {
    if (rule.selectorText !== ":root") continue;
    for (const name of themeVariables) {
      const value = rule.style.getPropertyValue(name).trim();
      if (!value) continue;
      if (name === "--wallpaper") {
        if (value === "none" || wallpaper.test(value)) {
          root.style.setProperty(name, value);
        }
      } else if (hexColor.test(value)) {
        root.style.setProperty(name, value);
      }
    }
  }
}

async function fetchText(path) {
  try {
    const response = await fetch(path, { cache: "no-store" });
    return response.ok ? await response.text() : "";
  } catch (error) {
    return "";
  }
}

async function refreshTheme() {
  if (document.visibilityState === "hidden") return;
  const css = await fetchText("colors.css");
  if (css) applyTheme(css);
  const name = (await fetchText("theme-name.txt"))
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
  showThemeName(name);
}

document.documentElement.addEventListener("newtab-settings", (event) => {
  settings = event.detail ?? settings;
  refreshClock();
});

tick();
refreshTheme();
setInterval(refreshTheme, 30000);
document.addEventListener("visibilitychange", refreshTheme);
