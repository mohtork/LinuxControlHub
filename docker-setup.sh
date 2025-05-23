#!/bin/bash
# LinuxControlHub Docker Setup Script

set -e # Exit on any error

# Text colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== LinuxControlHub Docker Setup Script ===${NC}"
echo -e "${YELLOW}This script will prepare directories and configuration for Docker deployment.${NC}"
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Docker is not installed. Please install Docker first.${NC}"
    echo "Visit https://docs.docker.com/get-docker/ for installation instructions."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}Docker Compose is not installed. Please install Docker Compose first.${NC}"
    echo "Visit https://docs.docker.com/compose/install/ for installation instructions."
    exit 1
fi

# Create required directories
echo -e "\n${GREEN}Creating required directories...${NC}"
mkdir -p ansible ssh-keys vuls vuls/results

# Set correct permissions
echo -e "\n${GREEN}Setting directory permissions...${NC}"
chmod 755 ansible ssh-keys vuls
chmod 700 ssh-keys  # More restrictive for SSH keys

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo -e "\n${GREEN}Creating .env file from template...${NC}"
    if [ -f .env.example ]; then
        cp .env.example .env
        echo -e "${YELLOW}Please edit the .env file to set your database credentials and other settings.${NC}"
    else
        echo -e "${RED}.env.example file not found. Creating a basic .env file...${NC}"
        cat > .env << EOF
# PostgreSQL Configuration
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=linux_control_hub
POSTGRES_HOST=db
POSTGRES_PORT=5432
DATABASE_URL=postgresql://postgres:postgres@db:5432/linux_control_hub

# Application Configuration
NODE_ENV=production
PORT=3000
SESSION_SECRET=$(openssl rand -base64 32)

# Initial Admin User
ADMIN_USERNAME=admin
ADMIN_PASSWORD=adminadmin

# Vuls Configuration
VULS_SERVICE_URL=http://vuls:5515
EOF
        echo -e "${YELLOW}A basic .env file has been created. Please edit it to change default credentials.${NC}"
    fi
fi

# Create a basic README for the ssh-keys directory
cat > ssh-keys/README.md << EOF
# SSH Keys Directory

Place your SSH private keys in this directory to allow the application to connect to your servers.

## Security Notes

- Keys placed here should be password-protected when possible
- Use dedicated keys for this application, not your personal keys
- Consider rotating keys periodically for better security
- The application will need to know the path to these keys, so name them descriptively

Example:
- server1.key - Key for Server 1
- prod-web.key - Key for Production Web Servers
EOF

# Create a basic README for the ansible directory
cat > ansible/README.md << EOF
# Ansible Playbooks Directory

Store your Ansible playbooks in this directory. The application will use these playbooks for automation tasks.

## Structure

You can organize playbooks however you prefer, but consider using a structure like:

- ansible/
  - playbooks/
    - webserver-setup.yml
    - database-backup.yml
  - roles/
    - common/
    - webserver/
    - database/
  - inventory/
    - production
    - staging

## Example Playbook

A simple playbook example:

\`\`\`yaml
---
- name: Update web servers
  hosts: web
  become: true
  tasks:
    - name: Update apt cache
      apt:
        update_cache: yes

    - name: Upgrade all packages
      apt:
        upgrade: dist
\`\`\`
EOF

# Create a simple Ansible config
cat > ansible/ansible.cfg << EOF
[defaults]
host_key_checking = False
inventory = inventory
roles_path = roles
timeout = 30
stdout_callback = yaml
EOF

# Check if the dockerfile exists
if [ ! -f Dockerfile ]; then
    echo -e "${YELLOW}Dockerfile not found. Please ensure you have the Dockerfile for the application.${NC}"
fi

echo -e "\n${GREEN}Setup complete!${NC}"
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Edit the .env file to set your credentials"
echo "2. Place your SSH keys in the ssh-keys directory"
echo "3. Add your Ansible playbooks to the ansible directory"
echo "4. Start the application with: docker-compose up -d"
echo "5. For production use: docker-compose -f docker-compose.prod.yml up -d"
echo ""
echo -e "${YELLOW}The application will be available at: http://localhost:3000${NC}"
echo -e "${RED}Default admin credentials: admin/adminadmin (change these immediately!)${NC}"