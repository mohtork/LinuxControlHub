#!/bin/bash
# LinuxControlHub Ubuntu Deployment Script
# This script automates the deployment of LinuxControlHub on Ubuntu 22.04/24.04

set -e # Exit on any error

# Configuration variables (modify these as needed)
APP_DIR="/opt/linux-control-hub"
POSTGRES_USER="lchuser"
POSTGRES_PASSWORD="$(openssl rand -base64 24)"
POSTGRES_DB="linuxcontrolhub"
APP_PORT=3000 # Production port (development uses 5000)
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="adminadmin" # Change this!
SESSION_SECRET="$(openssl rand -base64 32)"
NODE_ENV="production"

# Text colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== LinuxControlHub Deployment Script ===${NC}"
echo -e "${YELLOW}This script will install and configure LinuxControlHub on Ubuntu.${NC}"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Please run this script as root or with sudo.${NC}"
  exit 1
fi

# Confirm installation
read -p "Continue with installation? (y/n): " confirm
if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
  echo "Deployment aborted."
  exit 0
fi

echo -e "\n${GREEN}1. Updating system packages...${NC}"
apt update
apt upgrade -y

echo -e "\n${GREEN}2. Installing core dependencies...${NC}"
apt install -y curl wget git build-essential nginx ssh python3-pip python3-venv

echo -e "\n${GREEN}3. Installing Node.js 20.x...${NC}"
if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt install -y nodejs
  echo "Node.js installed: $(node -v)"
else
  echo "Node.js already installed: $(node -v)"
fi

echo -e "\n${GREEN}4. Installing PostgreSQL...${NC}"
apt install -y postgresql postgresql-contrib

echo -e "\n${GREEN}5. Setting up PostgreSQL database...${NC}"
# Start PostgreSQL if not already running
systemctl enable postgresql
systemctl start postgresql

# Create database and user
sudo -u postgres psql -c "CREATE USER $POSTGRES_USER WITH PASSWORD '$POSTGRES_PASSWORD';"
sudo -u postgres psql -c "CREATE DATABASE $POSTGRES_DB;"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $POSTGRES_DB TO $POSTGRES_USER;"
sudo -u postgres psql -c "ALTER USER $POSTGRES_USER WITH SUPERUSER;"
echo "PostgreSQL database and user created successfully."

echo -e "\n${GREEN}6. Installing Ansible...${NC}"
apt install -y ansible
echo "Ansible installed: $(ansible --version | head -n1)"

echo -e "\n${GREEN}7. Setting up Vuls dependencies...${NC}"
apt install -y golang
export GOPATH=$HOME/go
export PATH=$PATH:$GOPATH/bin

go install github.com/kotakanbe/go-cve-dictionary/cmd/go-cve-dictionary@latest
go install github.com/kotakanbe/goval-dictionary/cmd/goval-dictionary@latest
go install github.com/vulsio/gost/cmd/gost@latest
go install github.com/vulsio/go-exploitdb/cmd/go-exploitdb@latest
go install github.com/vulsio/go-msfdb/cmd/go-msfdb@latest
go install github.com/vulsio/vuls/cmd/vuls@latest

echo -e "\n${GREEN}8. Cloning LinuxControlHub repository...${NC}"
mkdir -p "$APP_DIR"
cd "$APP_DIR"

# Clone repository or extract app files here
# For demo purposes, let's assume we'll clone from the current directory (update this with your repo URL)
if [ -d ".git" ]; then
  echo "Copying project files from current directory..."
  cp -r . "$APP_DIR/"
else
  echo "Please place LinuxControlHub files in $APP_DIR and run this script from that directory."
  exit 1
fi

echo -e "\n${GREEN}9. Creating application directories...${NC}"
mkdir -p "$APP_DIR/logs"
mkdir -p "$APP_DIR/ansible"
mkdir -p "$APP_DIR/ssh-keys"
mkdir -p "$APP_DIR/vuls-db"
chmod -R 755 "$APP_DIR/ansible" "$APP_DIR/ssh-keys"

echo -e "\n${GREEN}10. Installing Node.js dependencies...${NC}"
cd "$APP_DIR"
npm ci --production

echo -e "\n${GREEN}11. Setting up environment configuration...${NC}"
cat > "$APP_DIR/.env" << EOF
# Database Configuration
DATABASE_URL=postgresql://$POSTGRES_USER:$POSTGRES_PASSWORD@localhost:5432/$POSTGRES_DB
PGUSER=$POSTGRES_USER
PGHOST=localhost
PGPASSWORD=$POSTGRES_PASSWORD
PGDATABASE=$POSTGRES_DB
PGPORT=5432

# App Configuration
PORT=$APP_PORT
NODE_ENV=$NODE_ENV
SESSION_SECRET=$SESSION_SECRET

# Initial Admin User
ADMIN_USERNAME=$ADMIN_USERNAME
ADMIN_PASSWORD=$ADMIN_PASSWORD

# Vuls Configuration
VULS_SERVICE_URL=http://localhost:5515
EOF

echo -e "\n${GREEN}12. Setting up Vuls configuration...${NC}"
mkdir -p "$APP_DIR/vuls-config"
cat > "$APP_DIR/vuls-config/config.toml" << EOF
[servers]
# Server configuration will be generated at runtime
EOF

echo -e "\n${GREEN}13. Setting up database schema...${NC}"
cd "$APP_DIR"
npm run db:push

echo -e "\n${GREEN}14. Building the application...${NC}"
npm run build

echo -e "\n${GREEN}15. Setting up systemd service for LinuxControlHub...${NC}"
cat > /etc/systemd/system/linux-control-hub.service << EOF
[Unit]
Description=LinuxControlHub Application
After=network.target postgresql.service

[Service]
Type=simple
User=root
WorkingDirectory=$APP_DIR
ExecStart=$(which node) $APP_DIR/dist/server/index.js
Restart=on-failure
Environment=NODE_ENV=production
Environment=PORT=$APP_PORT

[Install]
WantedBy=multi-user.target
EOF

echo -e "\n${GREEN}16. Setting up systemd service for Vuls...${NC}"
cat > /etc/systemd/system/vuls.service << EOF
[Unit]
Description=Vuls Vulnerability Scanner
After=network.target

[Service]
Type=simple
User=root
ExecStart=$(which vuls) server -listen=0.0.0.0:5515 -dbpath=$APP_DIR/vuls-db
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF

echo -e "\n${GREEN}17. Setting up Nginx as reverse proxy...${NC}"
cat > /etc/nginx/sites-available/linux-control-hub << EOF
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://localhost:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }

    location /ws {
        proxy_pass http://localhost:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host \$host;
    }
}
EOF

# Enable the site
ln -sf /etc/nginx/sites-available/linux-control-hub /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test nginx configuration
nginx -t

echo -e "\n${GREEN}18. Initializing Vuls databases...${NC}"
mkdir -p "$APP_DIR/vuls-db"

echo "Initializing CVE dictionary database (this may take time)..."
go-cve-dictionary fetch nvd -dbpath "$APP_DIR/vuls-db"

echo "Initializing OVAL databases..."
for dist in ubuntu debian redhat amazon; do
  echo "Fetching OVAL database for $dist..."
  goval-dictionary fetch $dist -dbpath "$APP_DIR/vuls-db"
done

echo "Initializing exploit database..."
go-exploitdb fetch -dbpath "$APP_DIR/vuls-db"

echo "Initializing Metasploit database..."
go-msfdb fetch -dbpath "$APP_DIR/vuls-db"

echo "Initializing GOST database..."
gost fetch debian -dbpath "$APP_DIR/vuls-db"

echo -e "\n${GREEN}19. Starting services...${NC}"
systemctl daemon-reload
systemctl enable nginx
systemctl restart nginx
systemctl enable linux-control-hub
systemctl start linux-control-hub
systemctl enable vuls
systemctl start vuls

echo -e "\n${GREEN}20. Installation complete!${NC}"
echo -e "${YELLOW}LinuxControlHub is now available at: http://$(hostname -I | awk '{print $1}')${NC}"
echo -e "${YELLOW}Default admin credentials: username=${ADMIN_USERNAME}, password=${ADMIN_PASSWORD}${NC}"
echo -e "${RED}IMPORTANT: Please change the default admin password after logging in!${NC}"

echo -e "\n${GREEN}Database details:${NC}"
echo "Database: $POSTGRES_DB"
echo "Username: $POSTGRES_USER"
echo "Password: $POSTGRES_PASSWORD"
echo "These credentials are saved in $APP_DIR/.env"

echo -e "\n${YELLOW}If you encounter any issues:${NC}"
echo "1. Check application logs: journalctl -u linux-control-hub"
echo "2. Check Vuls logs: journalctl -u vuls"
echo "3. Check Nginx logs: /var/log/nginx/error.log"