(() => {
  const STORAGE_KEY = "omarchy-newtab-settings-v1";
  const DEFAULTS = Object.freeze({
    showClock: true,
    showDate: true,
    showGreeting: true,
    showTheme: true,
    clock24: true,
    showSeconds: false,
    compact: false,
    reduceMotion: false,
    wallpaperDim: 90,
    wallpaperBlur: 1,
  });
  const BOOLEAN_KEYS = [
    "showClock",
    "showDate",
    "showGreeting",
    "showTheme",
    "clock24",
    "showSeconds",
    "compact",
    "reduceMotion",
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

  function normalize(value) {
    const settings = { ...DEFAULTS };
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

    root.classList.toggle("compact", settings.compact);
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
    normalize,
    read,
    save,
    apply,
    current: DEFAULTS,
  };

  globalThis.newTabSettings = api;
  apply(read());
})();
