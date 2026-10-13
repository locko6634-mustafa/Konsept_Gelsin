#!/usr/bin/env bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Bagimsiz statik frontend sunucusu baslatiliyor..."
"$SCRIPT_DIR/sunucu_baslat.sh" "$@"
