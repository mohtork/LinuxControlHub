#!/bin/bash
# Simple development setup script for LinuxControlHub

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "Docker is not installed. Please install Docker and try again."
    exit 1
fi

# Start PostgreSQL database
echo "Starting PostgreSQL container..."
docker run -d \
  --name linux-control-hub-db \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=linux_control_hub \
  -p 5432:5432 \
  postgres:16-alpine

# Wait for PostgreSQL to start
echo "Waiting for PostgreSQL to be ready..."
sleep 5
attempts=0
max_attempts=30
while ! docker exec linux-control-hub-db pg_isready -U postgres &> /dev/null && [ $attempts -lt $max_attempts ]; do
    attempts=$((attempts+1))
    echo "Waiting for PostgreSQL to be ready... Attempt $attempts/$max_attempts"
    sleep 2
done

if [ $attempts -eq $max_attempts ]; then
    echo "PostgreSQL did not become ready in time. Please check the container logs."
    exit 1
fi

echo "PostgreSQL is now running on port 5432"
echo "PostgreSQL connection string: postgresql://postgres:postgres@localhost:5432/linux_control_hub"

# Start Vuls server if needed
echo "Do you want to start the Vuls server for vulnerability scanning? (y/n)"
read -r start_vuls
if [[ "$start_vuls" == "y" || "$start_vuls" == "Y" ]]; then
    echo "Starting Vuls container..."
    
    # Ensure the necessary directories exist
    mkdir -p ansible
    mkdir -p vuls-results
    mkdir -p vuls-db
    
    # Create an empty config.toml if it doesn't exist
    if [ ! -f ansible/config.toml ]; then
      cat > ansible/config.toml << EOF
# Empty placeholder config for Vuls server
# Real configs will be created per scan
[servers]
EOF
      echo "Created empty config.toml file"
    fi
    
    # Run the Vuls container with the empty config.toml mounted
    docker run -d \
      --name linux-control-hub-vuls \
      -p 5515:5515 \
      -v "$PWD/ansible/config.toml:/vuls/config.toml" \
      -v "$PWD/vuls-results:/vuls/results" \
      -v "$PWD/vuls-db:/vuls" \
      --entrypoint /bin/sh \
      vuls/vuls:latest \
      -c "echo 'Starting Vuls server without initializing databases...' && \
          echo 'Note: For full vulnerability scanning, databases should be initialized separately using go-cve-dictionary' && \
          vuls server -listen=0.0.0.0:5515 -results-dir=/vuls/results"
    
    echo "Vuls server is now running on port 5515"
    echo "Set VULS_SERVICE_URL=http://localhost:5515 in your .env file if needed"
fi

echo ""
echo "Development environment is ready!"
echo "Run 'npm install' to install dependencies if you haven't already."
echo "Run 'npm run dev' to start the application in development mode."
echo ""
echo "To stop the containers, run:"
echo "docker stop linux-control-hub-db linux-control-hub-vuls 2>/dev/null || true"
echo "docker rm linux-control-hub-db linux-control-hub-vuls 2>/dev/null || true"