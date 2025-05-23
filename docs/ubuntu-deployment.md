# Ubuntu Deployment Guide for LinuxControlHub

This guide provides instructions for deploying LinuxControlHub on Ubuntu 22.04 or 24.04 LTS.

## Deployment Options

There are two deployment options:

1. **Automated Deployment** - Using the `deploy-ubuntu.sh` script
2. **Manual Deployment** - Using the `deploy-ubuntu-manual.sh` script with manual steps

## Option 1: Automated Deployment

The `deploy-ubuntu.sh` script automates the entire deployment process, including:

- Installing all required dependencies
- Setting up PostgreSQL database
- Building the application
- Configuring systemd services for the application and Vuls
- Setting up Nginx as a reverse proxy
- Initializing Vuls vulnerability databases

### Prerequisites

- Ubuntu 22.04 or 24.04 LTS
- Root or sudo access
- Git (to clone the repository)
- Internet connection

### Deployment Steps

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/linux-control-hub.git
   cd linux-control-hub
   ```

2. Run the deployment script:
   ```bash
   sudo ./deploy-ubuntu.sh
   ```

3. Follow the on-screen prompts.

4. Once installation is complete, access LinuxControlHub at:
   ```
   http://your-server-ip
   ```

5. Log in with the default credentials (change these immediately):
   - Username: admin
   - Password: adminadmin

### Configuration

The script generates a `.env` file with default settings. You can modify these settings before starting the application:

- Database credentials
- Application port (default: 3000 for production, 5000 for development)
- Admin username and password
- Session secret

## Option 2: Manual Deployment

If you prefer more control over the deployment process, you can use the `deploy-ubuntu-manual.sh` script, which only installs the required dependencies. You'll need to perform the remaining steps manually.

### Prerequisites

Same as for automated deployment.

### Deployment Steps

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/linux-control-hub.git
   cd linux-control-hub
   ```

2. Run the dependencies installation script:
   ```bash
   sudo ./deploy-ubuntu-manual.sh
   ```

3. Follow the on-screen instructions for manual steps.

## System Requirements

- Minimum 2GB RAM (4GB recommended)
- 2 CPU cores (4 cores recommended)
- 20GB disk space

## Post-Installation Steps

After installation, you should:

1. **Change the default admin password**
2. **Configure SSH keys** in the `/opt/linux-control-hub/ssh-keys` directory
3. **Set up Ansible playbooks** in the `/opt/linux-control-hub/ansible` directory
4. **Configure firewall** to allow HTTP/HTTPS access:
   ```bash
   sudo ufw allow 'Nginx Full'
   sudo ufw enable
   ```
5. **Set up SSL** (recommended for production):
   ```bash
   sudo apt install certbot python3-certbot-nginx
   sudo certbot --nginx -d yourdomain.com
   ```

## Managing the Application

### View Application Logs

```bash
sudo journalctl -u linux-control-hub
```

### Restart the Application

```bash
sudo systemctl restart linux-control-hub
```

### Stop the Application

```bash
sudo systemctl stop linux-control-hub
```

### Check Application Status

```bash
sudo systemctl status linux-control-hub
```

## Managing Vuls

### View Vuls Logs

```bash
sudo journalctl -u vuls
```

### Restart Vuls

```bash
sudo systemctl restart vuls
```

### Update Vulnerability Databases

To update vulnerability databases (recommended weekly):

```bash
cd /opt/linux-control-hub
go-cve-dictionary fetch nvd -dbpath ./vuls-db
goval-dictionary fetch ubuntu -dbpath ./vuls-db
goval-dictionary fetch debian -dbpath ./vuls-db
go-exploitdb fetch -dbpath ./vuls-db
go-msfdb fetch -dbpath ./vuls-db
gost fetch debian -dbpath ./vuls-db
```

## Troubleshooting

### Application Not Starting

Check the application logs:
```bash
sudo journalctl -u linux-control-hub
```

Common issues:
- Database connection problems
- Port conflicts
- Permission issues

### Vuls Not Working

Check Vuls logs:
```bash
sudo journalctl -u vuls
```

Make sure vulnerability databases are initialized:
```bash
ls -la /opt/linux-control-hub/vuls-db
```

### Database Issues

Check PostgreSQL status:
```bash
sudo systemctl status postgresql
```

Check database logs:
```bash
sudo tail -f /var/log/postgresql/postgresql-*.log
```

## Backup and Restore

### Backup

To backup the application data:
```bash
# Backup database
sudo -u postgres pg_dump linuxcontrolhub > linuxcontrolhub_backup.sql

# Backup configuration and data
sudo tar -czf linux-control-hub-backup.tar.gz /opt/linux-control-hub
```

### Restore

To restore from backup:
```bash
# Restore database
cat linuxcontrolhub_backup.sql | sudo -u postgres psql linuxcontrolhub

# Restore configuration and data
sudo tar -xzf linux-control-hub-backup.tar.gz -C /
```

## Security Considerations

1. **Change default credentials** immediately after installation
2. **Configure SSL/TLS** for secure HTTPS access
3. **Restrict SSH access** to the server
4. **Implement a firewall** using ufw
5. **Keep the system updated** with security patches
6. **Set up regular backups**

## Additional Resources

- [Full Documentation](../README.md)
- [Vuls Setup Guide](./vuls-setup.md)
- [Docker Deployment Guide](./docker-setup.md)