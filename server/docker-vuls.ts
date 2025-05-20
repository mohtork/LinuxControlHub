import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { promisify } from 'util';
import { InsertVulnerability } from '@shared/schema';

const execPromise = promisify(exec);

/**
 * Class for running Vuls in Docker containers to perform real vulnerability scans.
 */
export class DockerVulsScanner {
  private configDir: string;
  private resultsDir: string;
  private keysDir: string;

  constructor() {
    // Setup work directories
    const baseDir = path.join(os.tmpdir(), 'docker-vuls');
    this.configDir = path.join(baseDir, 'config');
    this.resultsDir = path.join(baseDir, 'results');
    this.keysDir = path.join(baseDir, 'ssh-keys');

    // Ensure directories exist
    this.createDirectories();
  }

  /**
   * Create necessary directories for Vuls scanner
   */
  private createDirectories(): void {
    const dirs = [this.configDir, this.resultsDir, this.keysDir];
    
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  /**
   * Prepare SSH key for container to use
   * @param sshKeyPath Path to the SSH key file
   * @returns Path to the SSH key file inside the work directory
   */
  private async prepareSSHKey(sshKeyPath: string): Promise<string> {
    const keyFilename = path.basename(sshKeyPath);
    const containerKeyPath = path.join(this.keysDir, keyFilename);

    // Copy the key to our work directory
    fs.copyFileSync(sshKeyPath, containerKeyPath);
    
    // Ensure proper permissions
    fs.chmodSync(containerKeyPath, 0o600);

    return containerKeyPath;
  }

  /**
   * Generate a Vuls config file for the target server
   * @param serverDetails Information about the server to scan
   * @param sshKeyPath Path to the SSH key for authentication
   * @returns Path to the generated config file
   */
  async generateVulsConfig(
    serverDetails: { id: number, name: string, hostname: string, username: string },
    sshKeyPath: string
  ): Promise<string> {
    // Create a safe server name for use in filenames/config
    const safeName = serverDetails.name.replace(/[^a-zA-Z0-9]/g, '_');
    const configFilePath = path.join(this.configDir, `config-${safeName}.toml`);
    
    // Create TOML configuration for Vuls
    const configContent = `
# Vuls Configuration for ${serverDetails.name}
[servers.${safeName}]
host = "${serverDetails.hostname}"
port = "22"
user = "${serverDetails.username}"
keyPath = "/ssh-keys/${path.basename(sshKeyPath)}"
scanMode = ["fast"]
`;
    
    fs.writeFileSync(configFilePath, configContent);
    console.log(`Generated Vuls config at ${configFilePath}`);
    
    return configFilePath;
  }

  /**
   * Run Vuls scan using Docker
   * @param configPath Path to the Vuls configuration file
   * @returns Path to results JSON file
   */
  async runScan(configPath: string): Promise<string> {
    const configBasename = path.basename(configPath);
    const serverName = configBasename.replace('config-', '').replace('.toml', '');
    const resultPath = path.join(this.resultsDir, `${serverName}-results.json`);
    
    console.log(`Starting Vuls scan with Docker for ${serverName}...`);

    try {
      // First pull the Vuls Docker image if needed
      await this.pullVulsImage();
      
      // Run the scan using Docker
      const dockerCommand = `docker run --rm \
        -v "${this.configDir}:/vuls/config:ro" \
        -v "${this.keysDir}:/ssh-keys:ro" \
        -v "${this.resultsDir}:/vuls/results" \
        vuls/vuls:latest scan \
        -config="/vuls/config/${configBasename}" \
        -format-json \
        -results-dir="/vuls/results"`;
      
      console.log(`Executing: ${dockerCommand}`);
      
      const { stdout, stderr } = await execPromise(dockerCommand, { maxBuffer: 1024 * 1024 * 10 });
      
      if (stderr && !stderr.includes('INFO')) {
        console.error(`Vuls scan stderr: ${stderr}`);
      }
      
      console.log(`Vuls scan completed: ${stdout}`);
      
      // The results file created by Vuls follows specific naming convention
      // Looking for the result file in the results directory
      const resultFiles = fs.readdirSync(this.resultsDir);
      const resultFile = resultFiles.find(file => 
        file.includes(serverName) && file.endsWith('json')
      );
      
      if (!resultFile) {
        throw new Error(`No result file found for ${serverName}`);
      }
      
      const actualResultPath = path.join(this.resultsDir, resultFile);
      console.log(`Vuls scan results saved at: ${actualResultPath}`);
      
      return actualResultPath;
    } catch (error) {
      console.error('Error running Vuls Docker scan:', error);
      throw error;
    }
  }

  /**
   * Pull the Vuls Docker image
   */
  private async pullVulsImage(): Promise<void> {
    try {
      console.log('Pulling the Vuls Docker image...');
      
      // Check if the image is already pulled
      const { stdout: checkOutput } = await execPromise('docker images vuls/vuls:latest -q');
      
      if (checkOutput.trim()) {
        console.log('Vuls Docker image already exists, skipping pull');
        return;
      }
      
      // Pull the image
      const { stdout, stderr } = await execPromise('docker pull vuls/vuls:latest');
      
      if (stderr && !stderr.includes('Pulling from') && !stderr.includes('Download complete')) {
        console.error(`Error pulling Docker image: ${stderr}`);
      }
      
      console.log(`Docker image pulled: ${stdout}`);
    } catch (error) {
      console.error('Error pulling Vuls Docker image:', error);
      throw error;
    }
  }

  /**
   * Parse Vuls results into our database format
   * @param resultsPath Path to the Vuls JSON results file
   * @returns Array of vulnerability objects ready for database insertion
   */
  async parseResults(resultsPath: string): Promise<InsertVulnerability[]> {
    try {
      if (!fs.existsSync(resultsPath)) {
        throw new Error(`Results file not found: ${resultsPath}`);
      }
      
      // Parse the Vuls JSON result
      const rawResult = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
      
      // Example transformation from Vuls format to our database format
      // Actual implementation will depend on the structure of Vuls output
      const vulnerabilities: InsertVulnerability[] = [];
      
      // Extract vulnerabilities from the Vuls report structure
      // Iterate through servers in the result
      for (const serverName in rawResult) {
        const serverData = rawResult[serverName];
        
        // Iterate through scanned packages
        if (serverData && serverData.scannedCves) {
          for (const cveId in serverData.scannedCves) {
            const cveInfo = serverData.scannedCves[cveId];
            
            // Extract data for each affected package
            if (cveInfo && cveInfo.affectedPackages) {
              for (const pkg of cveInfo.affectedPackages) {
                // Convert CVSS score to our severity levels
                const cvssScore = cveInfo.cvss2Score || cveInfo.cvss3Score || 0;
                // Using type assertion to ensure TypeScript knows these are valid values
                let severity: 'low' | 'medium' | 'high' | 'critical' = 'low';
                
                if (cvssScore >= 9.0) {
                  severity = 'critical';
                } else if (cvssScore >= 7.0) {
                  severity = 'high';
                } else if (cvssScore >= 4.0) {
                  severity = 'medium';
                }
                
                // Create our vulnerability entry
                const vulnerability: InsertVulnerability = {
                  scanId: 0, // Will be set by caller
                  cveId: cveId,
                  packageName: pkg.name,
                  severity, // TypeScript will infer this correctly now with the explicit type above
                  fixAvailable: pkg.notFixedYet === false,
                  summary: cveInfo.summary || `Vulnerability in ${pkg.name}`,
                  cvssScore: cvssScore,
                  detectedVersion: pkg.version,
                  fixedVersion: pkg.fixedIn || '',
                };
                
                vulnerabilities.push(vulnerability);
              }
            }
          }
        }
      }
      
      return vulnerabilities;
    } catch (error) {
      console.error('Error parsing Vuls results:', error);
      
      // If parsing real results fails, return an empty array
      // In a production app, might want to throw an error instead
      return [];
    }
  }
  
  /**
   * Check if Docker is available in the system
   * @returns true if Docker is available, false otherwise
   */
  async isDockerAvailable(): Promise<boolean> {
    try {
      await execPromise('docker --version');
      return true;
    } catch (error) {
      console.error('Docker is not available:', error);
      return false;
    }
  }
}

export const dockerVulsScanner = new DockerVulsScanner();