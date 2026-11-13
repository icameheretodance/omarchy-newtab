const $ = (selector) => document.querySelector(selector);

const clock = $("#clock");
const date = $("#date");
const greeting = $("#greeting");
const theme = $("#theme");
const form = $("#search-form");
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

function showThemeName() {
  const name = getComputedStyle(document.documentElement)
    .getPropertyValue("--theme-name")
    .trim()
    .replace(/^["']|["']$/g, "");
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

async function refreshTheme() {
  if (document.visibilityState === "hidden") return;
  try {
    const response = await fetch("colors.css", { cache: "no-store" });
    if (!response.ok) return;
    const css = await response.text();
    let style = document.getElementById("live-theme");
    if (!style) {
      style = document.createElement("style");
      style.id = "live-theme";
      document.head.appendChild(style);
    }
    if (style.textContent !== css) style.textContent = css;
    showThemeName();
  } catch (error) {
    // The generated theme file is missing; the fallback palette stays.
  }
}

tick();
showThemeName();
refreshTheme();
setInterval(refreshTheme, 30000);
document.addEventListener("visibilitychange", refreshTheme);
