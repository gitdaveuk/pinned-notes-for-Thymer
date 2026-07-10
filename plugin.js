class Plugin extends AppPlugin {

    onLoad() {
        this._sidebarWidget = null;
        this._paletteCommand = null;
        this._recordUpdatedHandler = null;
        this._panelFocusedHandler = null;

        this.ui.injectCSS(`
            .pinned-notes-widget {
                padding: 4px 8px 10px 8px;
            }
            .pinned-notes-widget__header {
                font-size: 11px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.03em;
                opacity: 0.55;
                padding: 4px 4px 6px 4px;
            }
            .pinned-notes-widget__empty {
                font-size: 12px;
                opacity: 0.5;
                padding: 2px 4px 6px 4px;
                line-height: 1.4;
            }
            .pinned-notes-widget__item {
                display: flex;
                align-items: center;
                gap: 6px;
                padding: 4px 4px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 13px;
            }
            .pinned-notes-widget__item:hover {
                background: rgba(127, 127, 127, 0.12);
            }
            .pinned-notes-widget__item-title {
                flex: 1;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            .pinned-notes-widget__unpin {
                opacity: 0;
                cursor: pointer;
                width: 16px;
                height: 16px;
                line-height: 16px;
                text-align: center;
                border-radius: 4px;
                font-size: 13px;
            }
            .pinned-notes-widget__item:hover .pinned-notes-widget__unpin {
                opacity: 0.5;
            }
            .pinned-notes-widget__unpin:hover {
                opacity: 1 !important;
                background: rgba(127, 127, 127, 0.2);
            }
        `);

        // Registers "Pin note" in the command palette (Ctrl+P)
        this._paletteCommand = this.ui.addCommandPaletteCommand({
            label: "Pin note",
            icon: "pin",
            onSelected: () => this.pinActiveNote(),
        });

        // Renders the "Pinned Notes" section above the collections in the sidebar
        this._sidebarWidget = this.ui.addSidebarWidget((container) => {
            this.renderSidebar(container);
        });

        // Keep titles/icons fresh when records change or when switching notes
        this._recordUpdatedHandler = this.events.on("record.updated", () => {
            this.refreshSidebar();
        }, { collection: "*" });

        this._panelFocusedHandler = this.events.on("panel.focused", () => {
            this.refreshSidebar();
        });
    }

    onUnload() {
        if (this._paletteCommand) this._paletteCommand.remove();
        if (this._sidebarWidget) this._sidebarWidget.remove();
        if (this._recordUpdatedHandler) this.events.off(this._recordUpdatedHandler);
        if (this._panelFocusedHandler) this.events.off(this._panelFocusedHandler);
    }

    getPinnedGuids() {
        const conf = this.getConfiguration();
        return (conf.custom && Array.isArray(conf.custom.pinnedNotes)) ? conf.custom.pinnedNotes : [];
    }

    async savePinnedGuids(guids) {
        const conf = this.getConfiguration();
        conf.custom = conf.custom || {};
        conf.custom.pinnedNotes = guids;

        // Get the control API for this plugin itself so we can persist config changes
        const selfApi = this.data.getPluginByGuid(this.getGuid());
        if (!selfApi) return false;
        return await selfApi.saveConfiguration(conf);
    }

    pinActiveNote() {
        const panel = this.ui.getActivePanel();
        const record = panel ? panel.getActiveRecord() : null;

        if (!record) {
            this.ui.addToaster({
                title: "No note open",
                message: "Open a note first, then run \"Pin note\" again.",
                dismissible: true,
                autoDestroyTime: 3000,
            });
            return;
        }

        const guid = record.guid;
        const guids = this.getPinnedGuids();

        if (guids.includes(guid)) {
            this.ui.addToaster({
                title: "Already pinned",
                message: `"${record.getName()}" is already in Pinned Notes.`,
                dismissible: true,
                autoDestroyTime: 2500,
            });
            return;
        }

        const newGuids = [...guids, guid];
        this.savePinnedGuids(newGuids).then((ok) => {
            if (!ok) return;
            this.refreshSidebar();
            this.ui.addToaster({
                title: "Pinned",
                message: `"${record.getName()}" was added to Pinned Notes.`,
                dismissible: true,
                autoDestroyTime: 2000,
            });
        });
    }

    unpinNote(guid) {
        const newGuids = this.getPinnedGuids().filter((g) => g !== guid);
        this.savePinnedGuids(newGuids).then((ok) => {
            if (ok) this.refreshSidebar();
        });
    }

    refreshSidebar() {
        if (this._sidebarWidget) this._sidebarWidget.refresh();
    }

    async openRecord(guid) {
        let panel = this.ui.getActivePanel();
        if (!panel) {
            panel = await this.ui.createPanel();
        }
        if (!panel) return;

        // itemGuid-based navigation resolves the document root and workspace for us
        const ok = await panel.navigateTo({ itemGuid: guid, highlight: false });
        if (ok === false) {
            this.ui.addToaster({
                title: "Couldn't open note",
                message: "It may have been deleted or moved.",
                dismissible: true,
                autoDestroyTime: 3000,
            });
        } else {
            this.ui.setActivePanel(panel);
        }
    }

    renderSidebar(container) {
        container.innerHTML = "";

        const wrap = document.createElement("div");
        wrap.className = "pinned-notes-widget";

        const header = document.createElement("div");
        header.className = "pinned-notes-widget__header";
        header.textContent = "Pinned Notes";
        wrap.appendChild(header);

        const guids = this.getPinnedGuids();
        const validGuids = [];

        if (guids.length === 0) {
            const empty = document.createElement("div");
            empty.className = "pinned-notes-widget__empty";
            empty.textContent = 'Ctrl+P \u2192 "Pin note" to pin your first note';
            wrap.appendChild(empty);
        } else {
            for (const guid of guids) {
                const record = this.data.getRecord(guid);
                if (!record) continue; // note was permanently deleted
                validGuids.push(guid);

                const item = document.createElement("div");
                item.className = "pinned-notes-widget__item";
                item.title = record.getName() || "Untitled";

                const icon = this.ui.createIcon(record.getIcon(true) || "file-text");
                item.appendChild(icon);

                const title = document.createElement("div");
                title.className = "pinned-notes-widget__item-title";
                title.textContent = record.getName() || "Untitled";
                item.appendChild(title);

                const unpin = document.createElement("div");
                unpin.className = "pinned-notes-widget__unpin";
                unpin.textContent = "\u00D7";
                unpin.title = "Unpin";
                unpin.addEventListener("click", (ev) => {
                    ev.stopPropagation();
                    this.unpinNote(guid);
                });
                item.appendChild(unpin);

                item.addEventListener("click", () => this.openRecord(guid));

                wrap.appendChild(item);
            }

            // If any pinned guids no longer resolve to a record, drop them silently
            if (validGuids.length !== guids.length) {
                this.savePinnedGuids(validGuids);
            }
        }

        container.appendChild(wrap);
    }
}
