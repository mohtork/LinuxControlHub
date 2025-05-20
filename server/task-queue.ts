import { storage } from './storage';
import { sshManager } from './ssh';
import { ansibleManager } from './ansible';
import { vulnerabilityScanner } from './vulnerability-scan';
import { clamavScanner } from './clamav';
import { Task } from '@shared/schema';
import { CronJob } from 'cron';

export class TaskQueue {
  private processing: boolean;
  private queue: number[];
  private scheduledTasks: Map<number, CronJob>;
  private activeProcesses: Map<number, { process: any, type: string }>;

  constructor() {
    this.processing = false;
    this.queue = [];
    this.scheduledTasks = new Map(); // Maintained for compatibility but not used
    this.activeProcesses = new Map();
    
    // Register a global function to track processes
    (global as any).registerActiveProcess = (taskId: number, process: any, type: string) => {
      this.activeProcesses.set(taskId, { process, type });
      console.log(`Registered active process for task ${taskId} of type ${type}`);
    };
  }

  initialize(): void {
    // Start processing the queue
    this.processQueue();
    
    // Check for any queued tasks that might have been added before the server started
    this.checkForQueuedTasks();
  }

  async addTask(taskId: number): Promise<void> {
    if (!this.queue.includes(taskId)) {
      this.queue.push(taskId);
    }
    
    if (!this.processing) {
      this.processQueue();
    }
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }
    
    this.processing = true;
    
    try {
      const taskId = this.queue.shift()!;
      await this.processTask(taskId);
    } catch (error) {
      console.error('Error processing task:', error);
    } finally {
      this.processing = false;
      
      // Continue processing if there are more items
      if (this.queue.length > 0) {
        this.processQueue();
      }
    }
  }

  private async processTask(taskId: number): Promise<void> {
    const task = await storage.getTask(taskId);
    if (!task) {
      console.error(`Task ${taskId} not found`);
      return;
    }
    
    // Check if this task is already running (helps with manually forced runs)
    if (task.status === 'running') {
      console.log(`Task ${taskId} is already running. Skipping duplicate processing.`);
      return;
    }
    
    // Update task status
    await storage.updateTask(taskId, { 
      status: 'running',
      startedAt: new Date()
    });
    
    try {
      switch (task.type) {
        case 'command':
          await this.processCommandTask(task);
          break;
        case 'playbook':
          await ansibleManager.runPlaybook(taskId);
          break;
        case 'system':
          await this.processSystemTask(task);
          break;
        case 'vulnerability_scan':
          await vulnerabilityScanner.runScan(task);
          break;
        case 'malware_scan':
          await this.processMalwareScanTask(task);
          break;
        default:
          throw new Error(`Unknown task type: ${task.type}`);
      }
    } catch (error: any) {
      await storage.updateTask(taskId, {
        status: 'failed',
        output: error.message,
        exitCode: -1,
        completedAt: new Date()
      });
    }
  }

  private async processCommandTask(task: Task): Promise<void> {
    if (!task.serverId && (!task.serverIds || task.serverIds.length === 0)) {
      throw new Error('No server specified for command task');
    }
    
    const config = task.config as any;
    const command = config?.command;
    
    if (!command) {
      throw new Error('Command not specified in task configuration');
    }
    
    // Ensure serverId is saved in the task's config for better reference
    if (task.serverId && !config.serverId) {
      // Update the task config to include the serverId if not already present
      const updatedTask = await storage.updateTask(task.id, {
        config: { ...config, serverId: task.serverId }
      });
      
      // Use the updated task for further processing
      if (updatedTask) {
        task = updatedTask;
      }
    }
    
    try {
      // Execute on a single server
      if (task.serverId) {
        const result = await sshManager.executeCommand(
          task.serverId, 
          command, 
          task.createdById
        );
        
        await storage.updateTask(task.id, {
          status: result.exitCode === 0 ? 'success' : 'failed',
          output: result.output,
          exitCode: result.exitCode,
          completedAt: new Date()
        });
      } 
      // Execute on multiple servers
      else if (task.serverIds && task.serverIds.length > 0) {
        let finalOutput = '';
        let finalStatus = 'success';
        
        for (const serverId of task.serverIds) {
          const result = await sshManager.executeCommand(
            serverId, 
            command, 
            task.createdById
          );
          
          finalOutput += `=== Server ${serverId} ===\n${result.output}\n\n`;
          
          if (result.exitCode !== 0) {
            finalStatus = 'failed';
          }
        }
        
        await storage.updateTask(task.id, {
          status: finalStatus as const,
          output: finalOutput,
          completedAt: new Date()
        });
      }
    } catch (error: any) {
      await storage.updateTask(task.id, {
        status: 'failed',
        output: error.message,
        exitCode: -1,
        completedAt: new Date()
      });
    }
  }

  private async processSystemTask(task: Task): Promise<void> {
    // First update executedById to track who's running the task
    await storage.updateTask(task.id, {
      executedById: task.createdById
    });
    
    const config = task.config as any;
    
    // Check if action is manage_service - only option we support now
    if (config?.action !== 'manage_service') {
      throw new Error('Only systemd service management is supported for system tasks');
    }
    
    // Validate required fields
    const serviceName = config.serviceName;
    const operation = config.operation;
    const serverId = config.serverId;
    
    if (!serviceName) {
      throw new Error('Service name is required for systemd management');
    }
    
    if (!operation) {
      throw new Error('Operation (start/stop/restart/enable/disable/status) is required');
    }
    
    if (!serverId) {
      throw new Error('Server ID is required for systemd management');
    }
    
    // Build the systemctl command based on operation
    let command = '';
    
    switch (operation) {
      case 'start':
      case 'stop':
      case 'restart':
      case 'enable':
      case 'disable':
        command = `systemctl ${operation} ${serviceName}`;
        break;
      case 'status':
        command = `systemctl status ${serviceName} && systemctl is-active ${serviceName} || echo 'Service inactive'`;
        break;
      default:
        throw new Error(`Unsupported systemd operation: ${operation}`);
    }
    
    // Now process as a normal command task with the generated command
    try {
      // Execute on a single server
      if (task.serverId) {
        const result = await sshManager.executeCommand(
          task.serverId, 
          command, 
          task.createdById
        );
        
        await storage.updateTask(task.id, {
          status: result.exitCode === 0 ? 'success' : 'failed',
          output: result.output,
          exitCode: result.exitCode,
          completedAt: new Date()
        });
      } 
      // Execute on multiple servers
      else if (task.serverIds && task.serverIds.length > 0) {
        let finalOutput = '';
        let finalStatus = 'success';
        
        for (const serverId of task.serverIds) {
          const result = await sshManager.executeCommand(
            serverId, 
            command, 
            task.createdById
          );
          
          finalOutput += `=== Server ${serverId} ===\n${result.output}\n\n`;
          
          if (result.exitCode !== 0) {
            finalStatus = 'failed';
          }
        }
        
        await storage.updateTask(task.id, {
          status: finalStatus as const,
          output: finalOutput,
          completedAt: new Date()
        });
      }
    } catch (error: any) {
      await storage.updateTask(task.id, {
        status: 'failed',
        output: error.message,
        exitCode: -1,
        completedAt: new Date()
      });
    }
  }

  // Only keep the method to check for queued tasks, remove scheduling functionality
  private async checkForQueuedTasks(): Promise<void> {
    const queuedTasks = await storage.getTasksByStatus('queued');
    
    for (const task of queuedTasks) {
      this.addTask(task.id);
    }
  }
  
  // Maintained for backward compatibility but no longer used
  scheduleTask(taskId: number, cronExpression: string): void {
    console.log(`Task scheduling has been disabled. Task ${taskId} will not be scheduled.`);
  }

  // Maintained for backward compatibility but no longer used
  unscheduleTask(taskId: number): void {
    console.log(`Task scheduling has been disabled. Task ${taskId} will not be unscheduled.`);
  }

  // New methods for task control
  async pauseTask(taskId: number): Promise<boolean> {
    try {
      const task = await storage.getTask(taskId);
      if (!task) {
        console.warn(`Task ${taskId} not found`);
        return false;
      }

      // Check if task is in a state that can be paused
      if (task.status !== 'running') {
        console.warn(`Cannot pause task ${taskId} with status '${task.status}'`);
        return false;
      }

      const activeProcess = this.activeProcesses.get(taskId);
      
      // Either we have a process to pause, or we just update the status
      if (activeProcess) {
        console.log(`Pausing active process for task ${taskId}`);
        // We don't actually pause the process, but we mark it as paused
        // This is because child processes don't easily support pause/resume
        // Instead, we'll make sure to check the status before proceeding
      } else {
        console.log(`No active process found for task ${taskId}, but updating status`);
      }
      
      // Update status in database
      await storage.updateTask(taskId, { status: 'paused' });
      return true;
    } catch (error) {
      console.error(`Error pausing task ${taskId}:`, error);
      return false;
    }
  }

  async resumeTask(taskId: number): Promise<boolean> {
    try {
      const task = await storage.getTask(taskId);
      if (!task) {
        console.warn(`Task ${taskId} not found`);
        return false;
      }

      if (task.status !== 'paused') {
        console.warn(`Task ${taskId} is not paused (status: ${task.status})`);
        return false;
      }

      // Update status back to running
      await storage.updateTask(taskId, { status: 'running' });
      
      return true;
    } catch (error) {
      console.error(`Error resuming task ${taskId}:`, error);
      return false;
    }
  }

  async stopTask(taskId: number): Promise<boolean> {
    try {
      const task = await storage.getTask(taskId);
      if (!task) {
        console.warn(`Task ${taskId} not found`);
        return false;
      }

      // Check if task is in a state that can be stopped
      if (task.status !== 'running' && task.status !== 'paused' && task.status !== 'queued') {
        console.warn(`Cannot stop task ${taskId} with status '${task.status}'`);
        return false;
      }

      const activeProcess = this.activeProcesses.get(taskId);
      
      if (activeProcess) {
        console.log(`Stopping active process for task ${taskId}`);
        // Kill the process if it exists
        if (activeProcess.process && typeof activeProcess.process.kill === 'function') {
          activeProcess.process.kill();
        }
        
        // Remove from active processes
        this.activeProcesses.delete(taskId);
      } else {
        console.log(`No active process found for task ${taskId}, but updating status`);
      }
      
      // Add stop message to output
      let output = task.output || '';
      output += '\n\n[Task was manually stopped]';
      
      // Update status in database
      await storage.updateTask(taskId, { 
        status: 'stopped',
        completedAt: new Date(),
        output: output
      });
      
      return true;
    } catch (error) {
      console.error(`Error stopping task ${taskId}:`, error);
      return false;
    }
  }

  async deleteTask(taskId: number): Promise<boolean> {
    try {
      const task = await storage.getTask(taskId);
      if (!task) {
        console.warn(`Task ${taskId} not found`);
        return false;
      }

      // First try to stop the task if it's in a running state
      if (task.status === 'running' || task.status === 'paused' || task.status === 'queued') {
        await this.stopTask(taskId);
      }
      
      // Also check if it's tracked in our active processes
      const isRunning = this.activeProcesses.has(taskId);
      if (isRunning) {
        await this.stopTask(taskId);
      }
      
      // If it's scheduled, unschedule it
      const isScheduled = this.scheduledTasks.has(taskId);
      if (isScheduled) {
        this.unscheduleTask(taskId);
      }
      
      // Remove from the queue if present
      const queueIndex = this.queue.indexOf(taskId);
      if (queueIndex !== -1) {
        this.queue.splice(queueIndex, 1);
      }
      
      // Delete from storage
      const deleted = await storage.deleteTask(taskId);
      
      if (deleted) {
        console.log(`Successfully deleted task ${taskId}`);
      } else {
        console.warn(`Failed to delete task ${taskId} from storage`);
      }
      
      return deleted;
    } catch (error) {
      console.error(`Error deleting task ${taskId}:`, error);
      return false;
    }
  }

  // Method to check if a task is active
  isTaskActive(taskId: number): boolean {
    return this.activeProcesses.has(taskId);
  }

  // Method to get active task ids
  getActiveTasks(): number[] {
    return Array.from(this.activeProcesses.keys());
  }

  private async processMalwareScanTask(task: Task): Promise<void> {
    if (!task.serverId) {
      throw new Error('Server ID is required for malware scanning');
    }

    // First update executedById to track who's running the task
    await storage.updateTask(task.id, {
      executedById: task.createdById
    });
    
    const config = task.config as any;
    
    if (!config) {
      throw new Error('Configuration is required for malware scan task');
    }
    
    // Create a scan record in the database
    const scanInput = {
      serverId: task.serverId,
      userId: task.createdById,
      scanDirectory: config.scanDirectory || '/',
      taskId: task.id
    };
    
    const scan = await storage.createMalwareScan(scanInput);
    
    try {
      // Update scan status to running
      await storage.updateMalwareScan(scan.id, {
        status: 'running'
      });
      
      // Get server information
      const server = await storage.getServer(task.serverId);
      if (!server) {
        throw new Error(`Server with ID ${task.serverId} not found`);
      }
      
      // Run scan using ClamAV scanner
      const scanResult = await clamavScanner.runScan(
        task.serverId, 
        task.createdById, 
        config.scanDirectory || '/'
      );
      
      if (!scanResult.success) {
        // Mark task as failed
        await storage.updateTask(task.id, {
          status: 'failed',
          output: scanResult.message,
          completedAt: new Date()
        });
        
        return;
      }
      
      // Get scan details
      const updatedScan = await storage.getMalwareScan(scan.id);
      const threats = await storage.getMalwareThreats(scan.id);
      
      // Create output summary
      let output = `Malware scan completed on server ${server.name} (${server.hostname})\n\n`;
      output += `Scan directory: ${scanInput.scanDirectory}\n`;
      output += `Files scanned: ${updatedScan?.filesScanned || 'unknown'}\n`;
      output += `Threats found: ${threats.length}\n\n`;
      
      if (threats.length > 0) {
        output += "=== Detected threats ===\n";
        
        for (const threat of threats) {
          output += `${threat.threatName} (${threat.category})\n`;
          output += `File: ${threat.filePath}\n\n`;
        }
      } else {
        output += "No threats detected.\n";
      }
      
      // Update task as completed
      await storage.updateTask(task.id, {
        status: 'success',
        output: output,
        completedAt: new Date()
      });
      
    } catch (error: any) {
      console.error('Error during malware scan task:', error);
      
      // Update task as failed
      await storage.updateTask(task.id, {
        status: 'failed',
        output: `Error performing malware scan: ${error.message || String(error)}`,
        completedAt: new Date()
      });
      
      // Try to update scan status if possible
      try {
        await storage.updateMalwareScan(scan.id, {
          status: 'failed',
          errorMessage: error.message || String(error)
        });
      } catch (updateError) {
        console.error('Failed to update malware scan status:', updateError);
      }
    }
  }
}

export const taskQueue = new TaskQueue();
