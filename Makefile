.PHONY: help upd

help:
	@echo "Targets:"
	@echo "  make upd   # build the desktop app (tauri build)"

upd:
	npm --prefix desktop run tauri build
