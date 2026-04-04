import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class WindowSummonerPreferences extends ExtensionPreferences {
  fillPreferencesWindow(window) {
    this._settings = this.getSettings();
    this._window = window;
    window.set_default_size(700, 600);

    const page = new Adw.PreferencesPage({
      title: 'App Summons',
      icon_name: 'input-keyboard-symbolic',
    });
    window.add(page);

    this._bindingsGroup = new Adw.PreferencesGroup({
      title: 'App Summons',
      description: 'Each summon maps a keyboard shortcut to an application.',
    });
    page.add(this._bindingsGroup);

    this._loadBindings();

    // Add binding button
    const addButton = new Gtk.Button({
      label: 'Add App Summon',
      css_classes: ['suggested-action'],
      halign: Gtk.Align.CENTER,
      margin_top: 12,
    });
    addButton.connect('clicked', () => this._addBinding());
    this._bindingsGroup.add(addButton);

    this._settingsChangedId = this._settings.connect('changed::bindings', () => {
      // Only reload if change came from outside (dconf CLI, etc.)
      if (!this._writing) this._loadBindings();
    });

    window.connect('close-request', () => {
      if (this._settingsChangedId) {
        this._settings.disconnect(this._settingsChangedId);
        this._settingsChangedId = null;
      }
    });

    // --- Window Positions page ---
    this._wardsPage = new Adw.PreferencesPage({
      title: 'Window Positions',
      icon_name: 'view-grid-symbolic',
    });
    window.add(this._wardsPage);

    const wardsDescGroup = new Adw.PreferencesGroup({
      description: 'Each window position defines a grid layout with keyboard shortcuts that snap windows into position.',
    });
    this._wardsPage.add(wardsDescGroup);

    // Add Window Position button — stored so _loadWards can keep it last
    this._addWardGroup = new Adw.PreferencesGroup();
    const addWardButton = new Gtk.Button({
      label: 'Add Window Position',
      css_classes: ['suggested-action'],
      halign: Gtk.Align.CENTER,
      margin_top: 12,
    });
    addWardButton.connect('clicked', () => this._addWard());
    this._addWardGroup.add(addWardButton);

    this._restoreDefaultsGroup = new Adw.PreferencesGroup();
    const restoreButton = new Gtk.Button({
      label: 'Restore Default Window Positions',
      halign: Gtk.Align.CENTER,
      margin_top: 4,
      margin_bottom: 8,
    });
    restoreButton.connect('clicked', () => this._settings.reset('wards'));
    this._restoreDefaultsGroup.add(restoreButton);

    this._loadWards();

    this._wardsChangedId = this._settings.connect('changed::wards', () => {
      if (!this._writingWards) this._loadWards();
    });

    window.connect('close-request', () => {
      if (this._wardsChangedId) {
        this._settings.disconnect(this._wardsChangedId);
        this._wardsChangedId = null;
      }
    });
  }

  _getBindings() {
    try {
      return JSON.parse(this._settings.get_string('bindings'));
    } catch {
      return [];
    }
  }

  _saveBindings(bindings) {
    this._writing = true;
    this._settings.set_string('bindings', JSON.stringify(bindings));
    this._writing = false;
  }

  _loadBindings() {
    const expandedStates = this._bindingRows
      ? this._bindingRows.map(r => r.get_expanded())
      : [];

    if (this._bindingRows) {
      this._bindingRows.forEach(r => this._bindingsGroup.remove(r));
    }
    this._bindingRows = [];

    const bindings = this._getBindings();
    bindings.forEach((binding, index) => {
      const row = this._createBindingRow(binding, index);
      if (expandedStates[index]) row.set_expanded(true);
      this._bindingsGroup.add(row);
      this._bindingRows.push(row);
    });
  }

  _createBindingRow(binding, index) {
    const row = new Adw.ExpanderRow({
      title: binding.wmClass || '(empty)',
      subtitle: binding.shortcut || 'No shortcut',
    });

    // Shortcut field
    const shortcutRow = new Adw.EntryRow({ title: 'Shortcut' });
    shortcutRow.set_text(binding.shortcut || '');
    shortcutRow.connect('changed', () => {
      this._updateBinding(index, 'shortcut', shortcutRow.get_text());
      row.set_subtitle(shortcutRow.get_text() || 'No shortcut');
    });
    row.add_row(shortcutRow);

    // WM Class field + detect button
    const wmClassRow = new Adw.EntryRow({ title: 'Application' });
    wmClassRow.set_text(binding.wmClass || '');
    wmClassRow.connect('changed', () => {
      this._updateBinding(index, 'wmClass', wmClassRow.get_text());
      row.set_title(wmClassRow.get_text() || '(empty)');
    });

    const detectButton = new Gtk.Button({
      icon_name: 'find-location-symbolic',
      valign: Gtk.Align.CENTER,
      tooltip_text: 'Detect from running windows',
      css_classes: ['flat'],
    });
    detectButton.connect('clicked', () => {
      this._showWindowPicker(wmClassRow);
    });
    wmClassRow.add_suffix(detectButton);
    row.add_row(wmClassRow);

    // Command field
    const commandRow = new Adw.EntryRow({ title: 'Launch Command' });
    commandRow.set_text(binding.command || '');
    commandRow.connect('changed', () => {
      this._updateBinding(index, 'command', commandRow.get_text());
    });
    row.add_row(commandRow);

    // Delete button
    const deleteRow = new Adw.ActionRow();
    const deleteButton = new Gtk.Button({
      label: 'Remove Summon',
      css_classes: ['destructive-action'],
      halign: Gtk.Align.CENTER,
      margin_top: 6,
      margin_bottom: 6,
    });
    deleteButton.connect('clicked', () => {
      const bindings = this._getBindings();
      bindings.splice(index, 1);
      this._saveBindings(bindings);
      this._loadBindings();
    });
    deleteRow.set_child(deleteButton);
    row.add_row(deleteRow);

    return row;
  }

  _updateBinding(index, field, value) {
    const bindings = this._getBindings();
    if (index < bindings.length) {
      bindings[index][field] = value;
      this._saveBindings(bindings);
    }
  }

  _addBinding() {
    const bindings = this._getBindings();
    bindings.push({
      shortcut: '',
      wmClass: '',
      command: '',
    });
    this._saveBindings(bindings);
    this._loadBindings();
  }

  _showWindowPicker(targetEntry) {
    try {
      const connection = Gio.DBus.session;
      const result = connection.call_sync(
        'org.gnome.Shell',
        '/org/gnome/Shell/Extensions/WindowSummoner',
        'org.gnome.Shell.Extensions.WindowSummoner',
        'list_windows',
        null,
        new GLib.VariantType('(s)'),
        Gio.DBusCallFlags.NONE,
        -1,
        null
      );

      const json = result.get_child_value(0).get_string()[0];
      const windows = JSON.parse(json);

      // Deduplicate by wmClass
      const unique = [...new Map(windows.map(w => [w.wmClass, w])).values()];

      if (unique.length === 0) {
        this._showMessage('No windows detected');
        return;
      }

      // Show a dialog with window list
      const dialog = new Adw.AlertDialog({
        heading: 'Select Window',
        body: 'Choose a running application:',
      });

      // Add each WM class as a response
      unique.forEach((w, i) => {
        dialog.add_response(`win-${i}`, `${w.wmClass}  —  ${w.windowTitle}`);
      });
      dialog.add_response('cancel', 'Cancel');
      dialog.set_default_response('cancel');
      dialog.set_close_response('cancel');

      dialog.connect('response', (_dialog, response) => {
        if (response.startsWith('win-')) {
          const idx = parseInt(response.split('-')[1]);
          targetEntry.set_text(unique[idx].wmClass);
        }
      });

      dialog.present(this._window);
    } catch (e) {
      console.error(`window-summoner: window detection failed: ${e.message}`);
      this._showMessage('Failed to detect windows. Is the extension running?');
    }
  }

  _showMessage(text) {
    const dialog = new Adw.AlertDialog({
      heading: 'Info',
      body: text,
    });
    dialog.add_response('ok', 'OK');
    dialog.present(this._window);
  }

  // --- Wards helpers ---

  _getWards() {
    try {
      return JSON.parse(this._settings.get_string('wards')) || [];
    } catch {
      return [];
    }
  }

  _saveWards(wards) {
    this._writingWards = true;
    this._settings.set_string('wards', JSON.stringify(wards));
    this._writingWards = false;
  }

  _wardSubtitle(ward) {
    return `${ward.cols}×${ward.rows}  ·  edge ${ward.edgeMargin}px  ·  gap ${ward.cellGap}px`;
  }

  _positionSummary(ward, positions) {
    if (positions.length === 0) return 'No positions';
    return positions.map(pos => {
      const c1 = Math.min(pos.anchor.col, pos.target.col);
      const c2 = Math.max(pos.anchor.col, pos.target.col);
      const r1 = Math.min(pos.anchor.row, pos.target.row);
      const r2 = Math.max(pos.anchor.row, pos.target.row);
      const colPart = c1 === c2 ? `c${c1}` : `c${c1}–${c2}`;
      if (ward.rows === 1) return colPart;
      const rowPart = r1 === r2 ? `r${r1}` : `r${r1}–${r2}`;
      return `${colPart} ${rowPart}`;
    }).join(' · ');
  }

  _makePairRow(title, s1, s2) {
    const row = new Adw.ActionRow({ title });

    const makeSpin = ({ label, value, min, max, onChanged }) => {
      const box = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        valign: Gtk.Align.CENTER,
        spacing: 2,
        margin_start: 8,
      });
      box.append(new Gtk.Label({
        label,
        css_classes: ['caption'],
        halign: Gtk.Align.CENTER,
      }));
      const spin = new Gtk.SpinButton({
        adjustment: new Gtk.Adjustment({
          lower: min,
          upper: max,
          step_increment: 1,
          page_increment: 10,
        }),
        numeric: true,
        width_chars: 4,
        valign: Gtk.Align.CENTER,
      });
      spin.set_value(value);
      spin.connect('value-changed', () => onChanged(spin.get_value_as_int()));
      box.append(spin);
      return box;
    };

    row.add_suffix(makeSpin(s1));
    row.add_suffix(makeSpin(s2));
    return row;
  }

  _positionsToText(positions) {
    return positions
      .map(p => `${p.anchor.col}:${p.anchor.row} ${p.target.col}:${p.target.row}`)
      .join(', ');
  }

  _textToPositions(text) {
    const results = text.split(',').map(part => {
      const tokens = part.trim().split(/\s+/);
      if (tokens.length < 2) return null;
      const [c1, r1] = tokens[0].split(':').map(Number);
      const [c2, r2] = tokens[1].split(':').map(Number);
      if ([c1, r1, c2, r2].some(n => isNaN(n) || n < 1)) return null;
      return { anchor: { col: c1, row: r1 }, target: { col: c2, row: r2 } };
    });
    return results.includes(null) ? [] : results;
  }

  _updateWard(wardIndex, field, value) {
    const wards = this._getWards();
    if (wardIndex < wards.length) {
      wards[wardIndex][field] = value;
      this._saveWards(wards);
    }
  }

  _updateShortcut(wardIndex, shortcutIndex, field, value) {
    const wards = this._getWards();
    if (wardIndex < wards.length && shortcutIndex < wards[wardIndex].shortcuts.length) {
      wards[wardIndex].shortcuts[shortcutIndex][field] = value;
      this._saveWards(wards);
    }
  }

  _addWard() {
    const wards = this._getWards();
    wards.push({ name: 'New Ward', cols: 6, rows: 4, edgeMargin: 0, cellGap: 0, shortcuts: [] });
    this._saveWards(wards);
    this._loadWards();
  }

  _addShortcut(wardIndex) {
    const wards = this._getWards();
    if (wardIndex < wards.length) {
      wards[wardIndex].shortcuts.push({ shortcut: '', positions: [] });
      this._saveWards(wards);
      this._loadWards();
    }
  }

  _getWardsScrollAdj() {
    let child = this._wardsPage.get_first_child();
    while (child && !(child instanceof Gtk.ScrolledWindow)) {
      child = child.get_first_child();
    }
    return child?.get_vadjustment() ?? null;
  }

  _loadWards() {
    const wardStates = this._wardGroups
      ? this._wardGroups.map(g => ({
          shortcutStates: (g._shortcutRows || []).map(r => r.get_expanded()),
        }))
      : [];

    const adj = this._getWardsScrollAdj();
    const scrollPos = adj?.get_value() ?? 0;

    if (this._wardGroups) {
      this._wardGroups.forEach(g => this._wardsPage.remove(g));
    }
    this._wardsPage.remove(this._addWardGroup);
    this._wardsPage.remove(this._restoreDefaultsGroup);
    this._wardGroups = [];

    const wards = this._getWards();
    wards.forEach((ward, index) => {
      const group = this._createWardGroup(ward, index);
      const state = wardStates[index];
      (group._shortcutRows || []).forEach((sr, si) => {
        if (state?.shortcutStates[si]) sr.set_expanded(true);
      });
      this._wardsPage.add(group);
      this._wardGroups.push(group);
    });

    this._wardsPage.add(this._addWardGroup);
    this._wardsPage.add(this._restoreDefaultsGroup);

    if (adj && scrollPos > 0) {
      GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
        adj.set_value(scrollPos);
        return GLib.SOURCE_REMOVE;
      });
    }
  }

  _createWardGroup(ward, wardIndex) {
    const group = new Adw.PreferencesGroup({
      title: ward.name || '(unnamed)',
      description: this._wardSubtitle(ward),
    });

    const deleteBtn = new Gtk.Button({
      label: 'Delete',
      css_classes: ['destructive-action'],
      valign: Gtk.Align.CENTER,
    });
    deleteBtn.connect('clicked', () => {
      const wards = this._getWards();
      wards.splice(wardIndex, 1);
      this._saveWards(wards);
      this._loadWards();
    });
    group.set_header_suffix(deleteBtn);

    const gridHeader = new Adw.ActionRow({ title: 'Grid Settings' });
    gridHeader.set_activatable(false);
    group.add(gridHeader);

    const nameRow = new Adw.EntryRow({ title: 'Name' });
    nameRow.set_text(ward.name || '');
    nameRow.connect('changed', () => {
      this._updateWard(wardIndex, 'name', nameRow.get_text());
      group.set_title(nameRow.get_text() || '(unnamed)');
    });
    group.add(nameRow);

    group.add(this._makePairRow('Grid size',
      {
        label: 'Cols', value: ward.cols, min: 1, max: 100,
        onChanged: v => {
          this._updateWard(wardIndex, 'cols', v);
          group.set_description(this._wardSubtitle(this._getWards()[wardIndex]));
        },
      },
      {
        label: 'Rows', value: ward.rows, min: 1, max: 100,
        onChanged: v => {
          this._updateWard(wardIndex, 'rows', v);
          group.set_description(this._wardSubtitle(this._getWards()[wardIndex]));
        },
      }
    ));

    group.add(this._makePairRow('Margins',
      {
        label: 'Edge (px)', value: ward.edgeMargin, min: 0, max: 500,
        onChanged: v => {
          this._updateWard(wardIndex, 'edgeMargin', v);
          group.set_description(this._wardSubtitle(this._getWards()[wardIndex]));
        },
      },
      {
        label: 'Gap (px)', value: ward.cellGap, min: 0, max: 500,
        onChanged: v => {
          this._updateWard(wardIndex, 'cellGap', v);
          group.set_description(this._wardSubtitle(this._getWards()[wardIndex]));
        },
      }
    ));

    const shortcutsHeader = new Adw.ActionRow({ title: 'Shortcuts' });
    shortcutsHeader.set_activatable(false);
    group.add(shortcutsHeader);

    group._shortcutRows = [];
    ward.shortcuts.forEach((shortcutConfig, shortcutIndex) => {
      const sr = this._createShortcutRow(wardIndex, ward, shortcutConfig, shortcutIndex);
      group._shortcutRows.push(sr);
      group.add(sr);
    });

    const addShortcutRow = new Adw.ActionRow();
    const addShortcutBtn = new Gtk.Button({
      label: '+ Add Shortcut',
      css_classes: ['flat'],
      halign: Gtk.Align.START,
      margin_top: 6,
      margin_bottom: 6,
    });
    addShortcutBtn.connect('clicked', () => this._addShortcut(wardIndex));
    addShortcutRow.set_child(addShortcutBtn);
    group.add(addShortcutRow);

    return group;
  }

  _createShortcutRow(wardIndex, ward, shortcutConfig, shortcutIndex) {
    const row = new Adw.ExpanderRow({
      title: shortcutConfig.shortcut || '(no shortcut)',
      subtitle: this._positionSummary(ward, shortcutConfig.positions),
    });

    const shortcutEntry = new Adw.EntryRow({ title: 'Shortcut' });
    shortcutEntry.set_text(shortcutConfig.shortcut || '');
    shortcutEntry.connect('changed', () => {
      this._updateShortcut(wardIndex, shortcutIndex, 'shortcut', shortcutEntry.get_text());
      row.set_title(shortcutEntry.get_text() || '(no shortcut)');
    });
    row.add_row(shortcutEntry);

    const posEntry = new Adw.EntryRow({ title: 'Positions (col:row col:row, …)' });
    posEntry.set_text(this._positionsToText(shortcutConfig.positions));
    posEntry.connect('changed', () => {
      const text = posEntry.get_text().trim();
      if (text === '') {
        posEntry.remove_css_class('error');
        this._updateShortcut(wardIndex, shortcutIndex, 'positions', []);
        row.set_subtitle(this._positionSummary(ward, []));
        return;
      }
      const positions = this._textToPositions(text);
      if (positions.length > 0) {
        posEntry.remove_css_class('error');
        this._updateShortcut(wardIndex, shortcutIndex, 'positions', positions);
        row.set_subtitle(this._positionSummary(ward, positions));
      } else {
        posEntry.add_css_class('error');
      }
    });
    row.add_row(posEntry);

    const removeRow = new Adw.ActionRow();
    const removeBtn = new Gtk.Button({
      label: 'Remove Shortcut',
      css_classes: ['destructive-action'],
      halign: Gtk.Align.CENTER,
      margin_top: 4,
      margin_bottom: 4,
    });
    removeBtn.connect('clicked', () => {
      const wards = this._getWards();
      wards[wardIndex].shortcuts.splice(shortcutIndex, 1);
      this._saveWards(wards);
      this._loadWards();
    });
    removeRow.set_child(removeBtn);
    row.add_row(removeRow);

    return row;
  }

}
