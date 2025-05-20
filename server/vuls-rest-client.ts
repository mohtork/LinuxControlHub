/**
 * This file provides a REST client for the Vuls API service
 * It communicates with the standalone Vuls service running in a container
 */

import { InsertVulnerability } from '@shared/schema';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import os from 'os';

export interface VulsServerInfo {
  hostname: string;
  port: number;
  username: string;
  sshKeyPath: string;
  ipAddress?: string;
  scanMode?: string[];
}

export class VulsRestClient {
  private baseUrl: string;
  private configDir: string;
  
  constructor() {
    // Get the Vuls service URL from environment variable or use default
    this.baseUrl = process.env.VULS_SERVICE_URL || 
                  (process.env.DOCKER_ENV ? 'http://vuls:5515' : 'http://localhost:5515');
    
    // Check if Vuls is disabled - this will make the application use the fallback mode
    if (process.env.VULS_DISABLED === 'true') {
      console.log('Vuls integration is disabled - using simulation mode only');
      this.baseUrl = 'disabled';
    }
    
    // Set up a directory for temporary config files
    this.configDir = process.env.DOCKER_ENV
      ? '/tmp/vuls-config'  // Use /tmp in Docker which is writable by any user
      : path.join(os.tmpdir(), 'vuls-config');
    
    // Ensure config directory exists
    if (!fs.existsSync(this.configDir)) {
      try {
        fs.mkdirSync(this.configDir, { recursive: true });
      } catch (error) {
        console.warn(`Unable to create config directory ${this.configDir}, falling back to in-memory only operation`);
        // Continue without failing - we'll use fallback scan methods
      }
    }
  }

  /**
   * Check if the Vuls service is available
   */
  async isAvailable(): Promise<boolean> {
    if (this.baseUrl === 'disabled') {
      return false;
    }
    
    try {
      // Use AbortController with setTimeout for a timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      console.log(`Checking Vuls service availability at ${this.baseUrl}...`);
      const response = await fetch(`${this.baseUrl}/`, {
        method: 'GET',
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      const available = response.ok;
      console.log(`Vuls service availability: ${available ? 'Available' : 'Not available'}`);
      return available;
    } catch (error) {
      console.error('Vuls service is not available:', error);
      return false;
    }
  }

  /**
   * Generate a Vuls config file for the target server
   */
  async generateConfig(serverInfo: VulsServerInfo): Promise<string> {
    if (this.baseUrl === 'disabled') {
      return "error-fallback-path";
    }
    
    try {
      // Create a unique safe server name
      const safeName = serverInfo.hostname.replace(/[^a-zA-Z0-9]/g, '_');
      const configPath = path.join(this.configDir, `config-${safeName}.toml`);
  
      // Create TOML config content
      const configContent = `
# Vuls Configuration for ${serverInfo.hostname}
[servers.${safeName}]
host = "${serverInfo.ipAddress || serverInfo.hostname}"
port = "${serverInfo.port || 22}"
user = "${serverInfo.username}"
keyPath = "${serverInfo.sshKeyPath}"
scanMode = ["${serverInfo.scanMode?.join('", "') || 'fast'}"]
`;
  
      // Write the config file
      fs.writeFileSync(configPath, configContent);
      return configPath;
    } catch (error) {
      console.warn(`Unable to write Vuls config file: ${error}`);
      // Return a non-existent path to trigger fallback mode
      return "error-fallback-path";
    }
  }

  /**
   * Run a scan against a server using the Vuls service
   */
  async runScan(configPath: string): Promise<InsertVulnerability[]> {
    // If Vuls is disabled or config path is the error fallback, bypass external service call
    if (this.baseUrl === 'disabled' || configPath === "error-fallback-path") {
      console.log("Using fallback scan mode - Vuls disabled or configuration issues");
      return [];
    }
    
    const configName = path.basename(configPath);
    
    try {
      // Start a scan using the config file
      const startResponse = await fetch(`${this.baseUrl}/scan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          configPath: configName,
          reportType: 'json',
        }),
      });
      
      if (!startResponse.ok) {
        throw new Error(`Failed to start scan: ${await startResponse.text()}`);
      }
      
      const scanResult = await startResponse.json() as { scanId: string };
      const scanId = scanResult.scanId;
      
      // Poll for scan completion
      let complete = false;
      let attempts = 0;
      let results = null;
      
      while (!complete && attempts < 60) {  // 10 minutes max wait time (10s intervals)
        await new Promise(resolve => setTimeout(resolve, 10000)); // 10 second delay
        
        const statusResponse = await fetch(`${this.baseUrl}/scan/${scanId}/status`);
        if (!statusResponse.ok) {
          attempts++;
          continue;
        }
        
        const statusData = await statusResponse.json() as { 
          status: 'complete' | 'running' | 'error', 
          message?: string 
        };
        
        if (statusData.status === 'complete') {
          complete = true;
          
          // Get scan results
          const resultsResponse = await fetch(`${this.baseUrl}/results/${scanId}`);
          if (resultsResponse.ok) {
            results = await resultsResponse.json();
          } else {
            throw new Error(`Failed to retrieve scan results: ${await resultsResponse.text()}`);
          }
        } else if (statusData.status === 'error') {
          throw new Error(`Scan failed: ${statusData.message || 'Unknown error'}`);
        }
        
        attempts++;
      }
      
      if (!complete) {
        throw new Error('Scan timed out after 10 minutes');
      }
      
      // Convert the Vuls results to our vulnerability format
      return this.parseVulsResults(results);
      
    } catch (error) {
      console.error('Error running Vuls scan:', error);
      return []; // Return empty array on error to prevent application crash
    }
  }

  /**
   * Parse Vuls results into our vulnerability format
   */
  private parseVulsResults(vulsResults: any): InsertVulnerability[] {
    const vulnerabilities: InsertVulnerability[] = [];
    
    if (!vulsResults || Object.keys(vulsResults).length === 0) {
      return vulnerabilities;
    }
    
    // Extract the server name (first key in the results)
    const serverName = Object.keys(vulsResults)[0];
    const serverData = vulsResults[serverName];
    
    if (serverData && serverData.scannedCves) {
      for (const cveId in serverData.scannedCves) {
        const cveInfo = serverData.scannedCves[cveId];
        
        if (cveInfo && cveInfo.affectedPackages) {
          for (const pkg of cveInfo.affectedPackages) {
            // Calculate severity based on CVSS score
            const cvssScore = cveInfo.cvss3Score || cveInfo.cvss2Score || 0;
            
            // Using type assertion to ensure TypeScript recognizes valid severity values
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
              scanId: 0, // This will be set by the caller
              cveId: cveId,
              packageName: pkg.name,
              severity,
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
    
    return vulnerabilities;
  }
}

export const vulsRestClient = new VulsRestClient();