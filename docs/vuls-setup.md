# Vuls Integration Setup Guide

This guide explains how to set up the Vuls vulnerability scanner integration with LinuxControlHub.

## Overview

LinuxControlHub uses Vuls (https://vuls.io/) for vulnerability scanning of Linux servers. Vuls is an open-source, agent-less vulnerability scanner for Linux/FreeBSD systems.

## Setup Options

### Option 1: Docker Compose (Recommended)

1. The Vuls server is included in the `docker-compose.yml` file
2. Start the application with: `docker-compose up -d`
3. Initialize the vulnerability databases: `./initialize-vuls-db.sh`
   - Note: This process may take 30+ minutes as it downloads several vulnerability databases

### Option 2: Development Setup

1. Use the dev setup script: `./dev-setup.sh`
2. Answer "yes" when asked to start the Vuls server
3. Initialize the vulnerability databases: `./initialize-vuls-db.sh`

### Option 3: Standalone Vuls Server

If you have an existing Vuls server:

1. Set the environment variable `VULS_SERVICE_URL` to point to your Vuls server
2. Example: `VULS_SERVICE_URL=http://your-vuls-server:5515`

## Vulnerability Databases

Vuls relies on several vulnerability databases to function properly:

1. **NVD (National Vulnerability Database)** - Main source of CVE information
2. **OVAL (Open Vulnerability and Assessment Language)** - OS-specific vulnerability definitions
3. **Exploit DB** - Known exploits for vulnerabilities
4. **GOST** - Security tracker information
5. **MSF DB** - Metasploit module information

All these databases are initialized by running `./initialize-vuls-db.sh`.

## Troubleshooting

### Common Issues

1. **Vuls server not starting**: Check Docker logs with `docker logs replit-vuls-1`
2. **Missing databases**: Run `./initialize-vuls-db.sh` to initialize all databases
3. **Connection errors**: Ensure the Vuls server is accessible on port 5515

### Updating Databases

The vulnerability databases should be updated regularly:

```bash
./initialize-vuls-db.sh
```

## Using Without Vuls

If you prefer not to use Vuls, set the environment variable:

```
VULS_DISABLED=true
```

This will make LinuxControlHub operate without actual vulnerability scanning capabilities.