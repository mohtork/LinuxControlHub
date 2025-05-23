import { spawn, exec } from 'child_process';
import { writeFile, mkdir, mkdtemp } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { decrypt } from './ssh';
import { storage } from './storage';
import type { Task, Playbook, Server } from '@shared/schema';

export class AnsibleManager {
  private tmpDir: string;

  constructor() {
    this.tmpDir = join(tmpdir(), 'linux-control-hub');
  }

  async initialize(): Promise<void> {
    try {
      await mkdir(this.tmpDir, { recursive: true });
    } catch (error) {
      console.error('Failed to initialize Ansible manager:', error);
    }
  }

  async runPlaybook(taskId: number): Promise<void> {
    const task = await storage.getTask(taskId);
    if (!task || task.type !== 'playbook' || !task.playbookId) {
      throw new Error('Invalid task or missing playbook ID');
    }

    const playbook = await storage.getPlaybook(task.playbookId);
    if (!playbook) {
      throw new Error(`Playbook not found: ${task.playbookId}`);
    }

    const servers = task.serverId 
      ? [await storage.getServer(task.serverId)] 
      : task.serverIds 
        ? await Promise.all(task.serverIds.map(id => storage.getServer(id)))
        : [];
    
    // Filter out undefined servers
    const validServers = servers.filter(Boolean) as Server[];
    
    if (validServers.length === 0) {
      throw new Error('No valid servers specified for this task');
    }

    // Update task status
    await storage.updateTask(taskId, { 
      status: 'running',
      startedAt: new Date()
    });

    try {
      // Create temporary directory for this run
      const runDir = await mkdtemp(join(this.tmpDir, 'ansible-run-'));
      
      // Create inventory file
      const inventoryContent = await this.createInventory(validServers);
      const inventoryPath = join(runDir, 'inventory.ini');
      await writeFile(inventoryPath, inventoryContent);
      
      // Create playbook file
      const playbookPath = join(runDir, 'playbook.yml');
      await writeFile(playbookPath, playbook.content);
      
      // Create variables file if needed
      let varsArgs = '';
      if (task.config && typeof task.config === 'object' && task.config.variables) {
        const varsPath = join(runDir, 'vars.json');
        await writeFile(varsPath, JSON.stringify(task.config.variables, null, 2));
        varsArgs = `-e @${varsPath}`;
      }
      
      // Run ansible-playbook command with host key checking disabled
      const command = `ANSIBLE_HOST_KEY_CHECKING=False ansible-playbook -i ${inventoryPath} ${playbookPath} ${varsArgs}`;
      
      let output = '';
      
      console.log(`Executing Ansible command: ${command}`);
      const process = spawn('sh', ['-c', command], { cwd: runDir });
      
      // Register this process with the task queue manager
      if (typeof (global as any).registerActiveProcess === 'function') {
        (global as any).registerActiveProcess(taskId, process, 'ansible');
      }
      
      process.stdout.on('data', (data) => {
        const chunk = data.toString();
        output += chunk;
      });
      
      process.stderr.on('data', (data) => {
        const chunk = data.toString();
        output += chunk;
      });
      
      return new Promise((resolve, reject) => {
        process.on('close', async (code) => {
          const status = code === 0 ? 'success' : 'failed';
          
          await storage.updateTask(taskId, {
            status,
            output,
            exitCode: code,
            completedAt: new Date()
          });
          
          if (code === 0) {
            resolve();
          } else {
            // Store detailed error in output and just pass a generic message in the rejection
            console.error(`Ansible playbook failed with output:\n${output}`);
            reject(new Error(`Ansible playbook exited with code ${code}`));
          }
        });
        
        process.on('error', async (error) => {
          await storage.updateTask(taskId, {
            status: 'failed',
            output: output + '\n' + error.message,
            exitCode: -1,
            completedAt: new Date()
          });
          
          reject(error);
        });
      });
    } catch (error: any) {
      // Log detailed error
      console.error(`Error running playbook for task ${taskId}:`, error);
      
      // Update task with detailed error message
      await storage.updateTask(taskId, {
        status: 'failed',
        // Include both error message and any captured output
        output: `Error: ${error.message}\n\nDetailed output may be available in server logs`,
        exitCode: -1,
        completedAt: new Date()
      });
      
      throw error;
    }
  }

  private async createInventory(servers: Server[]): Promise<string> {
    let inventory = '[servers]\n';
    
    for (const server of servers) {
      let auth = '';
      
      if (server.authType === 'password') {
        const password = decrypt(server.authData);
        auth = `ansible_ssh_pass=${password}`;
      } else if (server.authType === 'key') {
        // For key auth, Ansible can use SSH agent or we could create a temporary key file
        // Here we'll assume SSH agent is configured
        auth = 'ansible_ssh_private_key_file=/tmp/ansible_key_' + server.id;
        
        // Create the key file
        const key = decrypt(server.authData);
        await writeFile('/tmp/ansible_key_' + server.id, key, { mode: 0o600 });
      }
      
      inventory += `${server.name} ansible_host=${server.hostname} ansible_user=${server.username} ansible_port=${server.port} ${auth} ansible_ssh_common_args='-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null'\n`;
    }
    
    // Add server groups based on tags
    const tagGroups = new Map<string, Server[]>();
    
    for (const server of servers) {
      if (server.tags) {
        for (const tag of server.tags) {
          if (!tagGroups.has(tag)) {
            tagGroups.set(tag, []);
          }
          tagGroups.get(tag)?.push(server);
        }
      }
    }
    
    for (const [tag, tagServers] of tagGroups.entries()) {
      inventory += `\n[${tag}]\n`;
      for (const server of tagServers) {
        inventory += `${server.name}\n`;
      }
    }
    
    return inventory;
  }

  async checkAnsibleInstallation(): Promise<{ installed: boolean, version?: string }> {
    return new Promise((resolve) => {
      exec('ansible --version', (error, stdout) => {
        if (error) {
          resolve({ installed: false });
          return;
        }
        
        const versionMatch = stdout.match(/ansible\s\[core\s([\d.]+)\]/i) || 
                             stdout.match(/ansible\s([\d.]+)/i);
        
        if (versionMatch && versionMatch[1]) {
          resolve({ installed: true, version: versionMatch[1] });
        } else {
          resolve({ installed: true });
        }
      });
    });
  }
}

export const ansibleManager = new AnsibleManager();
