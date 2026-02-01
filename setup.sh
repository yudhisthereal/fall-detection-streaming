#!/bin/bash
# setup.sh - Streaming Server Setup Script
# Updated for HTTP-only Architecture (No SRS/Coturn)

# Color codes for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Default values
BUILD_ONLY=false
PROJECT_DIR="/opt/fall-detection-streaming"
PROJECT_NAME="FallDetection.Streaming"
SERVICE_NAME="fall-detection-streaming"
PORT=8000

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --build-only)
      BUILD_ONLY=true
      shift
      ;;
    --project-dir)
      PROJECT_DIR="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [--build-only] [--project-dir /path/to/project]"
      exit 1
      ;;
  esac
done

echo -e "${GREEN}=== Fall Detection Streaming Server Setup ===${NC}"

if [ "$BUILD_ONLY" = false ]; then
  echo -e "${YELLOW}Step 1: Installing system dependencies...${NC}"
  
  # Update system
  sudo apt-get update
  sudo apt-get upgrade -y
  
  # Install .NET 8 SDK
  echo -e "${YELLOW}Installing .NET 8 SDK...${NC}"
  wget https://packages.microsoft.com/config/ubuntu/24.04/packages-microsoft-prod.deb -O packages-microsoft-prod.deb
  sudo dpkg -i packages-microsoft-prod.deb
  rm packages-microsoft-prod.deb
  sudo apt-get update
  sudo apt-get install -y dotnet-sdk-8.0
  
  echo -e "${YELLOW}Step 2: Creating project structure...${NC}"
  
  # Create project directory
  sudo mkdir -p $PROJECT_DIR
  sudo chown -R $USER:$USER $PROJECT_DIR
  
  # Navigate to project directory
  cd $PROJECT_DIR
  
  # Create .NET project (if not exists)
  if [ ! -f "$PROJECT_NAME/$PROJECT_NAME.csproj" ]; then
      echo -e "${YELLOW}Creating ASP.NET Core MVC project...${NC}"
      dotnet new mvc -n $PROJECT_NAME --framework net8.0
  fi
  
  # Navigate into project
  cd $PROJECT_NAME
  
  echo -e "${YELLOW}Step 3: Configuring firewall...${NC}"
  sudo ufw allow $PORT/tcp
  sudo ufw allow ssh
  sudo ufw --force enable
  
  echo -e "${YELLOW}Step 4: Creating data directories...${NC}"
  sudo mkdir -p /var/lib/fall-detection/streaming
  sudo mkdir -p /var/log/fall-detection/streaming
  sudo mkdir -p /var/www/fall-detection/recordings
  sudo chown -R $USER:$USER /var/lib/fall-detection /var/log/fall-detection /var/www/fall-detection
  
  echo -e "${YELLOW}Step 5: Creating ASP.NET systemd service...${NC}"
  sudo tee /etc/systemd/system/$SERVICE_NAME.service > /dev/null <<EOF
[Unit]
Description=Fall Detection Streaming Server
After=network.target

[Service]
Type=exec
User=$USER
WorkingDirectory=$PROJECT_DIR/$PROJECT_NAME
ExecStart=/usr/bin/dotnet run --urls http://0.0.0.0:$PORT
Restart=always
RestartSec=10
KillSignal=SIGINT
Environment="ASPNETCORE_ENVIRONMENT=Production"
Environment="DOTNET_PRINT_TELEMETRY_MESSAGE=false"

[Install]
WantedBy=multi-user.target
EOF
  
  sudo systemctl daemon-reload
else
  echo -e "${YELLOW}[BUILD-ONLY MODE] Skipping system setup, going directly to build...${NC}"
  
  # Navigate to project directory
  echo "Navigating to project directory: $PROJECT_DIR/$PROJECT_NAME"
  cd "$PROJECT_DIR/$PROJECT_NAME" || {
    echo -e "${RED}Error: Could not navigate to $PROJECT_DIR/$PROJECT_NAME${NC}"
    echo "Make sure the project exists or specify --project-dir with the correct path"
    exit 1
  }
  
  # Verify we're in the project directory
  if [ ! -f "FallDetection.Streaming.csproj" ]; then
    echo -e "${RED}Error: Not in project directory. FallDetection.Streaming.csproj not found${NC}"
    echo "Current directory: $(pwd)"
    exit 1
  fi
fi

echo -e "${YELLOW}Step 6: Building and publishing the project...${NC}"
echo "Current directory: $(pwd)"

# Build the project

# Backup existing Data directory BEFORE deleting publish folder
echo "Backing up existing publish/Data/ to ./backup/Data/..."
if [ -d "./publish/Data" ]; then
  mkdir -p ./backup/Data/
  cp -r ./publish/Data/* ./backup/Data/
  echo "Data directory backed up"
fi

# Clean up existing publish directory to prevent nested publish/publish/... folders
if [ -d "./publish" ]; then
  echo "Removing existing publish directory to prevent nested builds..."
  rm -rf ./publish
fi

# Restore NuGet packages
echo "Restoring NuGet packages..."
dotnet restore

echo "Building project..."
dotnet build --configuration Release --no-restore

echo "Publishing project..."
dotnet publish --configuration Release --no-build --output ./publish

# Restore Data directory to new publish folder
echo "Restoring backup to ./publish/Data/..."
if [ -d "./backup/Data" ] && [ "$(ls -A ./backup/Data 2>/dev/null)" ]; then
  mkdir -p ./publish/Data/
  cp -r ./backup/Data/* ./publish/Data/
  echo -e "${GREEN}Data directory restored to publish folder${NC}"
fi

echo -e "${YELLOW}Step 7: Updating systemd services for published apps...${NC}"

# Update ASP.NET service
sudo tee /etc/systemd/system/$SERVICE_NAME.service > /dev/null <<EOF
[Unit]
Description=Fall Detection Streaming Server
After=network.target

[Service]
Type=exec
User=$USER
WorkingDirectory=$PROJECT_DIR/$PROJECT_NAME/publish
ExecStart=/usr/bin/dotnet FallDetection.Streaming.dll --urls http://0.0.0.0:$PORT
Restart=always
RestartSec=10
KillSignal=SIGINT
Environment="ASPNETCORE_ENVIRONMENT=Production"
Environment="DOTNET_PRINT_TELEMETRY_MESSAGE=false"

[Install]
WantedBy=multi-user.target
EOF

if [ "$BUILD_ONLY" = false ]; then
  echo -e "${YELLOW}Step 8: Starting services...${NC}"
  sudo systemctl daemon-reload
  
  # Start ASP.NET app
  sudo systemctl enable $SERVICE_NAME
  sudo systemctl start $SERVICE_NAME
  
  echo -e "${YELLOW}Step 9: Verifying services status...${NC}"
  echo -e "\n${YELLOW}ASP.NET Server Status:${NC}"
  sudo systemctl status $SERVICE_NAME --no-pager
  
  # Test the endpoints
  echo -e "${YELLOW}Step 10: Testing endpoints...${NC}"
  sleep 5
  echo "Testing web interface..."
  curl -f http://localhost:$PORT || echo -e "${RED}Web interface check failed${NC}"
  
  echo -e "${GREEN}=== Setup Complete! ===${NC}"
  echo -e "Streaming Server is running on: http://$(hostname -I | awk '{print $1}'):$PORT"
  echo -e "Web: sudo systemctl status $SERVICE_NAME"
  echo -e "Logs: sudo journalctl -u $SERVICE_NAME -f"
else
  echo -e "${GREEN}=== Build Complete! ===${NC}"
  echo -e "Project published to: $PROJECT_DIR/$PROJECT_NAME/publish"
  echo -e "Current directory: $(pwd)"
  echo -e "To start the service manually:"
  echo -e "  sudo systemctl daemon-reload"
  echo -e "  sudo systemctl enable $SERVICE_NAME"
  echo -e "  sudo systemctl start $SERVICE_NAME"
  sudo systemctl daemon-reload
  sudo systemctl restart fall-detection-streaming
  echo "executed daemon-reload and restart fall-detection-streaming"
  sudo systemctl status fall-detection-streaming
fi
