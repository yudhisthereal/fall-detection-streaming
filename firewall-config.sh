#!/bin/bash

# firewall-config.sh - Configure firewalls

echo "Configuring firewalls..."

echo ""
echo "=== Machine 2 (Streaming Server) ==="
echo "Opening ports for streaming server:"
echo "  8000/tcp - HTTP/WebSocket"
echo "  1935/tcp - RTMP"
echo "  8000/udp - WebRTC"
sudo ufw allow 8000/tcp
sudo ufw allow 1935/tcp
sudo ufw allow 8000/udp
sudo ufw --force enable
sudo ufw status

echo "Firewall configuration complete!"