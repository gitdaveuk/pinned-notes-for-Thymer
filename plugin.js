// Pinned Notes Plugin
// Adds "Pin note" / "Unpin note" to the command palette (Ctrl+P)
// and shows pinned notes as a sidebar widget.

const STORAGE_KEY_PREFIX = "pinned-notes-v1";

class Plugin extends AppPlugin {
    onLoad() {
        this._storageKey = `${STORAGE_KEY_PREFIX}-${this.getWorkspaceGuid()}`;
        this._pinned = this._loadPinned();
        this._sidebarWidget = null;
        this._pinCmd = null;
        this._unpinCmd = null;

        // Inject styles
        this.ui.injectCSS(`
            .pn-widget { padding: 4px 0; }
            .pn-empty { opacity: 0.45; font-size: 12px; font-style: italic; }
            .pn-item {
                display: flex; align-items: center; gap: 6px;
                padding: 5px 0; cursor: pointer; border-radius: 4px;
                font-size: 13px; line-height: 1.3;
                transition: background 0.1s;
            }
            .pn-item:hover { background: var(--color-hover, rgba(128,128,128,0.12)); }
            .pn-item-icon { opacity: 0.6; flex-shrink: 0; font-size: 13px; }
            .pn-item-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .pn-item-remove {
                opacity: 0; cursor: pointer; padding: 2px 4px; border-radius: 3px;
                font-size: 11px; flex-shrink: 0; line-height: 1;
                transition: opacity 0.15s, background 0.1s;
            }
            .pn-item:hover .pn-item-remove { opacity: 0.45; }
            .pn-item-remove:hover { opacity: 1 !important; background: var(--color-hover, rgba(128,128,128,0.18)); }
            .pn-header {
                display: flex; align-items: center; justify-content: space-between;
                padding: 2px 0 4px; opacity: 0.45; font-size: 14px;
                font-weight: bold;
            }
        `);

        // Sidebar widget showing pinned notes
        this._sidebarWidget = this.ui.addSidebarWidget((container, { refresh }) => {
            this._renderWidget(container);
        });

        // Command palette: Pin note
        this._pinCmd = this.ui.addCommandPaletteCommand({
            label: "Pin note",
            icon: "pin",
            onSelected: () => this._pinActive(),
        });

        // Command palette: Unpin note
        this._unpinCmd = this.ui.addCommandPaletteCommand({
            label: "Unpin note",
            icon: "pin",
            onSelected: () => this._unpinActive(),
        });
    }

    onUnload() {
        this._sidebarWidget?.remove();
        this._pinCmd?.remove();
        this._unpinCmd?.remove();
    }

    // ── Storage ──────────────────────────────────────────────────────────────

    _loadPinned() {
        try {
            const raw = localStorage.getItem(this._storageKey);
            return raw ? JSON.parse(raw) : [];
        } catch {
            return [];
        }
    }

    _savePinned() {
        try {
            localStorage.setItem(this._storageKey, JSON.stringify(this._pinned));
        } catch {}
    }

    // ── Pin / Unpin ──────────────────────────────────────────────────────────

    _pinActive() {
        const panel = this.ui.getActivePanel();
        const record = panel?.getActiveRecord();
        if (!record) {
            this.ui.addToaster({ title: "No note open", message: "Open a note first, then pin it.", dismissible: true, autoDestroyTime: 2500 });
            return;
        }
        const guid = record.guid;
        if (this._pinned.some(p => p.guid === guid)) {
            this.ui.addToaster({ title: "Already pinned", message: `"${record.getName()}" is already pinned.`, dismissible: true, autoDestroyTime: 2000 });
            return;
        }
        this._pinned.unshift({ guid, name: record.getName() });
        this._savePinned();
        this._refreshWidget();
        this.ui.addToaster({ title: "Pinned!", message: `"${record.getName()}" added to pinned notes.`, dismissible: true, autoDestroyTime: 2000 });
    }

    _unpinActive() {
        const panel = this.ui.getActivePanel();
        const record = panel?.getActiveRecord();
        if (!record) {
            this.ui.addToaster({ title: "No note open", message: "Open a note first, then unpin it.", dismissible: true, autoDestroyTime: 2500 });
            return;
        }
        const guid = record.guid;
        const before = this._pinned.length;
        this._pinned = this._pinned.filter(p => p.guid !== guid);
        if (this._pinned.length === before) {
            this.ui.addToaster({ title: "Not pinned", message: `"${record.getName()}" isn't pinned.`, dismissible: true, autoDestroyTime: 2000 });
            return;
        }
        this._savePinned();
        this._refreshWidget();
        this.ui.addToaster({ title: "Unpinned", message: `"${record.getName()}" removed from pinned notes.`, dismissible: true, autoDestroyTime: 2000 });
    }

    _unpin(guid) {
        this._pinned = this._pinned.filter(p => p.guid !== guid);
        this._savePinned();
        this._refreshWidget();
    }

    // ── Sidebar widget ────────────────────────────────────────────────────────

    _refreshWidget() {
        this._sidebarWidget?.refresh();
    }

    _renderWidget(container) {
        container.innerHTML = "";
        const wrap = document.createElement("div");
        wrap.className = "pn-widget";

        const header = document.createElement("div");
        header.className = "pn-header";
        header.textContent = "📌 Pinned";
        wrap.appendChild(header);

        if (this._pinned.length === 0) {
            const empty = document.createElement("div");
            empty.className = "pn-empty";
            empty.textContent = "No pinned notes yet";
            wrap.appendChild(empty);
        } else {
            // Update names in case records were renamed
            for (const pin of this._pinned) {
                const record = this.data.getRecord(pin.guid);
                if (record) pin.name = record.getName();
            }

            for (const pin of this._pinned) {
                const item = document.createElement("div");
                item.className = "pn-item";

                const icon = document.createElement("span");
                icon.className = "pn-item-icon";
                icon.textContent = "📄";
                item.appendChild(icon);

                const label = document.createElement("span");
                label.className = "pn-item-label";
                label.textContent = pin.name || "(Untitled)";
                item.appendChild(label);

                const remove = document.createElement("span");
                remove.className = "pn-item-remove";
                remove.textContent = "✕";
                remove.title = "Unpin";
                remove.addEventListener("click", (e) => {
                    e.stopPropagation();
                    this._unpin(pin.guid);
                });
                item.appendChild(remove);

                item.addEventListener("click", async (e) => {
                    if (e.ctrlKey || e.metaKey) {
                        const activePanel = this.ui.getActivePanel();
                        const newPanel = await this.ui.createPanel({ afterPanel: activePanel ?? undefined });
                        if (newPanel) {
                            newPanel.navigateTo({
                                type: "edit_panel",
                                rootId: pin.guid,
                                workspaceGuid: this.getWorkspaceGuid(),
                            });
                            this.ui.setActivePanel(newPanel);
                        }
                    } else {
                        const panel = this.ui.getActivePanel();
                        if (panel) {
                            panel.navigateTo({
                                type: "edit_panel",
                                rootId: pin.guid,
                                workspaceGuid: this.getWorkspaceGuid(),
                            });
                        }
                    }
                });

                wrap.appendChild(item);
            }
        }

        container.appendChild(wrap);
    }
}
