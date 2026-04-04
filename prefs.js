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
      title: 'Summons',
      icon_name: 'input-keyboard-symbolic',
    });
    window.add(page);

    this._bindingsGroup = new Adw.PreferencesGroup({
      title: 'Summons',
      description: 'Each summon maps a keyboard shortcut to an application.',
    });
    page.add(this._bindingsGroup);

    this._loadBindings();

    // Add binding button
    const addButton = new Gtk.Button({
      label: 'Add Summon',
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

    // --- Wards page ---
    const wardsPage = new Adw.PreferencesPage({
      title: 'Wards',
      icon_name: 'view-grid-symbolic',
    });
    window.add(wardsPage);

    this._wardsGroup = new Adw.PreferencesGroup({
      title: 'Wards',
      description: 'Each ward defines a grid layout with keyboard shortcuts that snap windows into position.',
    });
    wardsPage.add(this._wardsGroup);

    this._loadWards();

    // Add Ward button in separate group (prevents inversion on reload)
    const addWardGroup = new Adw.PreferencesGroup();
    const addWardButton = new Gtk.Button({
      label: 'Add Ward',
      css_classes: ['suggested-action'],
      halign: Gtk.Align.CENTER,
      margin_top: 12,
    });
    addWardButton.connect('clicked', () => this._addWard());
    addWardGroup.add(addWardButton);
    wardsPage.add(addWardGroup);

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
    // Remove all existing rows (except the add button)
    let child = this._bindingsGroup.get_first_child();
    const toRemove = [];
    while (child) {
      if (child instanceof Adw.ExpanderRow) toRemove.push(child);
      child = child.get_next_sibling();
    }
    toRemove.forEach(r => this._bindingsGroup.remove(r));

    const bindings = this._getBindings();
    bindings.forEach((binding, index) => {
      this._bindingsGroup.add(this._createBindingRow(binding, index));
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
    const wmClassRow = new Adw.EntryRow({ title: 'WM Class' });
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
          value,
          lower: min,
          upper: max,
          step_increment: 1,
          page_increment: 10,
        }),
        numeric: true,
        width_chars: 4,
        valign: Gtk.Align.CENTER,
      });
      spin.connect('value-changed', () => onChanged(spin.get_value_as_int()));
      box.append(spin);
      return box;
    };

    row.add_suffix(makeSpin(s1));
    row.add_suffix(makeSpin(s2));
    return row;
  }

  _positionLabel(position) {
    const c1 = Math.min(position.anchor.col, position.target.col);
    const c2 = Math.max(position.anchor.col, position.target.col);
    const r1 = Math.min(position.anchor.row, position.target.row);
    const r2 = Math.max(position.anchor.row, position.target.row);
    const colStr = c1 === c2 ? `col ${c1}` : `cols ${c1}–${c2}`;
    const rowStr = r1 === r2 ? `row ${r1}` : `rows ${r1}–${r2}`;
    return `${colStr}, ${rowStr}`;
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

  _loadWards() {
    let child = this._wardsGroup.get_first_child();
    const toRemove = [];
    while (child) {
      if (child instanceof Adw.ExpanderRow) toRemove.push(child);
      child = child.get_next_sibling();
    }
    toRemove.forEach(r => this._wardsGroup.remove(r));

    const wards = this._getWards();
    wards.forEach((ward, index) => {
      this._wardsGroup.add(this._createWardCard(ward, index));
    });
  }

  _createWardCard(ward, wardIndex) {
    const card = new Adw.ExpanderRow({
      title: ward.name || '(unnamed)',
      subtitle: this._wardSubtitle(ward),
    });

    const nameRow = new Adw.EntryRow({ title: 'Name' });
    nameRow.set_text(ward.name || '');
    nameRow.connect('changed', () => {
      this._updateWard(wardIndex, 'name', nameRow.get_text());
      card.set_title(nameRow.get_text() || '(unnamed)');
    });
    card.add_row(nameRow);

    card.add_row(this._makePairRow('Grid size',
      {
        label: 'Cols', value: ward.cols, min: 1, max: 100,
        onChanged: v => {
          this._updateWard(wardIndex, 'cols', v);
          card.set_subtitle(this._wardSubtitle(this._getWards()[wardIndex]));
        },
      },
      {
        label: 'Rows', value: ward.rows, min: 1, max: 100,
        onChanged: v => {
          this._updateWard(wardIndex, 'rows', v);
          card.set_subtitle(this._wardSubtitle(this._getWards()[wardIndex]));
        },
      }
    ));

    card.add_row(this._makePairRow('Margins',
      {
        label: 'Edge (px)', value: ward.edgeMargin, min: 0, max: 500,
        onChanged: v => {
          this._updateWard(wardIndex, 'edgeMargin', v);
          card.set_subtitle(this._wardSubtitle(this._getWards()[wardIndex]));
        },
      },
      {
        label: 'Gap (px)', value: ward.cellGap, min: 0, max: 500,
        onChanged: v => {
          this._updateWard(wardIndex, 'cellGap', v);
          card.set_subtitle(this._wardSubtitle(this._getWards()[wardIndex]));
        },
      }
    ));

    ward.shortcuts.forEach((shortcutConfig, shortcutIndex) => {
      card.add_row(this._createShortcutRow(wardIndex, ward, shortcutConfig, shortcutIndex));
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
    card.add_row(addShortcutRow);

    const deleteRow = new Adw.ActionRow();
    const deleteBtn = new Gtk.Button({
      label: 'Delete Ward',
      css_classes: ['destructive-action'],
      halign: Gtk.Align.CENTER,
      margin_top: 6,
      margin_bottom: 6,
    });
    deleteBtn.connect('clicked', () => {
      const wards = this._getWards();
      wards.splice(wardIndex, 1);
      this._saveWards(wards);
      this._loadWards();
    });
    deleteRow.set_child(deleteBtn);
    card.add_row(deleteRow);

    return card;
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

    shortcutConfig.positions.forEach((position, positionIndex) => {
      row.add_row(this._createPositionRow(wardIndex, shortcutIndex, position, positionIndex));
    });

    const addPosRow = new Adw.ActionRow();
    const addPosBtn = new Gtk.Button({
      label: '+ Add Position',
      css_classes: ['flat'],
      halign: Gtk.Align.START,
      margin_top: 4,
      margin_bottom: 4,
    });
    addPosBtn.connect('clicked', () => this._showPositionEditor(wardIndex, shortcutIndex, -1));
    addPosRow.set_child(addPosBtn);
    row.add_row(addPosRow);

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

  _createPositionRow(wardIndex, shortcutIndex, position, positionIndex) {
    const row = new Adw.ActionRow({
      title: this._positionLabel(position),
      activatable: false,
    });

    const editBtn = new Gtk.Button({
      icon_name: 'document-edit-symbolic',
      valign: Gtk.Align.CENTER,
      css_classes: ['flat'],
      tooltip_text: 'Edit position',
    });
    editBtn.connect('clicked', () => this._showPositionEditor(wardIndex, shortcutIndex, positionIndex));
    row.add_suffix(editBtn);

    const removeBtn = new Gtk.Button({
      icon_name: 'list-remove-symbolic',
      valign: Gtk.Align.CENTER,
      css_classes: ['flat'],
      tooltip_text: 'Remove position',
    });
    removeBtn.connect('clicked', () => {
      const wards = this._getWards();
      wards[wardIndex].shortcuts[shortcutIndex].positions.splice(positionIndex, 1);
      this._saveWards(wards);
      this._loadWards();
    });
    row.add_suffix(removeBtn);

    return row;
  }

  _showPositionEditor(wardIndex, shortcutIndex, positionIndex) {
    const wards = this._getWards();
    const ward = wards[wardIndex];
    const shortcut = ward.shortcuts[shortcutIndex];
    const isEdit = positionIndex >= 0;
    const existing = isEdit
      ? shortcut.positions[positionIndex]
      : { anchor: { col: 1, row: 1 }, target: { col: 1, row: 1 } };

    const makeSpinner = (val, max) => new Gtk.SpinButton({
      adjustment: new Gtk.Adjustment({
        value: val,
        lower: 1,
        upper: max,
        step_increment: 1,
        page_increment: 1,
      }),
      numeric: true,
      valign: Gtk.Align.CENTER,
    });

    const anchorColSpin = makeSpinner(existing.anchor.col, ward.cols);
    const anchorRowSpin = makeSpinner(existing.anchor.row, ward.rows);
    const targetColSpin = makeSpinner(existing.target.col, ward.cols);
    const targetRowSpin = makeSpinner(existing.target.row, ward.rows);

    const grid = new Gtk.Grid({
      column_spacing: 12,
      row_spacing: 8,
      margin_top: 12,
      margin_bottom: 4,
    });
    grid.attach(new Gtk.Label({ label: 'Anchor col', halign: Gtk.Align.START }), 0, 0, 1, 1);
    grid.attach(anchorColSpin, 1, 0, 1, 1);
    grid.attach(new Gtk.Label({ label: 'Anchor row', halign: Gtk.Align.START }), 0, 1, 1, 1);
    grid.attach(anchorRowSpin, 1, 1, 1, 1);
    grid.attach(new Gtk.Label({ label: 'Target col', halign: Gtk.Align.START }), 0, 2, 1, 1);
    grid.attach(targetColSpin, 1, 2, 1, 1);
    grid.attach(new Gtk.Label({ label: 'Target row', halign: Gtk.Align.START }), 0, 3, 1, 1);
    grid.attach(targetRowSpin, 1, 3, 1, 1);

    const dialog = new Adw.AlertDialog({
      heading: isEdit ? 'Edit Position' : 'Add Position',
      extra_child: grid,
    });
    dialog.add_response('cancel', 'Cancel');
    dialog.add_response('confirm', isEdit ? 'Save' : 'Add');
    dialog.set_default_response('confirm');
    dialog.set_close_response('cancel');
    dialog.set_response_appearance('confirm', Adw.ResponseAppearance.SUGGESTED);

    dialog.connect('response', (_dialog, response) => {
      if (response !== 'confirm') return;
      const newPosition = {
        anchor: { col: anchorColSpin.get_value_as_int(), row: anchorRowSpin.get_value_as_int() },
        target: { col: targetColSpin.get_value_as_int(), row: targetRowSpin.get_value_as_int() },
      };
      const w2 = this._getWards();
      if (isEdit) {
        w2[wardIndex].shortcuts[shortcutIndex].positions[positionIndex] = newPosition;
      } else {
        w2[wardIndex].shortcuts[shortcutIndex].positions.push(newPosition);
      }
      this._saveWards(w2);
      this._loadWards();
    });

    dialog.present(this._window);
  }
}
