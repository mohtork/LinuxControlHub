#!/bin/bash
# Script to update Vuls vulnerability databases in the running Vuls container
# This script can be run periodically (e.g., via cron) to keep databases up-to-date

# Set the container name
CONTAINER_NAME="linux_control_hub-vuls-1"

# Check if the container is running
if ! docker ps | grep -q "$CONTAINER_NAME"; then
  echo "ERROR: Vuls container '$CONTAINER_NAME' is not running"
  exit 1
fi

echo "Updating Ubuntu vulnerability database..."
docker exec $CONTAINER_NAME vuls fetch ubuntu --dbpath=/vuls/db

echo "Updating Red Hat vulnerability database..."
docker exec $CONTAINER_NAME vuls fetch redhat --dbpath=/vuls/db

echo "Vulnerability databases updated successfully"