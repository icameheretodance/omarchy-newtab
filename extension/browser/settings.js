(() => {
  const STORAGE_KEY = "omarchy-newtab-settings-v1";
  const MAX_LINKS = 12;
  const MAX_LINK_NAME = 40;
  const MAX_URL_LENGTH = 2048;
  const BACKGROUND_PATTERN =
    /^(?:system|none|theme:wallpaper-[0-9a-f]{10}\.(?:png|jpe?g|webp|gif|avif)|custom:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
  const DEFAULTS = Object.freeze({
    showClock: true,
    showDate: true,
    showGreeting: true,
    showTheme: true,
    clock24: true,
    showSeconds: false,
    reduceMotion: false,
    wallpaperDim: 90,
    wallpaperBlur: 1,
    showLinks: false,
    links: [],
    background: "system",
  });
  const BOOLEAN_KEYS = [
    "showClock",
    "showDate",
    "showGreeting",
    "showTheme",
    "clock24",
    "showSeconds",
    "reduceMotion",
    "showLinks",
  ];
  const RANGES = {
    wallpaperDim: [0, 100],
    wallpaperBlur: [0, 20],
  };
  const VISIBILITY_CLASSES = {
    showClock: "no-clock",
    showDate: "no-date",
    showGreeting: "no-greeting",
    showTheme: "no-theme",
  };

  function stripControl(value) {
    return typeof value === "string"
      ? value.replace(/[\u0000-\u001f\u007f]/g, " ")
      : "";
  }

  function normalizeLinkName(value) {
    return stripControl(value)
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, MAX_LINK_NAME);
  }

  function hostFromUrl(value) {
    try {
      return new URL(value).hostname.replace(/^www\./i, "");
    } catch {
      return "";
    }
  }

  function normalizeUrl(value) {
    if (typeof value !== "string") return "";
    let text = value.trim();
    if (
      !text ||
      text.length > MAX_URL_LENGTH ||
      /[\u0000-\u001f\u007f]/.test(text)
    ) {
      return "";
    }
    if (!text.includes("://")) text = `https://${text}`;

    try {
      const url = new URL(text);
      if (url.protocol !== "http:" && url.protocol !== "https:") return "";
      if (!url.hostname || url.username || url.password) return "";
      return url.href.length <= MAX_URL_LENGTH ? url.href : "";
    } catch {
      return "";
    }
  }

  function normalizeLink(value) {
    if (!value || typeof value !== "object") return null;
    const url = normalizeUrl(value.url);
    if (!url) return null;
    const name = (
      normalizeLinkName(value.name) ||
      hostFromUrl(url) ||
      url
    ).slice(0, MAX_LINK_NAME);
    return { name, url };
  }

  function normalizeLinks(value) {
    if (!Array.isArray(value)) return [];
    const links = [];
    const seen = new Set();
    for (const item of value) {
      const link = normalizeLink(item);
      if (!link) continue;
      const key = link.url.replace(/\/+$/, "").toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      links.push(link);
      if (links.length >= MAX_LINKS) break;
    }
    return links;
  }

  function normalizeBackground(value) {
    return typeof value === "string" && BACKGROUND_PATTERN.test(value)
      ? value
      : DEFAULTS.background;
  }

  function normalize(value) {
    const settings = { ...DEFAULTS, links: [] };
    if (!value || typeof value !== "object") return settings;

    for (const key of BOOLEAN_KEYS) {
      if (typeof value[key] === "boolean") settings[key] = value[key];
    }

    for (const [key, [min, max]] of Object.entries(RANGES)) {
      const number = Number(value[key]);
      if (Number.isFinite(number)) {
        settings[key] = Math.min(max, Math.max(min, Math.round(number)));
      }
    }

    settings.links = normalizeLinks(value.links);
    settings.background = normalizeBackground(value.background);
    return settings;
  }

  function read() {
    try {
      return normalize(JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"));
    } catch {
      return normalize(null);
    }
  }

  function save(value) {
    const settings = normalize(value);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {}
    return settings;
  }

  function apply(value) {
    const settings = normalize(value);
    const root = document.documentElement;

    for (const [key, className] of Object.entries(VISIBILITY_CLASSES)) {
      root.classList.toggle(className, !settings[key]);
    }

    root.classList.toggle("reduce-motion", settings.reduceMotion);
    root.style.setProperty("--wallpaper-dim", String(settings.wallpaperDim / 100));
    root.style.setProperty("--wallpaper-blur", `${settings.wallpaperBlur}px`);
    root.style.setProperty("--wallpaper-inset", `${-24 - settings.wallpaperBlur * 2}px`);

    api.current = settings;
    root.dispatchEvent(new CustomEvent("newtab-settings", { detail: settings }));
    return settings;
  }

  const api = {
    STORAGE_KEY,
    DEFAULTS,
    MAX_LINKS,
    normalize,
    normalizeUrl,
    normalizeLinkName,
    normalizeLink,
    normalizeBackground,
    hostFromUrl,
    read,
    save,
    apply,
    current: DEFAULTS,
  };

  globalThis.newTabSettings = api;
  apply(read());
})();
