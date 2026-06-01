#!/usr/bin/env bash
# Idempotent bootstrap for Homeworks on Ubuntu/Debian.
# Safe to re-run: every step is guarded.
set -euo pipefail

DOMAIN=""
REPO_URL="https://github.com/s1gmamale1/Homeworks.git"
BRANCH="DaddysBranch"

usage() {
    cat >&2 <<EOF
Usage: sudo bash deploy/install.sh --domain <DOMAIN> [--repo-url <URL>] [--branch <BRANCH>]

Required:
  --domain <DOMAIN>     Public domain (e.g. example.uz) with an A-record pointed here.

Optional:
  --repo-url <URL>      Git repo URL (default: ${REPO_URL})
  --branch <BRANCH>     Branch to deploy (default: ${BRANCH})
EOF
    exit 2
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --domain)   DOMAIN="${2:-}"; shift 2 ;;
        --repo-url) REPO_URL="${2:-}"; shift 2 ;;
        --branch)   BRANCH="${2:-}"; shift 2 ;;
        -h|--help)  usage ;;
        *)          echo "Unknown arg: $1" >&2; usage ;;
    esac
done

[[ -z "${DOMAIN}" ]] && { echo "--domain is required" >&2; usage; }
[[ "$(id -u)" -ne 0 ]] && { echo "Must run as root (use sudo)." >&2; exit 1; }

export DOMAIN

APP_USER="homeworks"
APP_DIR="/opt/homeworks"
VAR_DIR="${APP_DIR}/var"
LOG_DIR="/var/log/homeworks"
ETC_DIR="/etc/homeworks"
ENV_FILE="${ETC_DIR}/env"
CADDY_LOG_DIR="/var/log/caddy"
VENV_DIR="${APP_DIR}/.venv"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

log() { printf '\n=== %s ===\n' "$*"; }

log "1/13 apt update and base packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y \
    python3 python3-venv python3-pip git ufw \
    debian-keyring debian-archive-keyring apt-transport-https \
    curl gnupg ca-certificates openssl gettext-base

log "2/13 Install Caddy from official apt repo (no curl|bash)"
if ! command -v caddy >/dev/null 2>&1; then
    install -d -m 0755 /usr/share/keyrings
    TMP_KEY="$(mktemp)"
    curl -fsSL "https://dl.cloudsmith.io/public/caddy/stable/gpg.key" -o "${TMP_KEY}"
    gpg --dearmor < "${TMP_KEY}" > /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    rm -f "${TMP_KEY}"
    TMP_LIST="$(mktemp)"
    curl -fsSL "https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt" -o "${TMP_LIST}"
    install -m 0644 "${TMP_LIST}" /etc/apt/sources.list.d/caddy-stable.list
    rm -f "${TMP_LIST}"
    apt-get update -y
    apt-get install -y caddy
fi
caddy version

log "3/13 Ensure system user '${APP_USER}'"
if ! id -u "${APP_USER}" >/dev/null 2>&1; then
    useradd --system --no-create-home --shell /usr/sbin/nologin "${APP_USER}"
fi

log "4/13 Create directories"
install -d -m 0755 "${APP_DIR}"
install -d -m 0755 -o "${APP_USER}" -g "${APP_USER}" "${VAR_DIR}"
install -d -m 0755 -o "${APP_USER}" -g "${APP_USER}" "${LOG_DIR}"
install -d -m 0750 -o root -g "${APP_USER}" "${ETC_DIR}"
install -d -m 0755 "${CADDY_LOG_DIR}"

log "5/13 Clone or update repo at ${APP_DIR}"
if [[ -d "${APP_DIR}/.git" ]]; then
    cd "${APP_DIR}"
    if [[ -n "$(git status --porcelain 2>/dev/null || true)" ]]; then
        echo "Refusing to clobber uncommitted local changes in ${APP_DIR}." >&2
        echo "Resolve manually or stash, then re-run." >&2
        exit 1
    fi
    git fetch --depth 1 origin "${BRANCH}"
    git checkout "${BRANCH}"
    git reset --hard "origin/${BRANCH}"
else
    if [[ -n "$(ls -A "${APP_DIR}" 2>/dev/null || true)" ]]; then
        # Allow bootstrap from a pre-populated /opt/homeworks (e.g. operator already cloned).
        cd "${APP_DIR}"
        echo "Note: ${APP_DIR} is non-empty and not a git repo; skipping clone." >&2
    else
        git clone --branch "${BRANCH}" --depth 1 "${REPO_URL}" "${APP_DIR}"
        cd "${APP_DIR}"
    fi
fi
chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"

log "6/13 Python venv + dependencies"
if [[ ! -d "${VENV_DIR}" ]]; then
    sudo -u "${APP_USER}" python3 -m venv "${VENV_DIR}"
fi
sudo -u "${APP_USER}" "${VENV_DIR}/bin/pip" install --upgrade pip
sudo -u "${APP_USER}" "${VENV_DIR}/bin/pip" install -r "${APP_DIR}/requirements.txt"

log "7/13 Provision ${ENV_FILE}"
if [[ ! -f "${ENV_FILE}" ]]; then
    cp "${APP_DIR}/deploy/env.example" "${ENV_FILE}"
    ADMIN_TOKEN="$(openssl rand -hex 32)"
    IP_SALT="$(openssl rand -hex 32)"
    # Use a non-/ delimiter to avoid escaping problems in values.
    sed -i "s|replace-me-with-a-strong-random-token|${ADMIN_TOKEN}|" "${ENV_FILE}"
    sed -i "s|replace-me-with-a-32-byte-random-string|${IP_SALT}|" "${ENV_FILE}"
    sed -i "s|YOUR-DOMAIN|${DOMAIN}|" "${ENV_FILE}"
    chown root:"${APP_USER}" "${ENV_FILE}"
    chmod 0640 "${ENV_FILE}"
    echo "Created ${ENV_FILE} with freshly generated secrets."
else
    echo "Notice: ${ENV_FILE} already exists; leaving it untouched."
fi

log "8/13 Install systemd unit"
install -m 0644 "${APP_DIR}/deploy/homeworks.service" /etc/systemd/system/homeworks.service
systemctl daemon-reload
systemctl enable homeworks
systemctl restart homeworks

log "9/13 Render Caddyfile with DOMAIN=${DOMAIN}"
install -d -m 0755 /etc/caddy
# sed (not envsubst) — Caddy uses ${VAR} syntax of its own, so the template
# uses a non-conflicting __DOMAIN__ placeholder substituted here.
sed "s|__DOMAIN__|${DOMAIN}|g" "${APP_DIR}/deploy/Caddyfile" > /etc/caddy/Caddyfile
# Ensure caddy can write its access log. Some Caddy starts leave behind a
# root-owned access.log from a prior failed boot; rm + chown so the next
# start can recreate it as the caddy user.
install -d -m 0755 -o caddy -g caddy "${CADDY_LOG_DIR}"
rm -f "${CADDY_LOG_DIR}/access.log"
systemctl enable caddy
systemctl reload caddy || systemctl restart caddy

log "10/13 Firewall (ufw)"
ufw allow OpenSSH || true
ufw allow 80/tcp  || true
ufw allow 443/tcp || true
ufw default deny incoming  || true
ufw default allow outgoing || true
if ufw status | grep -q "Status: inactive"; then
    ufw --force enable
fi

log "11/13 Wait for uvicorn to come up"
for i in 1 2 3 4 5 6 7 8 9 10; do
    if curl -fsS http://127.0.0.1:8000/ -o /dev/null; then
        break
    fi
    sleep 1
done

log "12/13 Local smoke test (uvicorn on 127.0.0.1:8000)"
if curl -fsS http://127.0.0.1:8000/ | head -c 200; then
    echo
    echo "uvicorn responded."
else
    echo "WARNING: uvicorn did not respond on 127.0.0.1:8000. Check: journalctl -u homeworks -n 100" >&2
fi

log "13/13 Final operator notes"
PUBLIC_IP="$(curl -fsS https://api.ipify.org || echo 'unknown')"
cat <<EOF

================================================================================
Homeworks deploy: complete.

Domain:         ${DOMAIN}
Public IP:      ${PUBLIC_IP}
DNS:            Create an A-record:  ${DOMAIN}  ->  ${PUBLIC_IP}
TLS:            Caddy will issue a Let's Encrypt cert automatically once DNS
                resolves to this host. No action required on your side.

Secrets file:   ${ENV_FILE}   (mode 0640, root:${APP_USER}) - keep PRIVATE.
App dir:        ${APP_DIR}
DB file:        ${VAR_DIR}/homeworks.db
App logs:       journalctl -u homeworks -f
Caddy logs:     tail -f ${CADDY_LOG_DIR}/access.log

Update:         cd ${APP_DIR} && sudo git pull && sudo systemctl restart homeworks
================================================================================
EOF
