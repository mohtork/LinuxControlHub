# Vuls Integration for Vulnerability Scanning

This document explains how LinuxControlHub integrates with [Vuls](https://vuls.io/) - an open-source, agent-less vulnerability scanner for Linux/FreeBSD.

## Overview

The vulnerability scanning feature in LinuxControlHub uses Vuls to detect security vulnerabilities in your Linux servers. The integration allows you to:

1. Scan servers for known security vulnerabilities (CVEs)
2. Get detailed information on each vulnerability
3. Track vulnerability fixes over time
4. Prioritize patches based on severity

## Architecture

The system implements vulnerability scanning with a three-tiered approach:

1. **Dedicated Vuls Service** (primary): A standalone Vuls service running as a Docker container with persistent vulnerability databases for Ubuntu and RHEL.
2. **On-Demand Docker Scanning** (fallback): If the Vuls service is unavailable, the system will launch Docker containers on demand to perform scans.
3. **Simulated Scanning** (last resort): If Docker is not available, a simulation mode provides basic vulnerability detection.

## Dedicated Vuls Service

LinuxControlHub includes a dedicated Vuls service that runs as part of the Docker Compose architecture. This service:

1. Maintains up-to-date vulnerability databases for supported Linux distributions
2. Exposes a REST API for scanning operations
3. Persists configuration and results in shared volumes
4. Can scan any server accessible via SSH

This architecture provides several advantages:

1. **Persistence**: Vulnerability databases are maintained between restarts
2. **Efficiency**: No need to fetch vulnerability databases for each scan
3. **Performance**: Faster scanning with pre-loaded databases
4. **Consistency**: All scans use the same version and configuration

## Supported Operating Systems

The Vuls service specifically maintains vulnerability databases for:

1. Ubuntu 22.04/24.04
2. Red Hat Enterprise Linux (RHEL) 8/9

Support for additional distributions can be added by modifying the Vuls service configuration.

## How It Works

The Vuls integration operates as follows:

1. **REST API Communication**: The application communicates with the Vuls service via its REST API.

2. **Configuration Generation**: A Vuls-compatible TOML configuration file is generated for the target server.

3. **SSH Key Sharing**: The system shares SSH keys with the Vuls service to authenticate with target servers.

4. **Scan Execution**: The Vuls service performs the scan and returns results to the application.

5. **Result Processing**: Vulnerability information is parsed and saved to the database.

## Scanning Details

The scanner gathers the following information about each vulnerability:

- **CVE ID**: The Common Vulnerabilities and Exposures identifier
- **Package Name**: The affected software package
- **Severity**: How critical the vulnerability is (low, medium, high, critical)
- **CVSS Score**: The Common Vulnerability Scoring System score (0-10)
- **Summary**: A brief description of the vulnerability
- **Detected Version**: The vulnerable version detected on the server
- **Fixed Version**: The version where the vulnerability is fixed
- **Fix Available**: Whether a fix exists for this vulnerability

## Running a Scan

To run a vulnerability scan:

1. Navigate to any server details page
2. Click the "Scan for Vulnerabilities" button
3. Wait for the scan to complete (this may take several minutes)
4. View the results in the "Vulnerabilities" tab

## Requirements

For the Vuls integration to work:

1. The Vuls service container must be running (automatically provided in Docker Compose)
2. Target servers must be accessible via SSH
3. SSH keys must have appropriate permissions (600)
4. Target servers must run one of the supported Linux distributions

## Troubleshooting

If you encounter issues with vulnerability scanning:

- Check that the Vuls service container is running (`docker ps`)
- Verify that your server is accessible via SSH
- Ensure SSH keys are properly configured
- Check task logs for detailed error information

## Future Enhancements

Planned improvements to the vulnerability scanning feature:

- Support for additional Linux distributions
- Container and container image scanning
- Integration with additional vulnerability databases
- Automated remediation suggestions
- Vulnerability trend reporting
- Scheduled regular scanning