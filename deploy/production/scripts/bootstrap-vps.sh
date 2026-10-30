#!/usr/bin/env bash
# One-time VPS hardening + Docker install (Ubuntu). Run as: sudo bash bootstrap-vps.sh
# Idempotent: safe to re-run.
set -euo pipefail

DEPLOY_USER="${DEPLOY_USER:-ubuntu}"
APP_DIR="${APP_DIR:-/opt/chatbotx}"
SWAP_GB="${SWAP_GB:-4}"

[ "$(id -u)" -eq 0 ] || { echo "run with sudo" >&2; exit 1; }
[ "$(dpkg --print-architecture)" = "amd64" ] || { echo "expected amd64" >&2; exit 1; }

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y
apt-get install -y ca-certificates curl gnupg ufw fail2ban unattended-upgrades jq

# Docker Engine + Compose plugin from Docker's official apt repo.
if ! command -v docker >/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  . /etc/os-release
  echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker
usermod -aG docker "$DEPLOY_USER"

# Swap: absorbs spikes on a 4 GB box (builder + worker + postgres).
if ! swapon --show | grep -q /swapfile; then
  fallocate -l "${SWAP_GB}G" /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
sysctl -w vm.swappiness=10 >/dev/null
echo 'vm.swappiness=10' > /etc/sysctl.d/99-chatbotx.conf
# Redis recommends overcommit for background saves.
echo 'vm.overcommit_memory=1' >> /etc/sysctl.d/99-chatbotx.conf
sysctl --system >/dev/null

# Firewall: SSH + HTTP(S) only. Docker-published ports are only Caddy's 80/443.
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

# SSH: keys only, no root login. sshd keeps the FIRST value it reads, so the
# drop-in must sort before 50-cloud-init.conf (which enables passwords).
# Only applied once a key is installed for the
# deploy user, so this can never lock you out.
if [ -s "/home/${DEPLOY_USER}/.ssh/authorized_keys" ]; then
  cat > /etc/ssh/sshd_config.d/00-chatbotx.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
EOF
  # Ubuntu 24.04 socket-activates sshd: each new connection reads the config,
  # so a reload is only needed (and only possible) when ssh.service runs.
  sshd -t
  systemctl try-reload-or-restart ssh.service 2>/dev/null || true
fi
systemctl enable --now fail2ban
dpkg-reconfigure -f noninteractive unattended-upgrades

# Docker log rotation defaults (compose also sets per-service limits).
if [ ! -f /etc/docker/daemon.json ]; then
  echo '{"log-driver":"json-file","log-opts":{"max-size":"20m","max-file":"5"}}' > /etc/docker/daemon.json
  systemctl restart docker
fi

install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" -m 750 "$APP_DIR" "$APP_DIR/backups" "$APP_DIR/state"
echo "bootstrap done"
