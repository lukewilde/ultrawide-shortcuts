// keybinding-conflicts.js — Take over GNOME built-in shortcuts that collide
// with our directional-nav accelerators, and restore them later.
import Gio from 'gi://Gio';

const KNOWN = [
  {
    schema: 'org.gnome.desktop.wm.keybindings',
    keys: ['maximize', 'unmaximize', 'toggle-maximized',
      'maximize-horizontally', 'maximize-vertically',
      'switch-to-workspace-left', 'switch-to-workspace-right',
      'switch-to-workspace-up', 'switch-to-workspace-down',
      'move-to-workspace-left', 'move-to-workspace-right',
      'move-to-workspace-up', 'move-to-workspace-down',
      'move-to-monitor-left', 'move-to-monitor-right',
      'move-to-monitor-up', 'move-to-monitor-down'],
  },
  {
    schema: 'org.gnome.mutter.keybindings',
    keys: ['toggle-tiled-left', 'toggle-tiled-right'],
  },
];

// Normalize an accel to sorted-mods + key so modifier order doesn't matter.
// No Gtk dependency (unavailable in the shell process).
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

// Merge fresh takeover records into an existing backup. Old records win — an
// earlier-captured original must never be replaced by an already-stripped value.
export function mergeBackupRecords(existing, fresh) {
  const merged = new Map(existing.map(r => [`${r.schema}/${r.key}`, r]));
  for (const r of fresh) {
    const id = `${r.schema}/${r.key}`;
    if (!merged.has(id)) merged.set(id, r);
  }
  return [...merged.values()];
}

export class KeybindingConflictManager {
  constructor(extensionSettings) {
    this._extSettings = extensionSettings;
    this._records = []; // [{ schema, key, original: string[] }]
  }

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
    // Merge with any on-disk backup — it may hold originals from a run whose
    // restore never happened.
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
