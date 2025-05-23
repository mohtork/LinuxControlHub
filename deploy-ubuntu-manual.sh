#!/bin/bash
# LinuxControlHub Manual Deployment Script for Ubuntu
# This script installs dependencies but requires manual compilation steps

set -e # Exit on any error

# Text colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== LinuxControlHub Manual Deployment Script ===${NC}"
echo -e "${YELLOW}This script will install dependencies for LinuxControlHub on Ubuntu.${NC}"
echo -e "${YELLOW}You will need to manually compile and start the application.${NC}"
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

echo -e "\n${GREEN}5. Starting PostgreSQL...${NC}"
systemctl enable postgresql
systemctl start postgresql

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

echo -e "\n${GREEN}8. Installation of dependencies complete!${NC}"
echo -e "${YELLOW}=== MANUAL STEPS REQUIRED ===${NC}"
echo ""
echo -e "1. Create a PostgreSQL database and user:"
echo -e "   sudo -u postgres psql -c \"CREATE USER lchuser WITH PASSWORD 'your_password';\""
echo -e "   sudo -u postgres psql -c \"CREATE DATABASE linuxcontrolhub;\""
echo -e "   sudo -u postgres psql -c \"GRANT ALL PRIVILEGES ON DATABASE linuxcontrolhub TO lchuser;\""
echo -e "   sudo -u postgres psql -c \"ALTER USER lchuser WITH SUPERUSER;\""
echo ""
echo -e "2. Set up your environment file (.env):"
echo -e "   DATABASE_URL=postgresql://lchuser:your_password@localhost:5432/linuxcontrolhub"
echo -e "   PGUSER=lchuser"
echo -e "   PGHOST=localhost"
echo -e "   PGPASSWORD=your_password"
echo -e "   PGDATABASE=linuxcontrolhub"
echo -e "   PGPORT=5432"
echo -e "   PORT=3000  # Use 3000 for production"
echo -e "   NODE_ENV=production"
echo -e "   SESSION_SECRET=generate_random_secret"
echo -e "   ADMIN_USERNAME=admin"
echo -e "   ADMIN_PASSWORD=adminadmin"
echo -e "   VULS_SERVICE_URL=http://localhost:5515"
echo ""
echo -e "3. Build and start the application:"
echo -e "   npm install"
echo -e "   npm run build"
echo -e "   npm run db:push   # Initialize database schema"
echo -e "   node dist/server/index.js"
echo ""
echo -e "4. Initialize Vuls vulnerability databases:"
echo -e "   mkdir -p vuls-db"
echo -e "   go-cve-dictionary fetch nvd -dbpath ./vuls-db"
echo -e "   goval-dictionary fetch ubuntu -dbpath ./vuls-db"
echo -e "   goval-dictionary fetch debian -dbpath ./vuls-db"
echo -e "   go-exploitdb fetch -dbpath ./vuls-db"
echo -e "   go-msfdb fetch -dbpath ./vuls-db"
echo -e "   gost fetch debian -dbpath ./vuls-db"
echo ""
echo -e "5. Start Vuls server:"
echo -e "   vuls server -listen=0.0.0.0:5515 -dbpath=./vuls-db"
echo ""
echo -e "6. Optional - Set up Nginx reverse proxy:"
echo -e "   Create a config file in /etc/nginx/sites-available/ and enable it"
echo ""
echo -e "${GREEN}For systemd service setup and complete automation, use the deploy-ubuntu.sh script instead.${NC}"