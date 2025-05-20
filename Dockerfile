FROM node:20-alpine

# Install dependencies including ansible and ssh
RUN apk add --no-cache python3 py3-pip openssh-client bash curl postgresql-client python3-dev build-base \
    && python3 -m venv /opt/ansible-venv \
    && . /opt/ansible-venv/bin/activate \
    && pip3 install --upgrade pip \
    && pip3 install ansible \
    && deactivate \
    && mkdir -p /root/.ssh \
    && chmod 700 /root/.ssh \
    && echo 'source /opt/ansible-venv/bin/activate' >> /root/.bashrc \
    # Create symlink to ansible from venv to system path
    && ln -s /opt/ansible-venv/bin/ansible /usr/local/bin/ansible \
    && ln -s /opt/ansible-venv/bin/ansible-playbook /usr/local/bin/ansible-playbook

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy entrypoint script and set permissions
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Copy application code
COPY . .

# Create necessary directories
RUN mkdir -p /app/logs /app/ansible /app/ssh-keys

# Build TypeScript code
RUN npm run build

# Set permissions and ownership
RUN chmod -R 755 /app/ansible /app/ssh-keys && \
    chown -R node:node /app/logs /app/ansible /app/ssh-keys

# Expose port
EXPOSE 3000

# Set entrypoint
ENTRYPOINT ["docker-entrypoint.sh"]

# Start application
CMD ["npm", "run", "start"]