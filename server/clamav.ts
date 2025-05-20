import { NodeSSH, Config as SSHConfig } from 'node-ssh';
import { storage } from './storage';
import { sshManager } from './ssh';
import { InsertMalwareScan, InsertMalwareThreat, malwareCategoryEnum } from '@shared/schema';
import path from 'path';
import fs from 'fs';
import os from 'os';

/**
 * Class for handling ClamAV malware scanning on remote servers
 */
export class ClamAVScanner {
  private resultsDir: string;

  constructor() {
    // Create directory for storing scan results
    this.resultsDir = path.join(os.tmpdir(), 'linux-control-hub', 'clamav-results');
    this.createDirectories();
  }

  /**
   * Create necessary directories for ClamAV scanner
   */
  private createDirectories(): void {
    if (!fs.existsSync(this.resultsDir)) {
      fs.mkdirSync(this.resultsDir, { recursive: true });
    }
  }

  /**
   * Check if ClamAV is installed on the server
   * @param ssh SSH client
   * @returns true if ClamAV is installed, false otherwise
   */
  async isClamAVInstalled(ssh: NodeSSH): Promise<boolean> {
    try {
      const result = await ssh.execCommand('which clamscan');
      return result.code === 0 && result.stdout.trim() !== '';
    } catch (error) {
      console.error('Error checking if ClamAV is installed:', error);
      return false;
    }
  }

  /**
   * Install ClamAV on the server
   * @param ssh SSH client
   * @param os OS type (ubuntu, rhel, etc.)
   */
  async installClamAV(ssh: NodeSSH, osType: string): Promise<{ success: boolean, message: string }> {
    try {
      let installCommand = '';
      
      if (osType.toLowerCase().includes('ubuntu') || osType.toLowerCase().includes('debian')) {
        installCommand = 'apt-get update && apt-get install -y clamav clamav-freshclam';
      } else if (osType.toLowerCase().includes('rhel') || osType.toLowerCase().includes('centos') || osType.toLowerCase().includes('fedora')) {
        installCommand = 'yum -y install clamav clamav-freshclam';
      } else {
        return { 
          success: false, 
          message: `Unsupported OS type: ${osType}. ClamAV installation is supported on Ubuntu/Debian and RHEL/CentOS/Fedora.` 
        };
      }
      
      // Execute installation command with sudo
      console.log(`Installing ClamAV on ${osType} system...`);
      const installResult = await ssh.execCommand(installCommand, { execOptions: { pty: true } });
      
      // Check if installation was successful
      if (installResult.code !== 0) {
        console.error('ClamAV installation failed:', installResult.stderr);
        return { success: false, message: `ClamAV installation failed: ${installResult.stderr}` };
      }
      
      // Update virus definitions
      console.log('Updating ClamAV virus definitions...');
      await ssh.execCommand('freshclam', { execOptions: { pty: true } });
      
      // Verify installation
      const verifyResult = await this.isClamAVInstalled(ssh);
      if (!verifyResult) {
        return { success: false, message: 'ClamAV installation could not be verified.' };
      }
      
      return { success: true, message: 'ClamAV installed and updated successfully.' };
    } catch (error: any) {
      console.error('Error installing ClamAV:', error);
      return { success: false, message: `Error installing ClamAV: ${error.message || String(error)}` };
    }
  }

  /**
   * Run a ClamAV scan on the specified server
   * @param serverId Server ID to scan
   * @param userId User ID who initiated the scan
   * @param scanDirectory Directory to scan (default: '/')
   */
  async runScan(serverId: number, userId: number, scanDirectory: string = '/'): Promise<{ success: boolean, scanId?: number, message: string }> {
    // Get server information
    const server = await storage.getServer(serverId);
    if (!server) {
      return { success: false, message: `Server with ID ${serverId} not found.` };
    }

    try {
      // Connect to server using SSH
      const ssh = await sshManager.connectToServer(serverId);
      
      // Check if ClamAV is installed
      const clamAVInstalled = await this.isClamAVInstalled(ssh);
      
      // If ClamAV is not installed, install it
      if (!clamAVInstalled) {
        console.log(`ClamAV not found on server ${server.name}. Installing...`);
        const installResult = await this.installClamAV(ssh, server.os || 'ubuntu');
        
        if (!installResult.success) {
          // Create scan record with failed status
          const scan = await storage.createMalwareScan({
            serverId,
            scanDirectory,
            userId
          });
          
          await storage.updateMalwareScan(scan.id, {
            status: 'failed',
            errorMessage: installResult.message
          });
          
          return { success: false, scanId: scan.id, message: installResult.message };
        }
      }
      
      // Create a task for the scan
      const taskData = {
        name: `Malware scan for server ${serverId}`,
        description: `Scan directory: ${scanDirectory}`,
        type: 'malware_scan',
        serverId: serverId,
        config: {
          type: 'malware_scan',
          serverId: serverId,
          scanDirectory: scanDirectory
        },
        createdById: userId,
        executedById: userId,
        status: 'running'
      };
      
      // Create task
      const task = await storage.createTask(taskData);
      
      // Create scan record in database
      const scan = await storage.createMalwareScan({
        serverId,
        scanDirectory,
        userId
      });
      
      // Update scan status to running and link to task
      await storage.updateMalwareScan(scan.id, {
        status: 'running',
        taskId: task.id
      });
      
      const startTime = Date.now();
      
      // Create a temporary file for scan results
      const outputFile = path.join(this.resultsDir, `clamav-scan-${serverId}-${scan.id}.txt`);
      
      // First update the ClamAV virus database with freshclam
      console.log(`Updating ClamAV database on server ${server.name}`);
      const updateCommand = `sudo freshclam`;
      const updateResult = await ssh.execCommand(updateCommand);
      console.log(`ClamAV database update result: ${updateResult.code === 0 ? 'Success' : 'Warning'}`);
      
      // Run ClamAV scan with better logging to ensure correctness
      // Use sudo to ensure we have permission to access all files
      // -r for recursive scanning (scan subdirectories)
      // --verbose for detailed output
      console.log(`Running ClamAV scan on server ${server.name}, directory ${scanDirectory}`);
      const scanCommand = `sudo clamscan -r --verbose ${scanDirectory} | tee ${outputFile}`;
      
      // Log the exact command being executed
      console.log(`Executing ClamAV command: ${scanCommand}`);
      
      // Execute scan command
      const scanResult = await ssh.execCommand(scanCommand);
      
      // Calculate scan duration
      const scanDuration = Math.floor((Date.now() - startTime) / 1000);
      
      if (scanResult.code !== 0 && scanResult.code !== 1) {
        // Code 1 means threats were found, which is expected
        // Any other code is an error
        await storage.updateMalwareScan(scan.id, {
          status: 'failed',
          scanDuration,
          errorMessage: scanResult.stderr
        });
        
        // Update task status as failed
        await storage.updateTask(task.id, {
          status: 'failed',
          output: `Scan failed with error: ${scanResult.stderr}`,
          completedAt: new Date()
        });
        
        return { 
          success: false, 
          scanId: scan.id, 
          message: `Scan failed with error: ${scanResult.stderr}` 
        };
      }
      
      // Get file count by running find command
      const fileCountResult = await ssh.execCommand(`find ${scanDirectory} -type f | wc -l`);
      const filesScanned = parseInt(fileCountResult.stdout.trim(), 10) || 0;
      
      // Read the output file to get the complete scan results
      // This ensures we see the full output which may be large
      const readFileCmd = `cat ${outputFile}`;
      const readResult = await ssh.execCommand(readFileCmd);
      const fullOutput = readResult.stdout || scanResult.stdout;
      
      // Log detailed scan statistics from the output
      console.log(`ClamAV scan completed with exit code ${scanResult.code}`);
      console.log(`Files scanned: ${filesScanned}`);
      console.log(`Scan duration: ${scanDuration} seconds`);
      
      // Parse scan results
      const threats = await this.parseScanResults(fullOutput);
      
      // Update scan record
      await storage.updateMalwareScan(scan.id, {
        status: 'success',
        filesScanned,
        threatCount: threats.length,
        scanDuration
        // Removed rawOutputPath as it doesn't exist in the database
      });
      
      // Update task status with detailed information
      await storage.updateTask(task.id, {
        status: 'success',
        output: `Malware scan completed successfully for ${server.name} (${server.hostname}).
- ClamAV DB update: ${updateResult.code === 0 ? 'Successful' : 'Warning (using existing DB)'}
- Scan directory: ${scanDirectory}
- Files scanned: ${filesScanned} 
- Threats found: ${threats.length}
- Scan duration: ${scanDuration} seconds
- Command: ${scanCommand}`,
        completedAt: new Date()
      });
      
      // Store threat details
      for (const threat of threats) {
        const category = threat.category as "virus" | "trojan" | "spyware" | "ransomware" | "rootkit" | "backdoor" | "other";
        await storage.createMalwareThreat({
          scanId: scan.id,
          filePath: threat.filePath,
          threatName: threat.threatName,
          category: category
        });
      }
      
      return { 
        success: true, 
        scanId: scan.id, 
        message: `Scan completed. Scanned ${filesScanned} files, found ${threats.length} threats.` 
      };
      
    } catch (error: any) {
      console.error(`Error during ClamAV scan on server ${serverId}:`, error);
      
      // Try to update scan record if it was created
      try {
        const scans = await storage.getMalwareScans(serverId);
        const latestScan = scans.sort((a, b) => 
          new Date(b.scanDate || new Date()).getTime() - new Date(a.scanDate || new Date()).getTime()
        )[0];
        
        if (latestScan && latestScan.status === 'running') {
          await storage.updateMalwareScan(latestScan.id, {
            status: 'failed',
            errorMessage: error.message || String(error)
          });
          
          // If this scan has a task ID, update the task as failed with detailed information
          if (latestScan.taskId) {
            await storage.updateTask(latestScan.taskId, {
              status: 'failed',
              output: `Malware scan failed for server ${serverId}.
- Error: ${error.message || String(error)}
- Scan directory: ${latestScan.scanDirectory || 'Unknown'}
- Commands used: 
  1. sudo freshclam
  2. sudo clamscan -r --verbose [directory]
- Check server connection, sudo permissions, and ClamAV installation
- Ensure virus database can be updated with freshclam`,
              completedAt: new Date()
            });
          }
          
          return { 
            success: false, 
            scanId: latestScan.id, 
            message: `Scan failed with error: ${error.message || String(error)}` 
          };
        }
      } catch (updateError: any) {
        console.error('Error updating scan record:', updateError);
      }
      
      return { 
        success: false, 
        message: `Error performing malware scan: ${error.message || String(error)}` 
      };
    }
  }

  /**
   * Parse ClamAV scan results
   * @param scanOutput Output from ClamAV scan
   * @returns Array of detected threats
   */
  private async parseScanResults(scanOutput: string): Promise<Array<{
    filePath: string,
    threatName: string,
    category?: string
  }>> {
    const threats: Array<{
      filePath: string,
      threatName: string,
      category?: string
    }> = [];
    
    // Print the scan output for debugging
    console.log("ClamAV scan output:", scanOutput);
    
    // Sample output line: "/path/to/file: Malware.Name FOUND"
    const lines = scanOutput.split('\n');
    
    for (const line of lines) {
      if (line.includes('FOUND')) {
        console.log("Found potential threat:", line);
        // Different ClamAV versions might output slightly different formats
        // Try multiple regex patterns
        let match = line.match(/^(.*): (.*) FOUND$/);
        
        if (!match) {
          // Try alternate format
          match = line.match(/^(.*): (.*)FOUND$/);
        }
        
        if (match && match.length >= 3) {
          const filePath = match[1].trim();
          const threatName = match[2].trim();
          
          // Determine category based on threat name
          let category: string = 'other';
          
          if (threatName.toLowerCase().includes('virus')) {
            category = 'virus';
          } else if (threatName.toLowerCase().includes('trojan')) {
            category = 'trojan';
          } else if (threatName.toLowerCase().includes('spyware')) {
            category = 'spyware';
          } else if (threatName.toLowerCase().includes('ransom')) {
            category = 'ransomware';
          } else if (threatName.toLowerCase().includes('rootkit')) {
            category = 'rootkit';
          } else if (threatName.toLowerCase().includes('backdoor')) {
            category = 'backdoor';
          }
          
          threats.push({
            filePath,
            threatName,
            category
          });
        }
      }
    }
    
    return threats;
  }
}

export const clamavScanner = new ClamAVScanner();