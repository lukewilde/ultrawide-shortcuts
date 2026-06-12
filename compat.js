// compat.js — Shims for Mutter/GNOME API changes across supported shell
// versions (metadata declares 45–49).

import Meta from 'gi://Meta';

// Mutter 46 made Meta.Window.unmaximize() flagless; on 45 it required a
// MetaMaximizeFlags argument and throws without one. Detect by the
// introspected arity so we don't have to swallow unrelated errors in a
// try/catch.
const _UNMAXIMIZE_NEEDS_FLAGS = Meta.Window.prototype.unmaximize.length > 0;

// Unmaximize a window across both signatures. Callers that may run on an
// already-unmaximized window should still guard with their own try/catch.
export function unmaximizeWindow(win) {
  if (_UNMAXIMIZE_NEEDS_FLAGS) {
    win.unmaximize(Meta.MaximizeFlags.BOTH);
  } else {
    win.unmaximize();
  }
}
