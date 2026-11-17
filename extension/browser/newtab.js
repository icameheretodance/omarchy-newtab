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
const links = $("#links");
const linkForm = $("#link-form");
const linkName = $("#link-name");
const linkUrl = $("#link-url");
const linkAdd = $("#link-add");
const linkList = $("#link-list");
const linkEmpty = $("#link-empty");
const linkStatus = $("#link-status");
const backgroundGrid = $("#background-grid");
const backgroundAdd = $("#background-add");
const backgroundFile = $("#background-file");
const backgroundStatus = $("#background-status");
theme.textContent = "Omarchy";

const WALLPAPER_MANIFEST = "wallpapers.json";
const WALLPAPER_LIMIT = 24;
const MAX_CUSTOM_BACKGROUNDS = 6;
const MAX_CUSTOM_BACKGROUND_BYTES = 20 * 1024 * 1024;
const CUSTOM_BACKGROUND_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/avif",
]);
const WALLPAPER_FILE = /^wallpaper-[0-9a-f]{10}\.(?:png|jpe?g|webp|gif|avif)$/i;
const SYSTEM_WALLPAPER =
  /^url\(\s*["']?((?:background-[a-z0-9-]+|wallpaper)-[0-9a-f]{10}\.(?:png|jpe?g|webp|gif|avif))["']?\s*\)$/i;

let clockTimer;
let systemWallpaper = "none";
let systemWallpaperFile = "";
let themeWallpapers = [];
let wallpaperKey = "";
let customBackgrounds = [];
let backgroundDbPromise;
const customBackgroundUrls = new Map();

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

function linkKey(url) {
  return url.replace(/\/+$/, "").toLowerCase();
}

function linkInitials(name) {
  const words = String(name).trim().split(/\s+/).filter(Boolean).slice(0, 2);
  const initials = words.map((word) => Array.from(word)[0] || "").join("");
  return (initials || "?").toUpperCase();
}

function renderQuickLinks() {
  if (!links) return;
  const limit = settingsApi?.MAX_LINKS ?? 12;
  const saved = settings.showLinks === true ? settings.links ?? [] : [];
  const visible = saved.slice(0, limit);

  links.replaceChildren();
  links.hidden = visible.length === 0;

  for (const link of visible) {
    const anchor = document.createElement("a");
    anchor.className = "quick-link";
    anchor.href = link.url;
    anchor.title = link.name;

    const mark = document.createElement("span");
    mark.className = "quick-link-mark";
    mark.setAttribute("aria-hidden", "true");
    mark.textContent = linkInitials(link.name);

    const label = document.createElement("span");
    label.className = "quick-link-label";
    label.textContent = link.name;

    anchor.append(mark, label);
    links.append(anchor);
  }
}

function setLinkStatus(message) {
  if (linkStatus) linkStatus.textContent = message;
}

function renderLinkSettings() {
  if (!linkList || !settingsApi) return;
  const saved = settings.links ?? [];
  linkList.replaceChildren();

  for (const link of saved) {
    const item = document.createElement("li");
    item.className = "link-item";

    const name = document.createElement("span");
    name.className = "link-item-name";
    name.textContent = link.name;

    const host = document.createElement("span");
    host.className = "link-item-host";
    host.textContent = settingsApi.hostFromUrl(link.url);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "link-remove";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Remove ${link.name}`);
    remove.addEventListener("click", () => {
      settings = settingsApi.save({
        ...settings,
        links: saved.filter((savedLink) => linkKey(savedLink.url) !== linkKey(link.url)),
      });
      settingsApi.apply(settings);
      renderLinkSettings();
      setLinkStatus("Removed.");
    });

    item.append(name, host, remove);
    linkList.append(item);
  }

  if (linkEmpty) linkEmpty.hidden = saved.length > 0;
  if (linkAdd) linkAdd.disabled = saved.length >= settingsApi.MAX_LINKS;
}

const settingsControls = settingsDialog
  ? [...settingsDialog.querySelectorAll("[data-setting]")]
  : [];
const settingsTabs = settingsDialog
  ? [...settingsDialog.querySelectorAll('[role="tab"]')]
  : [];
const settingsPanels = settingsDialog
  ? [...settingsDialog.querySelectorAll('[role="tabpanel"]')]
  : [];
const settingsBody = $("#settings-body");
let activeSettingsTab =
  settingsTabs.find((tab) => tab.getAttribute("aria-selected") === "true")?.id ??
  "";

function activateSettingsTab(tab, { focus = false } = {}) {
  if (!tab) return;
  activeSettingsTab = tab.id;
  for (const item of settingsTabs) {
    const selected = item === tab;
    item.setAttribute("aria-selected", String(selected));
    item.tabIndex = selected ? 0 : -1;
  }
  const panelId = tab.getAttribute("aria-controls");
  for (const panel of settingsPanels) {
    panel.hidden = panel.id !== panelId;
  }
  if (settingsBody) settingsBody.scrollTop = 0;
  if (focus) tab.focus();
}

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

  for (const [index, tab] of settingsTabs.entries()) {
    tab.addEventListener("click", () => activateSettingsTab(tab));
    tab.addEventListener("keydown", (event) => {
      let nextTab = null;
      if (event.key === "ArrowRight") {
        nextTab = settingsTabs[(index + 1) % settingsTabs.length];
      } else if (event.key === "ArrowLeft") {
        nextTab =
          settingsTabs[(index - 1 + settingsTabs.length) % settingsTabs.length];
      } else if (event.key === "Home") {
        nextTab = settingsTabs[0];
      } else if (event.key === "End") {
        nextTab = settingsTabs[settingsTabs.length - 1];
      }
      if (!nextTab) return;
      event.preventDefault();
      activateSettingsTab(nextTab, { focus: true });
    });
  }

  const closeSettings = () => {
    if (settingsDialog.open) settingsDialog.close();
  };

  settingsButton.addEventListener("click", () => {
    settings = settingsApi.current ?? settingsApi.read();
    syncSettingsPanel();
    renderLinkSettings();
    renderBackgroundPicker();
    activateSettingsTab(
      settingsTabs.find((tab) => tab.id === activeSettingsTab) ?? settingsTabs[0],
    );
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
    renderLinkSettings();
    setLinkStatus("");
    setBackgroundStatus("");
  });
}

if (settingsApi && linkForm) {
  linkForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const link = settingsApi.normalizeLink({
      name: linkName.value,
      url: linkUrl.value,
    });
    if (!link) {
      setLinkStatus("Enter a valid http or https URL.");
      linkUrl.focus();
      return;
    }
    if (settings.links.some((savedLink) => linkKey(savedLink.url) === linkKey(link.url))) {
      setLinkStatus("That link is already saved.");
      return;
    }
    if (settings.links.length >= settingsApi.MAX_LINKS) {
      setLinkStatus(`You can save up to ${settingsApi.MAX_LINKS} links.`);
      return;
    }

    settings = settingsApi.save({
      ...settings,
      links: [...settings.links, link],
    });
    settingsApi.apply(settings);
    linkForm.reset();
    renderLinkSettings();
    linkName.focus();
    setLinkStatus("Link added.");
  });
}

function openBackgroundDb() {
  if (!backgroundDbPromise) {
    backgroundDbPromise = new Promise((resolve, reject) => {
      if (!globalThis.indexedDB) {
        reject(new Error("IndexedDB is unavailable"));
        return;
      }
      const request = indexedDB.open("omarchy-newtab", 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("backgrounds")) {
          db.createObjectStore("backgrounds", { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return backgroundDbPromise;
}

function putCustomBackground(record) {
  return openBackgroundDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction("backgrounds", "readwrite");
        tx.objectStore("backgrounds").put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}

function deleteCustomBackground(id) {
  return openBackgroundDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction("backgrounds", "readwrite");
        tx.objectStore("backgrounds").delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}

function setBackgroundStatus(message) {
  if (backgroundStatus) backgroundStatus.textContent = message;
}

function updateBackgroundAddState() {
  if (backgroundAdd) {
    backgroundAdd.disabled = customBackgrounds.length >= MAX_CUSTOM_BACKGROUNDS;
  }
}

function createBackgroundChoice(value, label, imageSource) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "background-choice";
  button.dataset.background = value;
  button.setAttribute("aria-pressed", "false");

  let thumb;
  if (imageSource) {
    thumb = document.createElement("img");
    thumb.className = "background-thumb";
    thumb.src = imageSource;
    thumb.alt = "";
    thumb.loading = "lazy";
    thumb.draggable = false;
  } else {
    thumb = document.createElement("span");
    thumb.className = "background-thumb empty";
  }

  const name = document.createElement("span");
  name.className = "background-label";
  name.textContent = label;

  button.append(thumb, name);
  button.addEventListener("click", () => {
    if (!settingsApi) return;
    settings = settingsApi.save({ ...settings, background: value });
    settingsApi.apply(settings);
    setBackgroundStatus("");
  });
  return button;
}

function updateBackgroundSelection() {
  if (!backgroundGrid) return;
  const selected = settings.background ?? "system";
  for (const button of backgroundGrid.querySelectorAll("[data-background]")) {
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.background === selected),
    );
  }
}

function renderBackgroundPicker() {
  if (!backgroundGrid) return;
  backgroundGrid.replaceChildren();

  const systemItem = document.createElement("div");
  systemItem.className = "background-item";
  systemItem.append(
    createBackgroundChoice("system", "System", systemWallpaperFile),
  );
  backgroundGrid.append(systemItem);

  const noneItem = document.createElement("div");
  noneItem.className = "background-item";
  noneItem.append(createBackgroundChoice("none", "None"));
  backgroundGrid.append(noneItem);

  for (const wallpaper of themeWallpapers) {
    const item = document.createElement("div");
    item.className = "background-item";
    item.append(
      createBackgroundChoice(
        `theme:${wallpaper.file}`,
        wallpaper.name,
        wallpaper.file,
      ),
    );
    backgroundGrid.append(item);
  }

  for (const custom of customBackgrounds) {
    const url = customBackgroundUrls.get(custom.id);
    if (!url) continue;
    const item = document.createElement("div");
    item.className = "background-item";
    item.append(createBackgroundChoice(`custom:${custom.id}`, custom.name, url));

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "background-remove";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Remove ${custom.name}`);
    remove.addEventListener("click", (event) => {
      event.stopPropagation();
      removeCustomBackground(custom);
    });
    item.append(remove);
    backgroundGrid.append(item);
  }

  updateBackgroundSelection();
}

function applyBackground() {
  const background = settings.background ?? "system";
  let value = systemWallpaper;

  if (background === "none") {
    value = "none";
  } else if (background.startsWith("theme:")) {
    const file = background.slice("theme:".length);
    if (themeWallpapers.some((wallpaper) => wallpaper.file === file)) {
      value = `url("${file}")`;
    }
  } else if (background.startsWith("custom:")) {
    const id = background.slice("custom:".length);
    const url = customBackgroundUrls.get(id);
    if (url) value = `url("${url}")`;
  }

  document.documentElement.style.setProperty("--wallpaper", value || "none");
  updateBackgroundSelection();
}

async function loadCustomBackgrounds() {
  if (!settingsApi) return;
  try {
    const db = await openBackgroundDb();
    const records = await new Promise((resolve, reject) => {
      const tx = db.transaction("backgrounds", "readonly");
      const request = tx.objectStore("backgrounds").getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    for (const url of customBackgroundUrls.values()) URL.revokeObjectURL(url);
    customBackgroundUrls.clear();
    customBackgrounds = [];

    for (const record of (Array.isArray(records) ? records : []).sort(
      (a, b) => (a?.createdAt ?? 0) - (b?.createdAt ?? 0),
    )) {
      if (!record || typeof record.id !== "string") continue;
      if (!(record.blob instanceof Blob)) continue;
      const name =
        String(record.name ?? "")
          .replace(/[\u0000-\u001f\u007f]/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 60) || "Custom wallpaper";
      const url = URL.createObjectURL(record.blob);
      customBackgroundUrls.set(record.id, url);
      customBackgrounds.push({ id: record.id, name });
      if (customBackgrounds.length >= MAX_CUSTOM_BACKGROUNDS) break;
    }

    if (
      settings.background?.startsWith("custom:") &&
      !customBackgroundUrls.has(settings.background.slice("custom:".length))
    ) {
      settings = settingsApi.save({ ...settings, background: "system" });
      settingsApi.apply(settings);
    }

    updateBackgroundAddState();
    renderBackgroundPicker();
    applyBackground();
  } catch {
    setBackgroundStatus("Custom backgrounds are unavailable.");
  }
}

async function addCustomBackground(file) {
  if (!settingsApi) return;
  if (!CUSTOM_BACKGROUND_TYPES.has(file.type)) {
    setBackgroundStatus("Choose a PNG, JPEG, WebP, GIF, or AVIF image.");
    return;
  }
  if (file.size <= 0 || file.size > MAX_CUSTOM_BACKGROUND_BYTES) {
    setBackgroundStatus("Use an image smaller than 20 MB.");
    return;
  }
  if (customBackgrounds.length >= MAX_CUSTOM_BACKGROUNDS) {
    setBackgroundStatus(
      `You can save up to ${MAX_CUSTOM_BACKGROUNDS} custom backgrounds.`,
    );
    return;
  }

  const previewUrl = URL.createObjectURL(file);
  try {
    await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = resolve;
      image.onerror = reject;
      image.src = previewUrl;
    });
  } catch {
    URL.revokeObjectURL(previewUrl);
    setBackgroundStatus("Could not read that image.");
    return;
  }
  URL.revokeObjectURL(previewUrl);

  if (typeof crypto.randomUUID !== "function") {
    setBackgroundStatus("Could not save that image.");
    return;
  }
  const id = crypto.randomUUID();
  const name =
    String(file.name ?? "")
      .replace(/\.[^.]+$/, "")
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 60) || "Custom wallpaper";

  try {
    await putCustomBackground({
      id,
      name,
      type: file.type,
      blob: file,
      createdAt: Date.now(),
    });
  } catch {
    setBackgroundStatus("Could not save that image.");
    return;
  }

  await loadCustomBackgrounds();
  settings = settingsApi.save({ ...settings, background: `custom:${id}` });
  settingsApi.apply(settings);
  setBackgroundStatus("Added custom background.");
}

async function removeCustomBackground(custom) {
  try {
    await deleteCustomBackground(custom.id);
  } catch {
    setBackgroundStatus("Could not remove that image.");
    return;
  }

  if (settings.background === `custom:${custom.id}`) {
    settings = settingsApi.save({ ...settings, background: "system" });
    settingsApi.apply(settings);
  }
  await loadCustomBackgrounds();
  setBackgroundStatus("Removed custom background.");
}

if (settingsApi && backgroundAdd && backgroundFile) {
  backgroundAdd.addEventListener("click", () => backgroundFile.click());
  backgroundFile.addEventListener("change", async () => {
    const file = backgroundFile.files?.[0];
    backgroundFile.value = "";
    if (file) await addCustomBackground(file);
  });
}

function parseWallpaperManifest(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];

  const wallpapers = [];
  const seen = new Set();
  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const file = typeof item.file === "string" ? item.file : "";
    if (!WALLPAPER_FILE.test(file) || seen.has(file)) continue;
    seen.add(file);
    const name =
      (typeof item.name === "string"
        ? item.name
            .replace(/[\u0000-\u001f\u007f]/g, " ")
            .replace(/\s+/g, " ")
            .trim()
        : "") || file;
    wallpapers.push({ file, name: name.slice(0, 80) });
    if (wallpapers.length >= WALLPAPER_LIMIT) break;
  }
  return wallpapers;
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

function applyTheme(css) {
  let sheet;
  try {
    sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
  } catch {
    return;
  }

  const root = document.documentElement;
  for (const rule of sheet.cssRules) {
    if (rule.selectorText !== ":root") continue;
    for (const name of themeVariables) {
      const value = rule.style.getPropertyValue(name).trim();
      if (!value) continue;
      if (name === "--wallpaper") {
        if (value === "none") {
          systemWallpaper = "none";
          systemWallpaperFile = "";
        } else {
          const match = SYSTEM_WALLPAPER.exec(value);
          if (match) {
            systemWallpaper = `url("${match[1]}")`;
            systemWallpaperFile = match[1];
          }
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
  } catch {
    return "";
  }
}

async function refreshWallpapers() {
  const text = await fetchText(WALLPAPER_MANIFEST);
  const next = text ? parseWallpaperManifest(text) : [];
  const key = `${JSON.stringify(next)}|${systemWallpaperFile}`;
  if (key !== wallpaperKey) {
    wallpaperKey = key;
    themeWallpapers = next;
    renderBackgroundPicker();
  }
  applyBackground();
}

async function refreshTheme() {
  if (document.visibilityState === "hidden") return;
  const css = await fetchText("colors.css");
  if (css) applyTheme(css);
  const name = (await fetchText("theme-name.txt"))
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
  showThemeName(name);
  await refreshWallpapers();
}

document.documentElement.addEventListener("newtab-settings", (event) => {
  settings = event.detail ?? settings;
  refreshClock();
  renderQuickLinks();
  applyBackground();
});

renderLinkSettings();
renderBackgroundPicker();
renderQuickLinks();
updateBackgroundAddState();
applyBackground();
tick();
refreshTheme();
loadCustomBackgrounds();
setInterval(refreshTheme, 30000);
document.addEventListener("visibilitychange", refreshTheme);
