class Plugin extends AppPlugin {

    onLoad() {
        this._sidebarWidget = null;
        this._paletteCommand = null;

        this.ui.injectCSS(`
            .pinned-notes-widget {
                padding: 4px 0 8px 0;
            }

            .pinned-notes-widget__header {
                font-size: 14px;
                font-weight: 600;
                padding: 12px 16px 8px 16px;
                color: inherit;
                opacity: 0.5;
                user-select: none;
                line-height: 1.2;
                letter-spacing: -0.02em;
            }

            .pinned-notes-widget__content {
                display: flex;
                flex-direction: column;
                gap: 1px;
            }

            .pinned-notes-widget__item {
                display: flex;
                align-items: center;
                gap: 10px;
                height: 32px;
                padding: 0 16px;
                border-radius: 0 6px 6px 0;
                cursor: pointer;
                font-size: 14px;
                font-weight: 450;
                letter-spacing: -0.01em;
                margin-right: 12px;
                transition: background 0.1s ease;
            }

            .pinned-notes-widget__item:hover {
                background: rgba(127, 127, 127, 0.08);
            }

            .pinned-notes-widget__item i {
                opacity: 0.8;
                font-size: 16px;
                flex-shrink: 0;
                margin-left: 18px; /* Perfect Alignment */
                width: 18px;
                text-align: center;
            }

            .pinned-notes-widget__item-title {
                flex: 1;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                line-height: 1.4;
                letter-spacing: -0.01em;
            }

            .pinned-notes-widget__unpin {
                opacity: 0;
                cursor: pointer;
                width: 20px;
                height: 20px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 4px;
                font-size: 16px;
                font-weight: 300;
                margin-right: -4px;
                transition: opacity 0.1s ease;
            }

            .pinned-notes-widget__item:hover .pinned-notes-widget__unpin {
                opacity: 0.4;
            }

            .pinned-notes-widget__unpin:hover {
                opacity: 1 !important;
                background: rgba(127, 127, 127, 0.15);
            }
        `);

        this._paletteCommand = this.ui.addCommandPaletteCommand({
            label: "Pin note",
            icon: "pin",
            onSelected: () => this.pinActiveNote(),
        });

        this._sidebarWidget = this.ui.addSidebarWidget((container) => {
            this.renderSidebar(container);
        });

        // REFIX: Background data hydration
        // We search for the pinned IDs to force Thymer to fetch them from the server.
        // This ensures they show up even if the note or collection isn't open yet.
        this.hydratePins();

        this.events.on("reload", () => {
            this.hydratePins();
            this.refreshSidebar();
        });

        this.events.on("record.updated", () => this.refreshSidebar(), { collection: "*" });
        this.events.on("panel.focused", () => this.refreshSidebar());
    }

    onUnload() {
        if (this._paletteCommand) this._paletteCommand.remove();
        if (this._sidebarWidget) this._sidebarWidget.remove();
    }

    getPinnedGuids() {
        const conf = this.getConfiguration();
        return (conf.custom && Array.isArray(conf.custom.pinnedNotes)) ? conf.custom.pinnedNotes : [];
    }

    async hydratePins() {
        const guids = this.getPinnedGuids();
        if (guids.length === 0) return;
        
        // Search by ID forces the record into the local cache
        for (const guid of guids) {
            this.data.searchByQuery(guid).then(() => this.refreshSidebar());
        }
    }

    async savePinnedGuids(guids) {
        const conf = this.getConfiguration();
        conf.custom = conf.custom || {};
        conf.custom.pinnedNotes = guids;
        const selfApi = this.data.getPluginByGuid(this.getGuid());
        if (selfApi) await selfApi.saveConfiguration(conf);
    }

    pinActiveNote() {
        const panel = this.ui.getActivePanel();
        const record = panel ? panel.getActiveRecord() : null;
        if (!record) return;

        const guids = this.getPinnedGuids();
        if (guids.includes(record.guid)) return;

        this.savePinnedGuids([...guids, record.guid]).then(() => this.refreshSidebar());
    }

    unpinNote(guid) {
        const newGuids = this.getPinnedGuids().filter((g) => g !== guid);
        this.savePinnedGuids(newGuids).then(() => this.refreshSidebar());
    }

    refreshSidebar() {
        if (this._sidebarWidget) this._sidebarWidget.refresh();
    }

    renderSidebar(container) {
        container.innerHTML = "";
        const wrap = document.createElement("div");
        wrap.className = "pinned-notes-widget";

        const header = document.createElement("div");
        header.className = "pinned-notes-widget__header";
        header.textContent = "Pinned";
        wrap.appendChild(header);

        const content = document.createElement("div");
        content.className = "pinned-notes-widget__content";

        const guids = this.getPinnedGuids();

        for (const guid of guids) {
            const record = this.data.getRecord(guid);
            
            // If record isn't loaded yet, it's skipped in this render pass,
            // but we DO NOT delete it from the config. It will appear on the 
            // next refresh once hydratePins() finishes.
            if (!record) continue;

            const item = document.createElement("div");
            item.className = "pinned-notes-widget__item";
            
            const icon = this.ui.createIcon(record.getIcon(true) || "file-text");
            item.appendChild(icon);

            const title = document.createElement("div");
            title.className = "pinned-notes-widget__item-title";
            title.textContent = record.getName() || "Untitled";
            item.appendChild(title);

            const unpin = document.createElement("div");
            unpin.className = "pinned-notes-widget__unpin";
            unpin.textContent = "\u00D7";
            unpin.addEventListener("click", (ev) => {
                ev.stopPropagation();
                this.unpinNote(guid);
            });
            item.appendChild(unpin);

            item.addEventListener("click", async () => {
                let panel = this.ui.getActivePanel() || await this.ui.createPanel();
                if (panel) await panel.navigateTo({ itemGuid: guid, highlight: false });
            });

            content.appendChild(item);
        }

        wrap.appendChild(content);
        container.appendChild(wrap);
    }
}
