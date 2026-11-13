/** True when the UI is running inside the Tauri shell (and not in a browser or a test). */
export const inTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
