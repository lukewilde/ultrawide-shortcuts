#!/usr/bin/env bash
set -euo pipefail

EXT="gnome-magic-window@adrienverge"

case "${1:-help}" in
  reload)
    echo ":: Disabling $EXT..."
    gnome-extensions disable "$EXT" 2>/dev/null || true
    echo ":: Enabling $EXT..."
    gnome-extensions enable "$EXT"
    echo ":: Reloaded."
    ;;
  logs)
    echo ":: Tailing GNOME Shell logs (Ctrl+C to stop)..."
    journalctl -f /usr/bin/gnome-shell -o cat
    ;;
  nested)
    echo ":: Starting nested GNOME Shell session..."
    echo ":: (Close the window or Alt+F4 to exit)"
    dbus-run-session -- gnome-shell --nested --wayland
    ;;
  debug)
    echo ":: Extension state:"
    gnome-extensions info "$EXT"
    echo ""
    echo ":: Last debug output:"
    cat /tmp/gnome-window-debug 2>/dev/null || echo "(no debug output yet)"
    ;;
  pack)
    mkdir -p dist
    gnome-extensions pack . --out-dir=dist --force
    echo ":: Packed to dist/$EXT.shell-extension.zip"
    ;;
  help|*)
    echo "Usage: ./dev.sh <command>"
    echo ""
    echo "Commands:"
    echo "  reload  - Disable and re-enable the extension (picks up code changes)"
    echo "  logs    - Tail GNOME Shell journal logs"
    echo "  nested  - Launch a nested GNOME Shell for safe testing"
    echo "  debug   - Show extension info and last debug output"
    echo "  pack    - Package extension as .zip for distribution"
    ;;
esac
