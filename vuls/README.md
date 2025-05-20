# Vuls Vulnerability Scanner

This directory contains the configuration for the Vuls vulnerability scanner used by LinuxControlHub.

## Overview

[Vuls](https://vuls.io/) is an agent-less vulnerability scanner for Linux/FreeBSD systems that detects:

- OS packages vulnerabilities
- Library vulnerabilities (for programming languages)
- Kernel vulnerabilities
- Container image vulnerabilities

## Directory Structure

- `Dockerfile` - Multi-stage build for Vuls server with pre-fetched CVE data
- `config.toml` - Base configuration file for Vuls
- `results/` - Directory where scan results are stored

## Using the Vuls Container

The Vuls container is configured to run in server mode, which allows LinuxControlHub to trigger scans via API calls. The configuration for specific servers is generated dynamically by the application.

### Expanding CVE Database Coverage

By default, the container only includes CVE data for the current year to keep the build time reasonable. To expand the database coverage:

1. Access the Vuls container:
   ```bash
   docker exec -it linuxservermanager-vuls /bin/sh
   ```

2. Add more years to the CVE database:
   ```bash
   cd /var/lib/vuls
   for y in $(seq 2020 2023); do
     go-cve-dictionary fetch nvd $y
     go-cve-dictionary fetch jvn $y
   done
   ```

### Customizing Vuls Configuration

If you need to customize the base Vuls configuration, you can edit the `config.toml` file in this directory. The file is mounted into the container at runtime.

### Testing a Manual Scan

To test a scan manually:

1. Create a test config file:
   ```bash
   echo '[servers.test]
   host = "your-server-ip"
   port = "22"
   user = "username"
   keyPath = "/root/.ssh/your-key-file"
   ' > /vuls/test-config.toml
   ```

2. Run a scan:
   ```bash
   vuls scan -config=/vuls/test-config.toml
   ```

3. View the results:
   ```bash
   vuls report -format-json -config=/vuls/test-config.toml
   ```

## Troubleshooting

### Common Issues

1. **Connection errors to remote servers:**
   - Ensure SSH keys are properly placed in the `/ssh-keys` directory
   - Verify the user has SSH access to the server
   - Check if firewall rules allow SSH connections

2. **Scan fails with database errors:**
   - The vulnerability databases may not be fully initialized
   - Run the database initialization commands shown above

3. **Slow scanning performance:**
   - Scanning many servers at once can be resource-intensive
   - Consider increasing the resources allocated to the container

For more detailed information about Vuls, see the [official documentation](https://vuls.io/docs/).