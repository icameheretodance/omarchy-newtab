#!/bin/bash
# Shared helpers for the Omarchy New Tab browser integration.

set -u

PLUGIN_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
EXTENSION_DIR="$PLUGIN_DIR/extension"
CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"
STATE_HOME="${XDG_STATE_HOME:-$HOME/.local/state}"
OMARCHY_CURRENT="${OMARCHY_CURRENT_DIR:-$HOME/.local/state/omarchy/current}"
PLUGIN_STATE_DIR="${NEWTAB_STATE_DIR:-$STATE_HOME/omarchy-newtab}"

trim() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

notify() {
  local headline="$1"
  local description="${2:-}"
  [[ ${NEWTAB_QUIET:-0} == 1 ]] && return 0

  if command -v omarchy-notification-send >/dev/null 2>&1; then
    if [[ -n $description ]]; then
      omarchy-notification-send -u low -g 󰖟 "$headline" "$description" >/dev/null 2>&1 || true
    else
      omarchy-notification-send -u low -g 󰖟 "$headline" >/dev/null 2>&1 || true
    fi
  elif command -v notify-send >/dev/null 2>&1; then
    notify-send "$headline" "$description" >/dev/null 2>&1 || true
  fi
}

notify_once() {
  local key="$1"
  shift
  local marker
  marker="$PLUGIN_STATE_DIR/notified-${key//[^A-Za-z0-9._-]/-}"
  [[ -e $marker ]] && return 0
  mkdir -p -- "$PLUGIN_STATE_DIR"
  notify "$@"
  : > "$marker"
}

detect_default_desktop() {
  if [[ -n ${NEWTAB_BROWSER_DESKTOP:-} ]]; then
    printf '%s' "$NEWTAB_BROWSER_DESKTOP"
    return
  fi

  local desktop=""
  if command -v xdg-settings >/dev/null 2>&1; then
    desktop="$(env -u BROWSER xdg-settings get default-web-browser 2>/dev/null || true)"
  fi
  if [[ -z $desktop ]] && command -v xdg-mime >/dev/null 2>&1; then
    desktop="$(xdg-mime query default x-scheme-handler/https 2>/dev/null || true)"
  fi
  printf '%s' "$desktop"
}

set_browser_info() {
  BROWSER_DESKTOP="${1:-}"
  BROWSER_NAME=""
  BROWSER_CONF=""
  BROWSER_PROCESS=""
  BROWSER_SUPPORT="unknown"

  case "$BROWSER_DESKTOP" in
  helium.desktop)
    BROWSER_NAME="Helium"
    BROWSER_CONF="helium-browser-flags.conf"
    BROWSER_PROCESS="helium-browser"
    BROWSER_SUPPORT="supported"
    ;;
  chromium.desktop | chromium-browser.desktop)
    BROWSER_NAME="Chromium"
    BROWSER_CONF="chromium-flags.conf"
    BROWSER_PROCESS="chromium"
    BROWSER_SUPPORT="supported"
    ;;
  brave.desktop | brave-browser.desktop | brave-browser-beta.desktop | brave-browser-nightly.desktop)
    BROWSER_NAME="Brave"
    BROWSER_CONF="brave-flags.conf"
    BROWSER_PROCESS="brave"
    BROWSER_SUPPORT="supported"
    ;;
  google-chrome.desktop | google-chrome-stable.desktop)
    BROWSER_NAME="Google Chrome"
    BROWSER_SUPPORT="unsupported"
    ;;
  microsoft-edge.desktop | microsoft-edge-stable.desktop)
    BROWSER_NAME="Microsoft Edge"
    BROWSER_SUPPORT="unsupported"
    ;;
  vivaldi.desktop | vivaldi-stable.desktop)
    BROWSER_NAME="Vivaldi"
    BROWSER_SUPPORT="unsupported"
    ;;
  firefox.desktop)
    BROWSER_NAME="Firefox"
    BROWSER_SUPPORT="incompatible"
    ;;
  zen.desktop | zen-browser.desktop)
    BROWSER_NAME="Zen"
    BROWSER_SUPPORT="incompatible"
    ;;
  librewolf.desktop)
    BROWSER_NAME="LibreWolf"
    BROWSER_SUPPORT="incompatible"
    ;;
  "")
    BROWSER_NAME="unknown browser"
    BROWSER_SUPPORT="unknown"
    ;;
  *)
    BROWSER_NAME="${BROWSER_DESKTOP%.desktop}"
    ;;
  esac
}

browser_running() {
  [[ -n ${BROWSER_PROCESS:-} ]] || return 1
  pgrep -x -- "$BROWSER_PROCESS" >/dev/null 2>&1
}

split_extension_list() {
  local list="$1"
  local item
  EXTENSION_LIST=()
  # Drop quoting around the whole list or its individual entries. Extension
  # paths cannot contain the flag's comma separator, so this is unambiguous.
  list="${list//\"/}"
  list="${list//\'/}"
  local IFS=','
  for item in $list; do
    item="$(trim "$item")"
    [[ -n $item ]] && EXTENSION_LIST+=("$item")
  done
}

join_extension_list() {
  local item
  local out=""
  for item in "$@"; do
    [[ -n $out ]] && out+=","
    out+="$item"
  done
  printf '%s' "$out"
}

extension_in_flags() {
  local flags_file="$1"
  local extension="$2"
  local line trimmed value item

  [[ -f $flags_file ]] || return 1

  while IFS= read -r line || [[ -n $line ]]; do
    trimmed="$(trim "$line")"
    case "$trimmed" in
    --load-extension=*) value="${trimmed#--load-extension=}" ;;
    --load-extension[[:space:]]*) value="${trimmed#--load-extension}" ;;
    --load-extension) value="" ;;
    *) continue ;;
    esac
    split_extension_list "$value"
    for item in "${EXTENSION_LIST[@]}"; do
      [[ ${item%/} == "${extension%/}" ]] && return 0
    done
  done <"$flags_file"

  return 1
}

add_extension_to_flags() {
  local flags_file="$1"
  local extension="$2"
  local line trimmed value item
  local output=()
  local values=()
  local -A seen=()

  if [[ ! -e $flags_file ]]; then
    mkdir -p -- "$(dirname -- "$flags_file")"
    printf '%s\n' "--load-extension=$extension" >"$flags_file"
    return 0
  fi

  while IFS= read -r line || [[ -n $line ]]; do
    trimmed="$(trim "$line")"
    case "$trimmed" in
    --load-extension=*) value="${trimmed#--load-extension=}" ;;
    --load-extension[[:space:]]*) value="${trimmed#--load-extension}" ;;
    --load-extension) value="" ;;
    *)
      output+=("$line")
      continue
      ;;
    esac

    split_extension_list "$value"
    for item in "${EXTENSION_LIST[@]}"; do
      [[ ${item%/} == "${extension%/}" ]] && continue
      if [[ -z ${seen[$item]+x} ]]; then
        values+=("$item")
        seen[$item]=1
      fi
    done
  done <"$flags_file"

  if [[ -z ${seen[$extension]+x} ]]; then
    values+=("$extension")
  fi

  output+=("--load-extension=$(join_extension_list "${values[@]}")")

  cp -p -- "$flags_file" "$flags_file.bak.$(date +%s)"
  printf '%s\n' "${output[@]}" >"$flags_file"
  return 0
}

remove_extension_from_flags() {
  local flags_file="$1"
  local extension="$2"
  local line trimmed value item
  local output=()
  local filtered=()
  local has_ours found=0

  [[ -f $flags_file ]] || return 1

  while IFS= read -r line || [[ -n $line ]]; do
    trimmed="$(trim "$line")"
    case "$trimmed" in
    --load-extension=*) value="${trimmed#--load-extension=}" ;;
    --load-extension[[:space:]]*) value="${trimmed#--load-extension}" ;;
    --load-extension) value="" ;;
    *)
      output+=("$line")
      continue
      ;;
    esac

    has_ours=0
    filtered=()
    split_extension_list "$value"
    for item in "${EXTENSION_LIST[@]}"; do
      if [[ ${item%/} == "${extension%/}" ]]; then
        has_ours=1
        found=1
      else
        filtered+=("$item")
      fi
    done

    if ((!has_ours)); then
      output+=("$line")
    elif ((${#filtered[@]})); then
      output+=("--load-extension=$(join_extension_list "${filtered[@]}")")
    fi
  done <"$flags_file"

  ((found)) || return 1

  cp -p -- "$flags_file" "$flags_file.bak.$(date +%s)"
  if ((${#output[@]})); then
    printf '%s\n' "${output[@]}" >"$flags_file"
  else
    : >"$flags_file"
  fi
  return 0
}
