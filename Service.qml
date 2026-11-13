import QtQuick
import Quickshell
import Quickshell.Io

// Installs and maintains the browser extension that provides the new tab page.
// Theme files are watched so an open new tab picks up a new theme on its own.
Item {
  id: root

  // Injected by omarchy-shell.
  property var shell: null
  property var manifest: null

  readonly property string home: Quickshell.env("HOME")
  readonly property string pluginDir: {
    var url = String(Qt.resolvedUrl("."))
    if (url.indexOf("file://") === 0) url = url.substring(7)
    try {
      url = decodeURIComponent(url)
    } catch (e) {
      // Leave the URL as-is if it contains malformed escapes.
    }
    return url.replace(/\/+$/, "")
  }
  readonly property string currentThemeDir: home + "/.local/state/omarchy/current"

  property bool syncQueued: false

  Component.onCompleted: root.install()

  function install() {
    if (!installProcess.running) installProcess.running = true
  }

  function scheduleSync() {
    syncDebounce.restart()
  }

  function sync() {
    if (syncProcess.running) {
      syncQueued = true
      return
    }
    syncProcess.running = true
  }

  Process {
    id: installProcess
    command: ["bash", root.pluginDir + "/scripts/install"]
    onExited: root.sync()
  }

  Process {
    id: syncProcess
    command: ["bash", root.pluginDir + "/scripts/sync-theme"]
    onExited: {
      if (root.syncQueued) {
        root.syncQueued = false
        syncProcess.running = true
      }
    }
  }

  Timer {
    id: syncDebounce
    interval: 400
    repeat: false
    onTriggered: root.sync()
  }

  // Fallback for wallpaper-only changes where the symlink is replaced rather
  // than modified in place. sync-theme is fingerprint-guarded, so this is
  // cheap when nothing changed.
  Timer {
    interval: 60000
    running: true
    repeat: true
    onTriggered: root.sync()
  }

  FileView {
    path: root.currentThemeDir + "/theme.name"
    watchChanges: true
    printErrors: false
    onFileChanged: root.scheduleSync()
  }

  FileView {
    path: root.currentThemeDir + "/theme/colors.toml"
    watchChanges: true
    printErrors: false
    onFileChanged: root.scheduleSync()
  }

  FileView {
    path: root.currentThemeDir + "/background"
    watchChanges: true
    printErrors: false
    onFileChanged: root.scheduleSync()
  }
}
