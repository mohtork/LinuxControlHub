import { NodeSSH, SSHExecOptions, Config as SSHConfig } from 'node-ssh';
import { createDecipheriv, randomBytes, createCipheriv } from 'crypto';
import { storage } from './storage';
import type { Server, Command, InsertCommand } from '@shared/schema';

// Encryption settings
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'LinuxControlHubEncryptionKey12345678';
const IV_LENGTH = 16;
const ALGORITHM = 'aes-256-cbc';

// Create a 32-byte key from our encryption key (either pad or hash it)
function getKey(): Buffer {
  // If the key is already 32 bytes, use it directly
  if (Buffer.from(ENCRYPTION_KEY).length === 32) {
    return Buffer.from(ENCRYPTION_KEY);
  }
  
  // If it's shorter, pad it; if longer, truncate it
  const key = Buffer.alloc(32); // Create a 32-byte buffer filled with zeros
  const sourceKey = Buffer.from(ENCRYPTION_KEY);
  sourceKey.copy(key, 0, 0, Math.min(sourceKey.length, 32));
  return key;
}

export function encrypt(text: string): string {
  const iv = randomBytes(IV_LENGTH);
  const key = getKey();
  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

export function decrypt(text: string): string {
  const parts = text.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encryptedText = Buffer.from(parts[1], 'hex');
  const key = getKey();
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

export class SSHManager {
  private connections: Map<number, NodeSSH>;

  constructor() {
    this.connections = new Map();
  }

  async connectToServer(serverId: number): Promise<NodeSSH> {
    // Check if we already have an active connection
    let connection = this.connections.get(serverId);
    if (connection && connection.isConnected()) {
      return connection;
    }

    // Get server details from storage
    const server = await storage.getServer(serverId);
    if (!server) {
      throw new Error(`Server with ID ${serverId} not found`);
    }

    // Create SSH config
    const sshConfig: SSHConfig = {
      host: server.hostname,
      port: server.port,
      username: server.username,
    };

    // Add auth based on type
    if (server.authType === 'password') {
      sshConfig.password = decrypt(server.authData);
    } else if (server.authType === 'key') {
      sshConfig.privateKey = decrypt(server.authData);
    } else {
      throw new Error(`Unsupported authentication type: ${server.authType}`);
    }

    // Create new connection
    connection = new NodeSSH();
    
    try {
      await connection.connect(sshConfig);
      this.connections.set(serverId, connection);
      
      // Update server status to online
      await storage.updateServer(serverId, { status: 'online', lastChecked: new Date() });
      
      return connection;
    } catch (error) {
      // Update server status to error
      await storage.updateServer(serverId, { status: 'error', lastChecked: new Date() });
      throw error;
    }
  }

  async executeCommand(serverId: number, command: string, userId: number, options: SSHExecOptions = {}): Promise<Command> {
    try {
      const ssh = await this.connectToServer(serverId);
      
      const startTime = Date.now();
      const result = await ssh.execCommand(command, options);
      const endTime = Date.now();
      
      const commandData: InsertCommand = {
        command,
        serverId,
        userId,
        output: result.stdout || result.stderr,
        exitCode: result.code,
      };
      
      return await storage.createCommand(commandData);
    } catch (error: any) {
      const commandData: InsertCommand = {
        command,
        serverId,
        userId,
        output: error.message,
        exitCode: -1,
      };
      
      return await storage.createCommand(commandData);
    }
  }

  async fetchServerMetrics(serverId: number, userId: number): Promise<void> {
    try {
      const ssh = await this.connectToServer(serverId);
      
      // Get CPU usage - use a more reliable method to get CPU usage
      const cpuCommand = await ssh.execCommand(`
        # Get CPU idle percentage directly from the 'id' field in top output
        CPU_IDLE=$(top -bn1 | grep 'Cpu(s)' | awk '{print $8}' | tr -d '%id,')
        # If that fails, try an alternative pattern
        if [[ -z "$CPU_IDLE" ]]; then
          CPU_IDLE=$(top -bn1 | grep 'Cpu(s)' | sed 's/.*\\([0-9.]*\\) id.*/\\1/')
        fi
        # Calculate CPU usage as 100 - idle
        echo "scale=2; 100 - $CPU_IDLE" | bc
      `);
      
      // Parse CPU usage and ensure it's a number between 0 and 100
      let cpuUsage = parseFloat(cpuCommand.stdout.trim()) || 0;
      // Ensure CPU usage is within bounds
      cpuUsage = Math.max(0, Math.min(100, Math.round(cpuUsage)));
      
      // Get memory usage
      const memCommand = await ssh.execCommand("free | grep Mem | awk '{print $3/$2 * 100.0}'");
      const memoryUsage = parseInt(memCommand.stdout.trim()) || 0;
      
      // Get disk usage
      const diskCommand = await ssh.execCommand("df -h / | awk 'NR==2 {print $5}' | tr -d '%'");
      const diskUsage = parseInt(diskCommand.stdout.trim()) || 0;
      
      // Get uptime
      const uptimeCommand = await ssh.execCommand("cat /proc/uptime | awk '{print $1}'");
      const uptime = parseInt(uptimeCommand.stdout.trim()) || 0;
      
      // Get load average
      const loadCommand = await ssh.execCommand("cat /proc/loadavg | awk '{print $1,$2,$3}'");
      const loadAverage = loadCommand.stdout.trim().split(' ');
      
      // Save metrics
      await storage.createServerMetrics({
        serverId,
        cpuUsage,
        memoryUsage,
        diskUsage,
        uptime,
        loadAverage,
      });
      
      // Update server OS info if not set
      const server = await storage.getServer(serverId);
      if (server && !server.os) {
        const osCommand = await ssh.execCommand("cat /etc/os-release | grep PRETTY_NAME | cut -d= -f2 | tr -d '\"'");
        if (osCommand.stdout) {
          await storage.updateServer(serverId, { os: osCommand.stdout.trim() });
        }
      }
    } catch (error) {
      console.error(`Failed to fetch metrics for server ${serverId}:`, error);
      // Update server status
      await storage.updateServer(serverId, { status: 'error', lastChecked: new Date() });
    }
  }

  async testConnection(serverConfig: any): Promise<{ success: boolean, message: string }> {
    const connection = new NodeSSH();
    const sshConfig: SSHConfig = {
      host: serverConfig.hostname,
      port: serverConfig.port || 22,
      username: serverConfig.username,
      readyTimeout: 10000, // 10 seconds timeout
    };

    // Add auth based on type
    if (serverConfig.authType === 'password') {
      sshConfig.password = serverConfig.password;
    } else if (serverConfig.authType === 'key') {
      sshConfig.privateKey = serverConfig.privateKey;
    }

    try {
      await connection.connect(sshConfig);
      connection.dispose();
      return { success: true, message: 'Connection successful' };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  disconnectFromServer(serverId: number): void {
    const connection = this.connections.get(serverId);
    if (connection) {
      connection.dispose();
      this.connections.delete(serverId);
    }
  }

  disconnectAll(): void {
    // Convert to array first to avoid iterator issues
    Array.from(this.connections.values()).forEach(connection => {
      connection.dispose();
    });
    this.connections.clear();
  }
}

export const sshManager = new SSHManager();
