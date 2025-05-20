#!/bin/bash
# Script to initialize the Vuls vulnerability databases

echo "This script initializes the vulnerability databases for Vuls"
echo "NOTE: This may take a significant amount of time (30+ minutes)"

# Make sure container is running
if ! docker ps --format '{{.Names}}' | grep -q 'linux-control-hub-vuls'; then
  echo "ERROR: Vuls container is not running. Start it first with docker-compose up -d vuls"
  exit 1
fi

# Create a temporary Dockerfile to build an image with go tools
cat > Dockerfile.vuls-tools << EOF
FROM vuls/vuls:latest

# Install Go
RUN apk add --no-cache go git

# Install go-cve-dictionary and other required tools
RUN go install github.com/kotakanbe/go-cve-dictionary/cmd/go-cve-dictionary@latest && \
    go install github.com/kotakanbe/goval-dictionary/cmd/goval-dictionary@latest && \
    go install github.com/vulsio/gost/cmd/gost@latest && \
    go install github.com/vulsio/go-exploitdb/cmd/go-exploitdb@latest && \
    go install github.com/vulsio/go-msfdb/cmd/go-msfdb@latest

ENV PATH=\$PATH:/root/go/bin
EOF

echo "Building Vuls tools image..."
docker build -t vuls-tools -f Dockerfile.vuls-tools .

# Create necessary directories
mkdir -p vuls-db

echo "Initializing CVE dictionary database..."
docker run --rm -v "$PWD/vuls-db:/vuls" vuls-tools go-cve-dictionary fetch nvd -dbpath /vuls

echo "Initializing OVAL database for various Linux distributions..."
for dist in ubuntu debian redhat amazon; do
  echo "Fetching OVAL database for $dist..."
  docker run --rm -v "$PWD/vuls-db:/vuls" vuls-tools goval-dictionary fetch $dist -dbpath /vuls
done

echo "Initializing exploit database..."
docker run --rm -v "$PWD/vuls-db:/vuls" vuls-tools go-exploitdb fetch -dbpath /vuls

echo "Initializing Metasploit database..."
docker run --rm -v "$PWD/vuls-db:/vuls" vuls-tools go-msfdb fetch -dbpath /vuls

echo "Initializing GOST database (security tracker)..."
docker run --rm -v "$PWD/vuls-db:/vuls" vuls-tools gost fetch debian -dbpath /vuls

echo "Database initialization complete!"
echo "You can now use Vuls with the initialized databases."

# Clean up
rm Dockerfile.vuls-tools