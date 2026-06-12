// keybinding-conflicts.js — Take over GNOME built-in window shortcuts that
// collide with our directional-nav accelerators, and restore them later.
import Gio from 'gi://Gio';

// GNOME built-in window keybindings that may collide with <prefix>+arrows.
const KNOWN = [
  {
    schema: 'org.gnome.desktop.wm.keybindings',
    keys: ['maximize', 'unmaximize', 'toggle-maximized',
      'maximize-horizontally', 'maximize-vertically',
      'switch-to-workspace-left', 'switch-to-workspace-right',
      'move-to-workspace-left', 'move-to-workspace-right',
      'move-to-monitor-left', 'move-to-monitor-right'],
  },
  {
    schema: 'org.gnome.mutter.keybindings',
    keys: ['toggle-tiled-left', 'toggle-tiled-right'],
  },
];

/**
 * Normalize an accelerator string to a comparable form: sorted lowercase
 * modifier set + lowercase key name. `<Alt><Super>Left` and `<Super><Alt>Left`
 * compare equal. Pure — no Gtk dependency (unavailable in the shell process).
 * @param {string} accel
 * @returns {string}
 */
export function normalizeAccel(accel) {
  if (!accel) return '|';
  const mods = [];
  const re = /<([^>]+)>/g;
  let m;
  while ((m = re.exec(accel)) !== null) mods.push(m[1].toLowerCase());
  const key = accel.replace(/<[^>]+>/g, '').toLowerCase();
  mods.sort();
  return `${mods.join('+')}|${key}`;
}

/**
 * Merge freshly recorded takeover records into an existing backup.
 * Old records win: an original captured earlier must never be replaced by a
 * later (possibly already-stripped) value, and records for keys we did not
 * touch this run are kept so restore() can still return them. Pure.
 * @param {Array<{schema: string, key: string, original: string[]}>} existing
 * @param {Array<{schema: string, key: string, original: string[]}>} fresh
 * @returns {Array<{schema: string, key: string, original: string[]}>}
 */
export function mergeBackupRecords(existing, fresh) {
  const merged = new Map(existing.map(r => [`${r.schema}/${r.key}`, r]));
  for (const r of fresh) {
    const id = `${r.schema}/${r.key}`;
    if (!merged.has(id)) merged.set(id, r);
  }
  return [...merged.values()];
}

export class KeybindingConflictManager {
  /** @param {Gio.Settings} extensionSettings - our settings (holds the backup key) */
  constructor(extensionSettings) {
    this._extSettings = extensionSettings;
    this._records = []; // [{ schema, key, original: string[] }]
  }

  // Parse the persisted backup, tolerating an absent or corrupt value.
  _readBackup() {
    let records = [];
    try {
      records = JSON.parse(this._extSettings.get_string('nav-keybinding-backup'));
    } catch {
      records = [];
    }
    return Array.isArray(records) ? records : [];
  }

  // Restore a backup left by an unclean shutdown, then clear it. Idempotent.
  healStaleBackup() {
    const stale = this._readBackup();
    if (stale.length === 0) return;
    for (const { schema, key, original } of stale) {
      try {
        new Gio.Settings({ schema_id: schema }).set_strv(key, original);
      } catch (e) {
        console.error(`ultrawide-shortcuts: heal restore failed ${schema}/${key}: ${e.message}`);
      }
    }
    this._extSettings.set_string('nav-keybinding-backup', '[]');
  }

  // Remove any of `accels` from known GNOME keybindings, recording originals.
  takeOver(accels) {
    // Merge into any backup already on disk rather than overwriting it: if a
    // key was stripped in an earlier run whose restore never happened, its
    // original lives only in that backup and must survive this run.
    const existing = this._readBackup();

    const fresh = [];
    const wanted = new Set(accels.map(normalizeAccel));
    for (const { schema, keys } of KNOWN) {
      let settings;
      try {
        settings = new Gio.Settings({ schema_id: schema });
      } catch {
        continue; // schema not installed on this system
      }
      for (const key of keys) {
        const current = settings.get_strv(key);
        const filtered = current.filter(a => !wanted.has(normalizeAccel(a)));
        if (filtered.length !== current.length) {
          fresh.push({ schema, key, original: current });
          settings.set_strv(key, filtered);
        }
      }
    }
    this._records = mergeBackupRecords(existing, fresh);
    this._extSettings.set_string('nav-keybinding-backup', JSON.stringify(this._records));
  }

  // Restore everything taken over and clear the backup.
  restore() {
    for (const { schema, key, original } of this._records) {
      try {
        new Gio.Settings({ schema_id: schema }).set_strv(key, original);
      } catch (e) {
        console.error(`ultrawide-shortcuts: restore failed ${schema}/${key}: ${e.message}`);
      }
    }
    this._records = [];
    this._extSettings.set_string('nav-keybinding-backup', '[]');
  }
}
