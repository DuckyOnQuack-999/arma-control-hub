# Quick Start Guide

## Option 1: Panel-Only (No Agent Required)

1. **Deploy the panel**
   ```bash
   npm install
   npm run build
   # Deploy dist/ to any static host (Vercel, Netlify, etc.)
   ```

2. **Set up Supabase**
   - Create a project at supabase.com
   - Run the migrations in `supabase/migrations/`
   - Set environment variables in `.env`

3. **Use the panel**
   - Create servers (simulated mode)
   - Manage configs, players, view console
   - No real process control

## Option 2: With Agent (Full Process Control)

### Step 1: Deploy Agent on VPS

Choose your provider:

| Provider | One-Line Deploy |
|----------|----------------|
| **Any VPS** | `curl -fsSL https://your-domain.com/install-agent.sh \| bash` |
| **Docker** | `docker-compose up -d` |
| **Manual** | See [VPS_SETUP.md](VPS_SETUP.md) |

Minimum requirements:
- 1 vCPU, 1GB RAM
- Ubuntu 20.04+, Debian 11+, CentOS 8+
- Node.js 20

### Step 2: Configure Panel

1. Go to **Host Settings** in the panel
2. Set **Agent URL**: `http://YOUR_VPS_IP:8080`
3. Set **Agent Token**: (from agent `.env` file)
4. Click **Test Connection**

### Step 3: Create Server with Agent

1. Click **Add Server**
2. Fill in server details
3. Set **Agent URL** to your VPS
4. Click **Create Server**
5. The agent will start the real process!

## Provider-Specific Guides

### Google Cloud Platform
```bash
gcloud compute instances create retrocycles-agent \
  --zone=us-central1-a --machine-type=e2-medium \
  --image-family=ubuntu-2204-lts --image-project=ubuntu-os-cloud
```

### AWS
```bash
aws ec2 run-instances --image-id ami-0c7217cdde317cfec \
  --instance-type t3.medium --key-name your-key
```

### DigitalOcean
```bash
doctl compute droplet create retrocycles-agent \
  --image ubuntu-22-04-x64 --size s-2vcpu-2gb --region nyc1
```

### Hetzner
```bash
hcloud server create --name retrocycles-agent \
  --type cx21 --image ubuntu-22.04 --location nbg1
```

### Vultr
```bash
vultr instance create --label retrocycles-agent \
  --region ewr --plan vc2-1c-2gb --os 1743
```

## Firewall Rules

| Port | Protocol | Purpose |
|------|----------|---------|
| 22 | TCP | SSH |
| 80 | TCP | HTTP (panel) |
| 443 | TCP | HTTPS (panel) |
| 8080 | TCP | Agent API + WebSocket |
| 4534 | UDP | Game server |
| 4533 | UDP | Master server query |

## Environment Variables

### Panel (.env)
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### Agent (.env)
```env
AGENT_PORT=8080
AGENT_TOKEN=your-secure-token
AGENT_JWT_SECRET=your-jwt-secret
AGENT_DB_DIR=./data
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Can't create server | Check you're logged in. Verify RLS policies. |
| Agent connection failed | Check firewall, verify token, test with `curl` |
| Game won't start | Verify binary path, check permissions |
| WebSocket fails | Ensure port 8080 is open, check nginx proxy headers |
| No console output | Check agent logs: `journalctl -u retrocycles-agent -f` |

## Support

- Full VPS setup: See [VPS_SETUP.md](VPS_SETUP.md)
- API reference: See README.md
- Agent docs: See agent/README.md
