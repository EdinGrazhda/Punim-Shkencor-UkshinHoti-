#!/usr/bin/env bash
set -euo pipefail

repo_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
graphify_bin=$(command -v graphify)
graphify_python=$(head -n 1 "$graphify_bin")
graphify_python=${graphify_python#\#!}

if [[ ! -x "$graphify_python" ]]; then
  echo "Cannot locate the Python interpreter used by $graphify_bin" >&2
  exit 1
fi
if ! "$graphify_python" -c 'import watchdog' >/dev/null 2>&1; then
  echo "Graphify needs watchdog. Install it with: pipx inject graphifyy watchdog" >&2
  exit 1
fi

unit_dir="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
mkdir -p "$unit_dir"
unit_file="$unit_dir/ckadinti-graphify.service"
# Older installs linked this file to ops/ in the checkout. Replace that link
# before writing so reinstalling does not modify tracked repository files.
if [[ -L "$unit_file" ]]; then
  rm "$unit_file"
fi
cat > "$unit_file" <<EOF
[Unit]
Description=Keep CkaDinTi Graphify knowledge graph current
After=default.target

[Service]
Type=simple
WorkingDirectory=$repo_dir
Environment=PATH=$(dirname "$graphify_bin"):/usr/local/bin:/usr/bin:/bin
ExecStart=$graphify_python $repo_dir/scripts/graphify-auto-update.py
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable ckadinti-graphify.service
systemctl --user restart ckadinti-graphify.service
systemctl --user --no-pager status ckadinti-graphify.service
