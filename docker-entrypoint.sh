#!/bin/bash
set -e

# Create necessary directories
mkdir -p logs ansible /app/ssh-keys

# Create tmp vuls config directory with proper permissions
mkdir -p /tmp/vuls-config 2>/dev/null || true
chmod -R 777 /tmp/vuls-config 2>/dev/null || true

# Create SSH key if it doesn't exist
if [ ! -f /app/ssh-keys/id_rsa ]; then
  echo "Generating SSH key..."
  ssh-keygen -t rsa -b 4096 -f /app/ssh-keys/id_rsa -N ""
  chmod 600 /app/ssh-keys/id_rsa
  chmod 644 /app/ssh-keys/id_rsa.pub
  echo "SSH key generated."
fi

# Activate Python virtual environment for Ansible
source /opt/ansible-venv/bin/activate

# Parse DATABASE_URL to determine if it's a local or remote database
if [[ "$DATABASE_URL" == *"@postgres:"* ]]; then
  # This is the local PostgreSQL container in Docker Compose
  echo "Detected local PostgreSQL container..."
  DB_HOST="postgres"
  WAIT_FOR_DB=true
elif [[ "$DATABASE_URL" == *".neon.tech"* ]]; then
  # This is a Neon database
  echo "Detected Neon PostgreSQL database..."
  WAIT_FOR_DB=false
else
  # Any other database
  echo "Detected external PostgreSQL database..."
  DB_HOST=$(echo "$DATABASE_URL" | sed -E 's|.*@([^:]+):.*|\1|')
  WAIT_FOR_DB=true
fi

if [ "$WAIT_FOR_DB" = true ]; then
  # Wait for PostgreSQL to be ready
  echo "Waiting for PostgreSQL to be ready..."
  export PGPASSWORD=$POSTGRES_PASSWORD
  max_retries=30
  retries=0

  while [ $retries -lt $max_retries ]; do
    if psql -h $DB_HOST -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c '\q' 2>/dev/null; then
      echo "PostgreSQL is up - executing command"
      break
    fi
    
    retries=$((retries+1))
    echo "PostgreSQL is unavailable - sleeping (attempt $retries/$max_retries)"
    sleep 3
    
    # After several retries, check if postgres container is actually running
    if [ $retries -eq 10 ] && [ "$DB_HOST" = "postgres" ]; then
      echo "Checking if postgres container is running..."
      if ping -c 1 postgres > /dev/null 2>&1; then
        echo "Postgres container is reachable on the network"
      else
        echo "WARNING: Cannot ping postgres container. Network issue detected."
      fi
    fi
  done

  if [ $retries -eq $max_retries ]; then
    echo "ERROR: Failed to connect to PostgreSQL after $max_retries attempts."
    echo "Check if the database service is running and the credentials are correct."
    echo "DATABASE_URL: ${DATABASE_URL//:\/\/[^:]*:[^@]*@/:\/\/USER:PASSWORD@}"
    
    # Continue anyway to allow for manual fixing
    echo "Continuing startup despite database connection issues..."
  fi
else
  echo "Skipping database connection check for Neon database..."
fi

# Set environment variables for Docker
export DOCKER_ENV=true
export DISABLE_SECURE_COOKIES=true

# Run database migrations if needed
echo "Running database migrations..."
npm run db:push

# Check if Ansible is installed
echo "Checking Ansible installation..."
ansible --version

# Start the application
echo "Starting LinuxControlHub..."
exec "$@"