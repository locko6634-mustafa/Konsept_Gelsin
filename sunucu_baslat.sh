#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT=8000
WAIT=false

# Parametre analizi
while [[ $# -gt 0 ]]; do
    case "$1" in
        -p|--port)
            PORT="$2"
            shift 2
            ;;
        -w|--wait)
            WAIT=true
            shift
            ;;
        [0-9]*)
            PORT="$1"
            shift
            ;;
        *)
            shift
            ;;
    esac
done

# Node.js kontrolü
if ! command -v node >/dev/null 2>&1; then
    echo -e "\033[31mHata: Statik sunucu icin Node.js gereklidir.\033[0m" >&2
    exit 1
fi

SERVER_SCRIPT="$SCRIPT_DIR/tools/server.mjs"
if [ ! -f "$SERVER_SCRIPT" ]; then
    echo -e "\033[31mHata: Sunucu giris dosyasi bulunamadi: $SERVER_SCRIPT\033[0m" >&2
    exit 1
fi

# Port kullanım kontrolü
is_port_in_use() {
    local p="$1"
    if command -v ss >/dev/null 2>&1; then
        ss -tuln | grep -qE "(:|\])${p}\b"
    elif command -v lsof >/dev/null 2>&1; then
        lsof -i :"$p" -sTCP:LISTEN >/dev/null 2>&1
    else
        (exec 3<>/dev/tcp/127.0.0.1/"$p") 2>/dev/null && exec 3>&-
    fi
}

open_browser() {
    local url="$1"
    if command -v xdg-open >/dev/null 2>&1; then
        xdg-open "$url" >/dev/null 2>&1 &
    elif command -v gio >/dev/null 2>&1; then
        gio open "$url" >/dev/null 2>&1 &
    elif command -v sensible-browser >/dev/null 2>&1; then
        sensible-browser "$url" >/dev/null 2>&1 &
    fi
}

if is_port_in_use "$PORT"; then
    echo -e "\033[33mSunucu zaten calisiyor: http://localhost:$PORT\033[0m"
    open_browser "http://localhost:$PORT"
    exit 0
fi

echo -e "\033[36mStatik frontend sunucusu (Port $PORT) arka planda baslatiliyor...\033[0m"

LOG_FILE="$SCRIPT_DIR/.server.log"
if command -v setsid >/dev/null 2>&1; then
    HOST="127.0.0.1" PORT="$PORT" setsid node "$SERVER_SCRIPT" </dev/null > "$LOG_FILE" 2>&1 &
else
    HOST="127.0.0.1" PORT="$PORT" nohup node "$SERVER_SCRIPT" </dev/null > "$LOG_FILE" 2>&1 &
fi
SERVER_PID=$!
disown "$SERVER_PID" 2>/dev/null || true

# Kısa bir süre bekleyip sürecin ayakta olduğunu doğrula
sleep 0.5
if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo -e "\033[31mHata: Sunucu baslatilamadi. Log kaydi ($LOG_FILE):\033[0m" >&2
    cat "$LOG_FILE" >&2
    exit 1
fi

echo -e "\033[32m-> Sunucu basariyla baslatildi! PID: $SERVER_PID\033[0m"
echo -e "\033[32m   URL: http://localhost:$PORT\033[0m"

open_browser "http://localhost:$PORT"

if [ "$WAIT" = true ]; then
    wait "$SERVER_PID"
fi
