fn main() {
    // The exe embeds icon.ico through a compiled resource; rebuild it when the icon changes.
    println!("cargo:rerun-if-changed=icons/icon.ico");
    tauri_build::build()
}
