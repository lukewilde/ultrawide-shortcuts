import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class GnomeMagicWindowPreferences extends ExtensionPreferences {
  fillPreferencesWindow(window) {
    this._settings = this.getSettings();
    this._window = window;
    window.set_default_size(700, 600);

    const page = new Adw.PreferencesPage({
      title: 'Bindings',
      icon_name: 'input-keyboard-symbolic',
    });
    window.add(page);

    this._bindingsGroup = new Adw.PreferencesGroup({
      title: 'Window Bindings',
      description: 'Each binding maps a keyboard shortcut to an application.',
    });
    page.add(this._bindingsGroup);

    this._loadBindings();

    // Add binding button
    const addButton = new Gtk.Button({
      label: 'Add Binding',
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
      label: 'Remove Binding',
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
        '/org/gnome/Shell/Extensions/GnomeMagicWindow',
        'org.gnome.Shell.Extensions.GnomeMagicWindow',
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
      console.error(`gnome-magic-window: window detection failed: ${e.message}`);
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
}
