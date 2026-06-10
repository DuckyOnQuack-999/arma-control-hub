# VPS Setup Guide

This guide covers deploying the RetroCycles Control Panel and Agent on cloud VPS providers.

## Table of Contents
- [Overview](#overview)
- [Google Cloud Platform (GCP)](#google-cloud-platform-gcp)
- [Amazon Web Services (AWS)](#amazon-web-services-aws)
- [DigitalOcean](#digitalocean)
- [Linode / Akamai](#linode--akamai)
- [Vultr](#vultr)
- [Hetzner](#hetzner)
- [Generic Linux VPS](#generic-linux-vps)
- [Docker Deployment](#docker-deployment)
- [Firewall Configuration](#firewall-configuration)
- [SSL / HTTPS](#ssl--https)
- [Troubleshooting](#troubleshooting)

---

## Overview

The control panel consists of two parts:

1. **Panel (Frontend + Supabase Backend)** - Runs in the browser, connects to Supabase
2. **Agent (Node.js)** - Runs on the game server host, manages processes via PTY

For a complete setup, you need:
- A VPS for the **Agent** (must be on same machine as game servers)
- A separate server or the same VPS for the **Panel** (static files + Supabase)
- **Supabase project** for database, auth, and edge functions

---

## Google Cloud Platform (GCP)

### 1. Create a VM Instance

```bash
# Using gcloud CLI
gcloud compute instances create retrocycles-agent \
  --zone=us-central1-a \
  --machine-type=e2-medium \
  --image-family=ubuntu-2204-lts \
  --image-project=ubuntu-os-cloud \
  --boot-disk-size=20GB \
  --tags=http-server,https-server,game-server

# Allow ports
gcloud compute firewall-rules create allow-game-ports \
  --allow tcp:8080,tcp:3000,udp:4534 \
  --target-tags=game-server
```

### 2. Install Dependencies

```bash
ssh ubuntu@YOUR_VM_IP

# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs build-essential

# Install Armagetron dedicated server
sudo apt install -y armagetronad-dedicated

# Install git
sudo apt install -y git
```

### 3. Deploy the Agent

```bash
# Clone the repository
git clone https://github.com/your-repo/retrocycles-panel.git
cd retrocycles-panel/agent

# Install dependencies
npm install

# Build
npm run build

# Create environment file
cat > .env << 'EOF'
AGENT_PORT=8080
AGENT_JWT_SECRET=your-secure-jwt-secret-here
AGENT_TOKEN=your-secure-agent-token-here
AGENT_DB_DIR=./data
EOF

# Start the agent
npm start
```

### 4. Run as Systemd Service

```bash
sudo tee /etc/systemd/system/retrocycles-agent.service << 'EOF'
[Unit]
Description=RetroCycles Agent
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/retrocycles-panel/agent
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=5
Environment=AGENT_PORT=8080
Environment=AGENT_JWT_SECRET=your-secure-jwt-secret
Environment=AGENT_TOKEN=your-secure-agent-token

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable retrocycles-agent
sudo systemctl start retrocycles-agent

# Check status
sudo systemctl status retrocycles-agent
```

### 5. Configure Panel

In the panel, go to **Host Settings** and set:
- Agent URL: `http://YOUR_VM_IP:8080`
- Agent Token: `your-secure-agent-token`

---

## Amazon Web Services (AWS)

### 1. Launch EC2 Instance

```bash
# Using AWS CLI
aws ec2 run-instances \
  --image-id ami-0c7217cdde317cfec \
  --count 1 \
  --instance-type t3.medium \
  --key-name your-key-pair \
  --security-group-ids sg-your-security-group \
  --subnet-id subnet-your-subnet \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=retrocycles-agent}]'
```

### 2. Security Group Rules

| Type | Protocol | Port Range | Source |
|------|----------|------------|--------|
| SSH | TCP | 22 | Your IP |
| HTTP | TCP | 80 | 0.0.0.0/0 |
| HTTPS | TCP | 443 | 0.0.0.0/0 |
| Custom TCP | TCP | 8080 | Your panel IP |
| Custom UDP | UDP | 4534 | 0.0.0.0/0 |
| Custom UDP | UDP | 4533 | 0.0.0.0/0 |

### 3. Install and Configure

Same as GCP steps 2-5 above.

### 4. Using Elastic IP (Recommended)

```bash
# Allocate Elastic IP
aws ec2 allocate-address --domain vpc

# Associate with instance
aws ec2 associate-address --instance-id i-your-instance --allocation-id eipalloc-your-id
```

---

## DigitalOcean

### 1. Create Droplet

```bash
# Using doctl
doctl compute droplet create retrocycles-agent \
  --image ubuntu-22-04-x64 \
  --size s-2vcpu-2gb \
  --region nyc1 \
  --ssh-keys your-ssh-key-id \
  --tag-name game-server

# Create firewall
doctl compute firewall create \
  --name retrocycles-firewall \
  --inbound-rules "protocol:tcp,ports:22,address:0.0.0.0/0 protocol:tcp,ports:8080,address:0.0.0.0/0 protocol:udp,ports:4534,address:0.0.0.0/0" \
  --outbound-rules "protocol:tcp,ports:1-65535,address:0.0.0.0/0 protocol:udp,ports:1-65535,address:0.0.0.0/0"
```

### 2. Install and Configure

Same as GCP steps 2-5.

---

## Linode / Akamai

### 1. Create Linode

```bash
# Using Linode CLI
linode-cli linodes create \
  --label retrocycles-agent \
  --region us-east \
  --type g6-standard-2 \
  --image linode/ubuntu22.04 \
  --root_pass your-secure-password \
  --tags game-server
```

### 2. Configure Firewall

```bash
# Using linode-cli
linode-cli firewalls create \
  --label retrocycles-firewall \
  --rules.outbound_policy ACCEPT \
  --rules.inbound "$(cat <<'EOF'
[
  {"protocol": "TCP", "ports": "22", "addresses": {"ipv4": ["0.0.0.0/0"]}},
  {"protocol": "TCP", "ports": "8080", "addresses": {"ipv4": ["0.0.0.0/0"]}},
  {"protocol": "UDP", "ports": "4534", "addresses": {"ipv4": ["0.0.0.0/0"]}}
]
EOF
)"
```

### 3. Install and Configure

Same as GCP steps 2-5.

---

## Vultr

### 1. Deploy Server

```bash
# Using Vultr CLI
vultr instance create \
  --label retrocycles-agent \
  --region ewr \
  --plan vc2-1c-2gb \
  --os 1743 \
  --tag game-server
```

### 2. Firewall Group

```bash
vultr firewall group create --description "RetroCycles Rules"
vultr firewall rule create --firewall-group-id your-group-id --protocol tcp --port 22 --source 0.0.0.0/0
vultr firewall rule create --firewall-group-id your-group-id --protocol tcp --port 8080 --source 0.0.0.0/0
vultr firewall rule create --firewall-group-id your-group-id --protocol udp --port 4534 --source 0.0.0.0/0
```

---

## Hetzner

### 1. Create Server

```bash
# Using hcloud CLI
hcloud server create \
  --name retrocycles-agent \
  --type cx21 \
  --image ubuntu-22.04 \
  --location nbg1 \
  --ssh-key your-key-name
```

### 2. Firewall

```bash
hcloud firewall create --name retrocycles-firewall
hcloud firewall add-rule retrocycles-firewall \
  --direction in --protocol tcp --port 22 --source-ips 0.0.0.0/0
hcloud firewall add-rule retrocycles-firewall \
  --direction in --protocol tcp --port 8080 --source-ips 0.0.0.0/0
hcloud firewall add-rule retrocycles-firewall \
  --direction in --protocol udp --port 4534 --source-ips 0.0.0.0/0
```

---

## Generic Linux VPS

### Quick Install Script

```bash
#!/bin/bash
# save as install-agent.sh and run: chmod +x install-agent.sh && ./install-agent.sh

set -e

# Configuration
AGENT_PORT=${AGENT_PORT:-8080}
AGENT_TOKEN=${AGENT_TOKEN:-$(openssl rand -hex 32)}
AGENT_JWT_SECRET=${AGENT_JWT_SECRET:-$(openssl rand -hex 32)}
INSTALL_DIR=${INSTALL_DIR:-/opt/retrocycles-agent}

# Update system
sudo apt update && sudo apt upgrade -y

# Install dependencies
sudo apt install -y nodejs npm git build-essential

# Install Armagetron (optional - if running game servers on this host)
sudo apt install -y armagetronad-dedicated || true

# Create directory
sudo mkdir -p $INSTALL_DIR
sudo chown $USER:$USER $INSTALL_DIR

# Clone and build
cd $INSTALL_DIR
git clone https://github.com/your-repo/retrocycles-panel.git .
cd agent
npm install
npm run build

# Create environment
cat > .env << EOF
AGENT_PORT=$AGENT_PORT
AGENT_TOKEN=$AGENT_TOKEN
AGENT_JWT_SECRET=$AGENT_JWT_SECRET
AGENT_DB_DIR=$INSTALL_DIR/data
EOF

# Create systemd service
sudo tee /etc/systemd/system/retrocycles-agent.service << EOF
[Unit]
Description=RetroCycles Agent
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$INSTALL_DIR/agent
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=5
EnvironmentFile=$INSTALL_DIR/agent/.env

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable retrocycles-agent
sudo systemctl start retrocycles-agent

echo "==================================="
echo "Agent installed successfully!"
echo "Agent URL: http://$(curl -s ifconfig.me):$AGENT_PORT"
echo "Agent Token: $AGENT_TOKEN"
echo "==================================="
```

---

## Docker Deployment

### Using Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  agent:
    build:
      context: ./agent
      dockerfile: Dockerfile.agent
    container_name: retrocycles-agent
    restart: unless-stopped
    ports:
      - "8080:8080"
      - "4534:4534/udp"
    environment:
      - AGENT_PORT=8080
      - AGENT_TOKEN=${AGENT_TOKEN}
      - AGENT_JWT_SECRET=${AGENT_JWT_SECRET}
    volumes:
      - ./data:/app/data
      - /usr/share/armagetronad:/game:ro
    networks:
      - retrocycles

  panel:
    image: nginx:alpine
    container_name: retrocycles-panel
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./dist:/usr/share/nginx/html:ro
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
    networks:
      - retrocycles

networks:
  retrocycles:
    driver: bridge
```

### Run

```bash
# Set environment variables
export AGENT_TOKEN=$(openssl rand -hex 32)
export AGENT_JWT_SECRET=$(openssl rand -hex 32)

# Start
docker-compose up -d

# View logs
docker-compose logs -f agent
```

---

## Firewall Configuration

### Required Ports

| Port | Protocol | Purpose |
|------|----------|---------|
| 22 | TCP | SSH access |
| 80 | TCP | HTTP (panel) |
| 443 | TCP | HTTPS (panel) |
| 8080 | TCP | Agent API + WebSocket |
| 4534 | UDP | Armagetron game server |
| 4533 | UDP | Master server query |

### UFW (Ubuntu)

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 8080/tcp
sudo ufw allow 4534/udp
sudo ufw allow 4533/udp
sudo ufw enable
```

### firewalld (CentOS/RHEL)

```bash
sudo firewall-cmd --permanent --add-service=ssh
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --permanent --add-port=8080/tcp
sudo firewall-cmd --permanent --add-port=4534/udp
sudo firewall-cmd --permanent --add-port=4533/udp
sudo firewall-cmd --reload
```

---

## SSL / HTTPS

### Using Let's Encrypt + Certbot

```bash
# Install certbot
sudo apt install -y certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal is set up automatically
```

### Using Nginx Reverse Proxy

```nginx
# /etc/nginx/sites-available/retrocycles
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # Panel (static files)
    location / {
        root /var/www/retrocycles-panel/dist;
        try_files $uri $uri/ /index.html;
    }

    # Agent proxy (optional - if agent is on same host)
    location /agent/ {
        proxy_pass http://localhost:8080/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

---

## Troubleshooting

### Agent won't start

```bash
# Check logs
sudo journalctl -u retrocycles-agent -f

# Check if port is in use
sudo lsof -i :8080

# Test manually
cd /opt/retrocycles-agent/agent
node dist/index.js
```

### Can't connect to agent from panel

```bash
# Test from your local machine
curl -H "Authorization: Bearer YOUR_AGENT_TOKEN" http://YOUR_VPS_IP:8080/health

# Check firewall
sudo ufw status
sudo iptables -L

# Check if agent is listening
sudo ss -tlnp | grep 8080
```

### Game server won't start

```bash
# Check if binary exists
which armagetronad-dedicated
armagetronad-dedicated --version

# Check permissions
ls -la /usr/bin/armagetronad-dedicated

# Test manually
armagetronad-dedicated --datadir /usr/share/armagetronad
```

### WebSocket connection fails

```bash
# WebSocket uses the same port as HTTP
# Ensure your firewall allows the connection
# If using a reverse proxy, ensure WebSocket upgrade headers are passed
```

### Database issues

```bash
# Check SQLite database
sqlite3 /opt/retrocycles-agent/data/agent.db ".tables"

# Check disk space
df -h
```

---

## Security Best Practices

1. **Use strong tokens**: Generate with `openssl rand -hex 32`
2. **Restrict agent access**: Firewall the agent port to your panel IP only
3. **Use HTTPS**: Always use SSL for the panel
4. **Regular updates**: Keep the OS and Node.js updated
5. **Fail2ban**: Install to prevent brute force SSH attacks
6. **Non-root user**: Run the agent as a dedicated user
7. **Audit logs**: Review agent audit logs regularly

---

## Multi-Region Setup

For global coverage, deploy agents in multiple regions:

```
Panel (Supabase) → Global
├── Agent US-East (NYC) → US players
├── Agent EU-Central (Frankfurt) → EU players
├── Agent Asia-Pacific (Singapore) → Asia players
└── Agent South America (São Paulo) → SA players
```

Each agent manages local game servers. The panel connects to all agents.
