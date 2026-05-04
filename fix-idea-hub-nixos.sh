#!/usr/bin/env bash
set -euo pipefail

# Run as root: sudo bash ./fix-idea-hub-nixos.sh

CFG="/etc/nixos/configuration.nix"
FLAKE="/etc/nixos/flake.nix"
HOME_NIX="/etc/nixos/home.nix"
TS="$(date +%Y%m%d-%H%M%S)"

for f in "$CFG" "$FLAKE" "$HOME_NIX"; do
  cp -av "$f" "${f}.bak-${TS}"
done

python3 <<'PY'
from pathlib import Path

cfg = Path('/etc/nixos/configuration.nix')
flake = Path('/etc/nixos/flake.nix')
home = Path('/etc/nixos/home.nix')

cfg_text = cfg.read_text()
flake_text = flake.read_text()
home_text = home.read_text()

# 1) Remove broken clip import from configuration.nix imports block
cfg_text = cfg_text.replace('    inputs.clip.nixosModules.default\n', '')

# 2) Remove services.clip block lines if present
cfg_text = cfg_text.replace('  services.clip.enable = true;\n', '')
cfg_text = cfg_text.replace('  services.clip.port = 8765;\n', '')

# 3) Keep explicit disable lines for game servers (append if missing)
need_mc = 'systemd.services.minecraft-server.enable = false;'
need_fac = 'systemd.services.factorio-server.enable = false;'
if need_mc not in cfg_text or need_fac not in cfg_text:
    marker = '  # Syncthing (pi-sync between fleck-pc and nixos)\n'
    block = (
        '  systemd.services.minecraft-server.enable = false;\n'
        '  systemd.services.factorio-server.enable = false;\n\n'
    )
    if marker in cfg_text:
        cfg_text = cfg_text.replace(marker, block + marker)

# 4) Remove clip flake input (broken local path)
flake_text = flake_text.replace('    clip.url = "path:/home/fleck/Projects/clip";\n', '')
flake_text = flake_text.replace('    clip.inputs.nixpkgs.follows = "nixpkgs";\n', '')

# 5) Rename home card clip -> idea-hub
home_text = home_text.replace('            name: "clip",\n', '            name: "idea-hub",\n')
home_text = home_text.replace('            icon: "📋",\n', '            icon: "💡",\n')
home_text = home_text.replace(
    '            desc: "Shared clipboard manager. Store, label, and retrieve text snippets from any device on the network."\n',
    '            desc: "Idea hub. Capture, label, and retrieve notes/snippets from any device on the network."\n'
)

cfg.write_text(cfg_text)
flake.write_text(flake_text)
home.write_text(home_text)
PY

echo "== changed files =="
rg -n "inputs\.clip|services\.clip|idea-hub|minecraft-server\.enable = false|factorio-server\.enable = false" /etc/nixos/configuration.nix /etc/nixos/flake.nix /etc/nixos/home.nix || true

echo "== nixos-rebuild switch =="
nixos-rebuild switch --flake /etc/nixos#nixos

echo "== service checks =="
systemctl is-enabled minecraft-server.service factorio-server.service || true
systemctl is-active minecraft-server.service factorio-server.service || true

echo "== done =="
