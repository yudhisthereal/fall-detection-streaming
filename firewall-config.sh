#!/bin/bash

# firewall-config.sh - Configure firewalls

echo "Configuring firewalls..."

echo ""
echo "=== Machine 2 (Streaming Server) ==="
echo "Opening ports for streaming server:"
echo "  8000/tcp - HTTP/WebSocket"
echo "  1935/tcp - RTMP"
echo "  8000/udp - WebRTC"
sudo ufw allow 1935/tcp     # RTMP
sudo ufw allow 8080/tcp     # SRS HTTP server
sudo ufw allow 1985/tcp     # SRS HTTP API
sudo ufw allow 8000/udp     # WebRTC media
sudo ufw allow 3478/udp     # TURN
sudo ufw allow 3478/tcp     # TURN (fallback)
sudo ufw allow 8000/tcp     # ASP.NET
sudo ufw reload
sudo ufw --force enable
sudo ufw status

echo "Firewall configuration complete!"