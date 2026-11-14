const $ = (selector) => document.querySelector(selector);

const clock = $("#clock");
const date = $("#date");
const greeting = $("#greeting");
const theme = $("#theme");
const form = $("#search-form");
theme.textContent = "Omarchy";
const input = $("#q");

function moment() {
  const now = new Date();
  const hour = now.getHours();
  let message = "Good evening";
  if (hour < 5) message = "Still up?";
  else if (hour < 12) message = "Good morning";
  else if (hour < 18) message = "Good afternoon";

  clock.textContent = now.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  date.textContent = now.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  greeting.textContent = message;
}

function tick() {
  moment();
  const now = new Date();
  const next = 1000 * (60 - now.getSeconds()) + 50;
  setTimeout(tick, Math.max(250, next));
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
  if (event.key === "/" && document.activeElement !== input) {
    event.preventDefault();
    input.focus();
    input.select();
  } else if (event.key === "Escape") {
    input.blur();
  }
});

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

async function refreshTheme() {
  if (document.visibilityState === "hidden") return;
  try {
    const [cssResponse, nameResponse] = await Promise.all([
      fetch("colors.css", { cache: "no-store" }),
      fetch("theme-name.txt", { cache: "no-store" }),
    ]);
    if (cssResponse.ok) applyTheme(await cssResponse.text());
    if (nameResponse.ok) {
      const name = (await nameResponse.text())
        .replace(/[\u0000-\u001f\u007f]/g, "")
        .trim();
      showThemeName(name);
    }
  } catch (error) {
    // The generated theme files are missing; the fallback palette stays.
  }
}

tick();
refreshTheme();
setInterval(refreshTheme, 30000);
document.addEventListener("visibilitychange", refreshTheme);
