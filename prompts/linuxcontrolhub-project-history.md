# Project Prompt: LinuxControlHub Development with Replit

## 🚀 Initial Project Request

I want you to design and build a full-featured, production-ready web application called LinuxControlHub for managing Linux servers. The application should have the following key components:

### 🔐 Authentication System
- Secure login/logout functionality  
- Role-based access control (admin/user)  
- User management  

### 🖥️ Server Management
- Add/edit/remove server information (hostname, IP, credentials)  
- Test connection to servers  
- Group servers by function/environment  

### 🧑‍💻 SSH Terminal Access
- Browser-based terminal to interact with servers  
- Session management  
- Command history  

### ⚙️ Automation Features
- Run Ansible playbooks against server groups  
- Schedule and track recurring tasks  
- System service management (start/stop/restart)  

### 📊 Monitoring
- Server health metrics (CPU, memory, disk)  
- Historical performance data  
- System load visualization  

### 🔒 Security Features
- Vulnerability scanning using Vuls  
- Malware detection with ClamAV  
- Security status dashboard  

### 💻 Tech Stack
- React with TypeScript frontend  
- Node.js backend  
- PostgreSQL database  
- Modern, responsive UI with charts and visualizations  
- SSH and remote execution capability  
- RESTful API design  

---

## 📌 Feature Development Questions & Requests

### 1. Terminal & Command Issues
- "The terminal tab causes a blank page when switching to other tabs."
- "Fix the terminal component issues with WebSocket connections."
- "Ensure proper cleanup of terminal instances."

### 2. Vulnerability Scanning Enhancements
- "Extend the LinuxControlHub web application by adding a feature that performs remote vulnerability scanning using Vuls."
- "I want to see detailed vulnerability reports with CVE information."
- "Ensure vulnerability scans appear in the Tasks list."
- "Display only the latest scan for each server in the vulnerability summary."

### 3. ClamAV Malware Detection Problems & Fixes
- "Why did you add a specific check for the EICAR test file? I want it to be detected with the regular `clamd` command to ensure it's working."
- "The scan finished in 2 seconds and showed no threats. I doubt the command executed against the '/' directory."
- "I want to see in the detailed scan report how many files were scanned, to confirm the command works correctly."
- "Show me the command you used to run ClamAV on the server."
- "I believe you need to execute the command with `sudo`."
- "Still getting the same error—we need to run `sudo freshclam` first."

### 4. Task Management & Integration
- "All scans should appear in the Tasks list and Security Center."
- "Ensure the scan runs against the specified directories."
- "Tasks should record the username of the user who executed them."

### 5. User Management & Authentication
- "What is the username and password for the admin user?"
- "I can't log in with `admin/adminadmin`."
- "Always provide both a login form and a registration form on the auth page."
- "Protect the admin user from being deleted or having their role changed."

### 6. Database & Schema Issues
- "Fixed critical database field name mismatches by updating the code to use the correct field names."
- "Removed references to non-existent database fields."
- "Enhanced malware scanning functionality with improved ClamAV command execution."

### 7. UI/UX Improvements
- "Removed the terminal from the dashboard as requested."
- "Completely removed the commands feature as requested."
- "Simplified the User Management dialog by removing duplicate user entries."
- "Removed server grouping as requested and replaced it with enhanced filtering options."

### 8. Security & Scanning Configuration
- "Use standard ClamAV scanning without special handling for EICAR test files."
- "Scan reports should include the number of files scanned."
- "Address the issue with scan speed and thoroughness."
- "Ensure the scan executes correctly against specified directories."
