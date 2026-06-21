#!/usr/bin/env bash
# Broadcast Info Display — provisioning script for Raspberry Pi OS Lite (Bookworm)
# Run as root: sudo bash provision.sh
set -euo pipefail

APP_DIR=/opt/broadcast-info-display
PORT=8080
KIOSK_URL="http://localhost:${PORT}/output"

echo "==> Installing Node.js (LTS)"
curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
apt-get install -y nodejs

echo "==> Copying app to ${APP_DIR}"
mkdir -p "${APP_DIR}/data"
cp -r . "${APP_DIR}/"
cd "${APP_DIR}"
npm ci --omit=dev
npm run build

echo "==> Installing systemd service"
cp provisioning/broadcast-display.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable broadcast-display
systemctl start broadcast-display

echo "==> Disabling automatic updates (broadcast stability)"
systemctl disable --now apt-daily.timer        2>/dev/null || true
systemctl disable --now apt-daily-upgrade.timer 2>/dev/null || true
apt-get remove -y unattended-upgrades 2>/dev/null || true
apt-mark hold chromium-browser 2>/dev/null || apt-mark hold chromium 2>/dev/null || true

echo "==> Disabling Chromium translate bar / popups (managed policy)"
# Covers both the `chromium` and `chromium-browser` package layouts on Pi OS.
for dir in /etc/chromium/policies/managed /etc/chromium-browser/policies/managed; do
  mkdir -p "${dir}"
  cp provisioning/chromium-policy.json "${dir}/broadcast-kiosk.json"
done

echo "==> Disabling screen blanking and DPMS"
# For labwc/Wayland: disable idle via wlopm or DPMS config
mkdir -p /etc/xdg/labwc
cat > /etc/xdg/labwc/idle.xml << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<labwc_idle timeout="0"/>
EOF

# Also ensure DPMS is off at Xorg level (fallback)
mkdir -p /etc/X11/xorg.conf.d
cat > /etc/X11/xorg.conf.d/10-dpms.conf << 'EOF'
Section "ServerFlags"
    Option "BlankTime"   "0"
    Option "StandbyTime" "0"
    Option "SuspendTime" "0"
    Option "OffTime"     "0"
EndSection
EOF

echo "==> Installing kiosk (TOLDOTECHNIK/Raspberry-Pi-Kiosk-Display-System)"
echo "    Clone and run kiosk_setup.sh to configure Wayland/labwc/Chromium"
echo "    git clone https://github.com/TOLDOTECHNIK/Raspberry-Pi-Kiosk-Display-System /tmp/kiosk"
echo "    cd /tmp/kiosk && sudo bash kiosk_setup.sh"
echo "    When prompted for URL, enter: ${KIOSK_URL}"
echo ""
echo "==> DONE. Reboot to activate kiosk + app service."
echo "    Control panel available at: http://<pi-ip>:${PORT}/control"
echo "    mDNS (if avahi enabled):    http://broadcast-display.local:${PORT}/control"
