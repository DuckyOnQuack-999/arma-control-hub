#!/bin/bash
# RetroCycles Agent - Quick Install Script
# Works on Ubuntu 20.04+, Debian 11+, CentOS 8+
# Usage: curl -fsSL https://your-domain.com/install-agent.sh | bash

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
AGENT_PORT=${AGENT_PORT:-8080}
AGENT_TOKEN=${AGENT_TOKEN:-$(openssl rand -hex 32)}
AGENT_JWT_SECRET=${AGENT_JWT_SECRET:-$(openssl rand -hex 32)}
INSTALL_DIR=${INSTALL_DIR:-/opt/retrocycles-agent}
REPO_URL=${REPO_URL:-https://github.com/your-repo/retrocycles-panel.git}

# Detect OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$NAME
    VER=$VERSION_ID
else
    echo -e "${RED}Cannot detect OS${NC}"
    exit 1
fi

echo -e "${BLUE}===============================================${NC}"
echo -e "${BLUE}  RetroCycles Agent Installer${NC}"
echo -e "${BLUE}  OS: $OS $VER${NC}"
echo -e "${BLUE}===============================================${NC}"

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    echo -e "${YELLOW}Warning: Running as root. Creating a dedicated user is recommended.${NC}"
    SUDO=""
else
    SUDO="sudo"
fi

# Install dependencies
echo -e "${BLUE}[1/7] Installing dependencies...${NC}"

if [[ "$OS" == *"Ubuntu"* ]] || [[ "$OS" == *"Debian"* ]]; then
    $SUDO apt-get update -qq
    $SUDO apt-get install -y -qq curl wget git build-essential python3
    
    # Install Node.js 20
    if ! command -v node &> /dev/null || [ "$(node -v | cut -d'v' -f2 | cut -d'.' -f1)" != "20" ]; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | $SUDO -E bash -
        $SUDO apt-get install -y -qq nodejs
    fi
    
    # Install Armagetron (optional)
    $SUDO apt-get install -y -qq armagetronad-dedicated 2>/dev/null || true
    
elif [[ "$OS" == *"CentOS"* ]] || [[ "$OS" == *"Red Hat"* ]] || [[ "$OS" == *"Fedora"* ]]; then
    $SUDO yum update -y -q
    $SUDO yum install -y -q curl wget git gcc-c++ make python3
    
    # Install Node.js 20
    if ! command -v node &> /dev/null || [ "$(node -v | cut -d'v' -f2 | cut -d'.' -f1)" != "20" ]; then
        curl -fsSL https://rpm.nodesource.com/setup_20.x | $SUDO bash -
        $SUDO yum install -y -q nodejs
    fi
    
    # Install Armagetron (optional)
    $SUDO yum install -y -q armagetronad-dedicated 2>/dev/null || true
    
else
    echo -e "${RED}Unsupported OS: $OS${NC}"
    echo -e "${YELLOW}Please install Node.js 20, git, and build tools manually.${NC}"
    exit 1
fi

echo -e "${GREEN}Node.js $(node -v) installed${NC}"

# Create user and directory
echo -e "${BLUE}[2/7] Creating agent user and directory...${NC}"

if ! id -u retrocycles &>/dev/null; then
    $SUDO useradd -r -s /bin/bash -d $INSTALL_DIR -m retrocycles 2>/dev/null || true
fi

$SUDO mkdir -p $INSTALL_DIR
$SUDO chown retrocycles:retrocycles $INSTALL_DIR 2>/dev/null || true

# Download agent
echo -e "${BLUE}[3/7] Downloading agent...${NC}"

# Option 1: Clone from git (if repo is available)
# cd $INSTALL_DIR
# $SUDO -u retrocycles git clone $REPO_URL .

# Option 2: Download pre-built release
# For now, we'll create the agent files directly

$SUDO -u retrocycles mkdir -p $INSTALL_DIR/agent $INSTALL_DIR/data

# Create package.json
$SUDO -u retrocycles tee $INSTALL_DIR/agent/package.json > /dev/null << 'EOF'
{
  "name": "retrocycles-agent",
  "version": "2.0.0",
  "description": "Host agent for RetroCycles/Armagetron Advanced server control panel",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "ts-node src/index.ts"
  },
  "dependencies": {
    "express": "^4.21.0",
    "node-pty": "^1.0.0",
    "pidusage": "^3.0.2",
    "cors": "^2.8.5",
    "uuid": "^10.0.0",
    "ws": "^8.18.0",
    "jsonwebtoken": "^9.0.2",
    "better-sqlite3": "^11.0.0",
    "strip-ansi": "^7.1.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/cors": "^2.8.17",
    "@types/node": "^22.0.0",
    "@types/uuid": "^10.0.0",
    "@types/ws": "^8.5.12",
    "@types/jsonwebtoken": "^9.0.6",
    "typescript": "^5.0.0",
    "ts-node": "^10.9.2"
  }
}
EOF

# Create tsconfig.json
$SUDO -u retrocycles tee $INSTALL_DIR/agent/tsconfig.json > /dev/null << 'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "moduleResolution": "node",
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
EOF

# Create source directory
$SUDO -u retrocycles mkdir -p $INSTALL_DIR/agent/src

# Note: In production, copy the actual source files from the repo
# For this script, we'll create a minimal placeholder

echo -e "${YELLOW}Note: Please copy the agent source files from the repository to $INSTALL_DIR/agent/src/${NC}"

# Create environment file
echo -e "${BLUE}[4/7] Creating configuration...${NC}"

$SUDO -u retrocycles tee $INSTALL_DIR/agent/.env > /dev/null << EOF
AGENT_PORT=$AGENT_PORT
AGENT_TOKEN=$AGENT_TOKEN
AGENT_JWT_SECRET=$AGENT_JWT_SECRET
AGENT_DB_DIR=$INSTALL_DIR/data
EOF

# Install dependencies and build
echo -e "${BLUE}[5/7] Installing dependencies...${NC}"

cd $INSTALL_DIR/agent
$SUDO -u retrocycles npm install 2>&1 | tail -5

# Create systemd service
echo -e "${BLUE}[6/7] Creating systemd service...${NC}"

$SUDO tee /etc/systemd/system/retrocycles-agent.service > /dev/null << EOF
[Unit]
Description=RetroCycles Agent
After=network.target

[Service]
Type=simple
User=retrocycles
WorkingDirectory=$INSTALL_DIR/agent
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=5
EnvironmentFile=$INSTALL_DIR/agent/.env

[Install]
WantedBy=multi-user.target
EOF

$SUDO systemctl daemon-reload
$SUDO systemctl enable retrocycles-agent

# Configure firewall
echo -e "${BLUE}[7/7] Configuring firewall...${NC}"

if command -v ufw &> /dev/null; then
    $SUDO ufw allow $AGENT_PORT/tcp >/dev/null 2>&1 || true
    $SUDO ufw allow 4534/udp >/dev/null 2>&1 || true
    $SUDO ufw allow 4533/udp >/dev/null 2>&1 || true
    echo -e "${GREEN}UFW rules added${NC}"
elif command -v firewall-cmd &> /dev/null; then
    $SUDO firewall-cmd --permanent --add-port=$AGENT_PORT/tcp >/dev/null 2>&1 || true
    $SUDO firewall-cmd --permanent --add-port=4534/udp >/dev/null 2>&1 || true
    $SUDO firewall-cmd --permanent --add-port=4533/udp >/dev/null 2>&1 || true
    $SUDO firewall-cmd --reload >/dev/null 2>&1 || true
    echo -e "${GREEN}firewalld rules added${NC}"
fi

# Summary
echo -e "${GREEN}===============================================${NC}"
echo -e "${GREEN}  Installation Complete!${NC}"
echo -e "${GREEN}===============================================${NC}"
echo ""
echo -e "${BLUE}Agent Directory:${NC} $INSTALL_DIR/agent"
echo -e "${BLUE}Data Directory:${NC} $INSTALL_DIR/data"
echo -e "${BLUE}Agent URL:${NC} http://$(curl -s -4 ifconfig.me 2>/dev/null || echo 'YOUR_SERVER_IP'):$AGENT_PORT"
echo -e "${BLUE}Agent Token:${NC} $AGENT_TOKEN"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo -e "  1. Copy agent source files to $INSTALL_DIR/agent/src/"
echo -e "  2. Run: ${GREEN}cd $INSTALL_DIR/agent && npm run build${NC}"
echo -e "  3. Start: ${GREEN}sudo systemctl start retrocycles-agent${NC}"
echo -e "  4. Check status: ${GREEN}sudo systemctl status retrocycles-agent${NC}"
echo -e "  5. View logs: ${GREEN}sudo journalctl -u retrocycles-agent -f${NC}"
echo ""
echo -e "${YELLOW}In the panel, set:${NC}"
echo -e "  Agent URL: http://$(curl -s -4 ifconfig.me 2>/dev/null || echo 'YOUR_SERVER_IP'):$AGENT_PORT"
echo -e "  Agent Token: $AGENT_TOKEN"
