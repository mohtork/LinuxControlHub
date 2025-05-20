# Docker Deployment Guide for LinuxControlHub

This guide provides instructions for deploying LinuxControlHub using Docker and Docker Compose.

## Overview

LinuxControlHub can be easily deployed using Docker Compose, which sets up the following containers:

1. **app** - The main application container running the Node.js application
2. **db** - PostgreSQL database for storing application data
3. **vuls** - Vulnerability scanner container for security scanning

## Prerequisites

- Docker Engine (version 20.10.x or later)
- Docker Compose (version 2.x or later)
- Git (to clone the repository)

## Quick Start

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/linux-control-hub.git
   cd linux-control-hub
   ```

2. Create a `.env` file with necessary environment variables:
   ```bash
   cp .env.example .env
   ```

3. Create required directories:
   ```bash
   mkdir -p ansible ssh-keys vuls
   ```

4. Start the application:
   ```bash
   docker-compose up -d
   ```

5. Access the application:
   ```
   http://localhost:3000
   ```

## Environment Variables

Configure the following environment variables in your `.env` file:

```bash
# Database Configuration
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=linux_control_hub

# App Configuration
NODE_ENV=production
PORT=3000 
SESSION_SECRET=your_session_secret

# Initial Admin User
ADMIN_USERNAME=admin
ADMIN_PASSWORD=adminadmin
```

## Container Details

### App Container

The main application container runs the Node.js application. It mounts volumes for:

- `./client` - Frontend code
- `./server` - Backend code 
- `./shared` - Shared code and types
- `./ansible` - Ansible playbooks
- `./ssh-keys` - SSH keys for server access

### Database Container

PostgreSQL database for storing application data. It uses a named volume for data persistence:

- `postgres-data` - Database files

### Vuls Container

The Vuls vulnerability scanner container. It includes:

- A custom Dockerfile that builds and includes go-cve-dictionary
- Pre-fetched CVE data for the current year
- Volume mounts for SSH keys to scan remote servers

## Development Mode

The default Docker Compose configuration is set up for development mode, mounting the source code directories for hot reloading.

For production deployment, you should modify the volumes to use bind mounts or named volumes depending on your needs.

## Customizing the Deployment

### Using a Different Port

To use a different port, modify the port mapping in `docker-compose.yml`:

```yaml
ports:
  - "8080:3000"  # Change 8080 to your desired port
```

### Custom Database Credentials

Update the database credentials in the `.env` file:

```bash
POSTGRES_USER=your_custom_user
POSTGRES_PASSWORD=your_secure_password
POSTGRES_DB=your_database_name
```

## Initializing Vuls Databases

The provided Vuls container includes basic CVE data for the current year. For a more comprehensive database:

1. Access the Vuls container:
   ```bash
   docker exec -it linuxservermanager-vuls /bin/sh
   ```

2. Run the following commands:
   ```bash
   cd /var/lib/vuls
   for y in $(seq 2020 2024); do
     go-cve-dictionary fetch nvd $y
     go-cve-dictionary fetch jvn $y
   done
   ```

## Troubleshooting

### Common Issues

1. **Database Connection Errors**:
   - Check that the database container is running: `docker ps`
   - Verify database credentials in the `.env` file

2. **Container Won't Start**:
   - Check container logs: `docker logs linuxservermanager-app`
   - Ensure all environment variables are set correctly

3. **Vuls Not Working**:
   - Check container logs: `docker logs linuxservermanager-vuls`
   - Verify that the database initialization has completed

## Backup and Restore

### Backup

To backup the application data:

```bash
# Backup database
docker exec -it linuxservermanager-db pg_dump -U postgres linux_control_hub > backup.sql

# Backup SSH keys and Ansible playbooks
tar -czf linux-control-hub-backup.tar.gz backup.sql ssh-keys ansible
```

### Restore

To restore from backup:

```bash
# Restore database
cat backup.sql | docker exec -i linuxservermanager-db psql -U postgres linux_control_hub

# Restore files
tar -xzf linux-control-hub-backup.tar.gz
```

## Production Deployment Notes

For production deployment, consider the following:

1. **Use SSL/TLS**: Set up HTTPS with a reverse proxy like Nginx
2. **Implement Proper Backups**: Schedule regular database backups
3. **Monitor Containers**: Use Docker's health checks and monitoring tools
4. **Secure Environment Variables**: Use Docker secrets or a secure method to handle credentials
5. **Regular Updates**: Keep Docker images and dependencies updated