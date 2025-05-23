import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, requirePermission } from "./auth";
import { sshManager, encrypt } from "./ssh";
import { ansibleManager } from "./ansible";
import { taskQueue } from "./task-queue";
import { z } from "zod";
import { WebSocket, WebSocketServer } from "ws";
import { NodeSSH } from "node-ssh";
import { 
  insertUserSchema, 
  insertServerSchema,
  insertPlaybookSchema,
  insertTaskSchema,
  commandTaskConfigSchema,
  playbookTaskConfigSchema,
  systemTaskConfigSchema,
  vulnerabilityScanTaskConfigSchema,
  malwareScanTaskConfigSchema,
  insertVulnerabilityScanSchema,
  insertMalwareScanSchema,
  User as SelectUser,
  User
} from "@shared/schema";
import { clamavScanner } from "./clamav";

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup authentication
  setupAuth(app);
  
  // Health check endpoint for Docker and monitoring
  app.get("/api/health", (_req: Request, res: Response) => {
    res.status(200).json({ 
      status: "ok", 
      version: "1.0.0",
      timestamp: new Date().toISOString(),
      services: {
        database: "connected",
        ansible: ansibleManager ? "available" : "unavailable",
        taskQueue: taskQueue ? "available" : "unavailable"
      }
    });
  });
  
  // Initialize services
  await ansibleManager.initialize();
  taskQueue.initialize();
  
  // Check Ansible installation
  const ansibleStatus = await ansibleManager.checkAnsibleInstallation();
  console.log('Ansible status:', ansibleStatus);

  const httpServer = createServer(app);
  
  // Create WebSocket server for terminals
  const wss = new WebSocketServer({ noServer: true });
  const sshSessions = new Map<string, { client: WebSocket, ssh: NodeSSH, pty: any }>();
  
  // WebSocket upgrade handler
  httpServer.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url!, `http://${request.headers.host}`).pathname;
    
    if (pathname.startsWith('/api/terminal/')) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request, pathname);
      });
    } else {
      socket.destroy();
    }
  });
  
  // WebSocket connection handler
  wss.on('connection', async (ws: WebSocket, request: any, pathname: string) => {
    try {
      // Extract server ID from the pathname
      const serverId = parseInt(pathname.split('/')[3]);
      if (isNaN(serverId)) {
        ws.close(4000, 'Invalid server ID');
        return;
      }
      
      // Create a unique session ID
      const sessionId = `${serverId}-${Date.now()}`;
      
      // Connect to server
      const ssh = await sshManager.connectToServer(serverId);
      
      // Create PTY for interactive terminal
      const pty = await ssh.requestShell();
      
      // Store the session
      sshSessions.set(sessionId, { client: ws, ssh, pty });
      
      // Send session ID to client
      ws.send(JSON.stringify({ type: 'session', sessionId }));
      
      // Handle data from SSH
      pty.on('data', (data: Buffer) => {
        ws.send(JSON.stringify({ 
          type: 'output', 
          data: data.toString('base64')
        }));
      });
      
      // Handle terminal size changes
      pty.on('resize', (cols: number, rows: number) => {
        ws.send(JSON.stringify({ type: 'resize', cols, rows }));
      });
      
      // Handle close
      pty.on('close', () => {
        ws.close();
        sshSessions.delete(sessionId);
      });
      
      // Handle data from client
      ws.on('message', (message: any) => {
        try {
          const data = JSON.parse(message.toString());
          
          if (data.type === 'input') {
            pty.write(Buffer.from(data.data, 'base64'));
          } else if (data.type === 'resize') {
            if (pty && typeof pty.resize === 'function' && data.cols && data.rows) {
              try {
                pty.resize(data.cols, data.rows);
              } catch (err) {
                console.warn('Resize operation failed:', err);
              }
            }
          }
        } catch (error) {
          console.error('Failed to process websocket message:', error);
        }
      });
      
      // Handle WebSocket close
      ws.on('close', () => {
        const session = sshSessions.get(sessionId);
        if (session && session.pty && typeof session.pty.close === 'function') {
          try {
            session.pty.close();
          } catch (err) {
            console.warn('Error closing PTY:', err);
          }
        }
        sshSessions.delete(sessionId);
      });
    } catch (error: any) {
      console.error('WebSocket connection error:', error);
      ws.send(JSON.stringify({ 
        type: 'error', 
        message: error.message 
      }));
      ws.close();
    }
  });

  // API Routes
  
  // Servers
  app.get('/api/servers', requirePermission('view_servers'), async (req: Request, res: Response) => {
    try {
      const servers = await storage.getServers();
      res.json(servers);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
  
  app.get('/api/servers/:id', requirePermission('view_servers'), async (req: Request, res: Response) => {
    try {
      const serverId = parseInt(req.params.id);
      const server = await storage.getServer(serverId);
      
      if (!server) {
        return res.status(404).json({ message: 'Server not found' });
      }
      
      res.json(server);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
  
  app.post('/api/servers', requirePermission('manage_servers'), async (req: Request, res: Response) => {
    try {
      // Validate request data
      const serverData = insertServerSchema.parse(req.body);
      
      // Encrypt auth data (password or key)
      serverData.authData = encrypt(serverData.authData);
      
      // Add creator ID
      serverData.createdById = req.user!.id;
      
      // Create server
      const server = await storage.createServer(serverData);
      
      res.status(201).json(server);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: 'Invalid server data', errors: error.errors });
      }
      res.status(500).json({ message: error.message });
    }
  });
  
  app.put('/api/servers/:id', requirePermission('manage_servers'), async (req: Request, res: Response) => {
    try {
      const serverId = parseInt(req.params.id);
      const server = await storage.getServer(serverId);
      
      if (!server) {
        return res.status(404).json({ message: 'Server not found' });
      }
      
      // Validate request data
      const serverData = insertServerSchema.partial().parse(req.body);
      
      // Encrypt auth data if provided
      if (serverData.authData) {
        serverData.authData = encrypt(serverData.authData);
      }
      
      // Update server
      const updatedServer = await storage.updateServer(serverId, serverData);
      
      res.json(updatedServer);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: 'Invalid server data', errors: error.errors });
      }
      res.status(500).json({ message: error.message });
    }
  });
  
  app.delete('/api/servers/:id', requirePermission('manage_servers'), async (req: Request, res: Response) => {
    try {
      const serverId = parseInt(req.params.id);
      const server = await storage.getServer(serverId);
      
      if (!server) {
        return res.status(404).json({ message: 'Server not found' });
      }
      
      // Delete server
      await storage.deleteServer(serverId);
      
      // Close any open SSH connections
      sshManager.disconnectFromServer(serverId);
      
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
  
  app.post('/api/servers/test-connection', requirePermission('manage_servers'), async (req: Request, res: Response) => {
    try {
      const result = await sshManager.testConnection(req.body);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
  
  // Server Metrics
  app.get('/api/servers/:id/metrics', requirePermission('view_servers'), async (req: Request, res: Response) => {
    try {
      const serverId = parseInt(req.params.id);
      const server = await storage.getServer(serverId);
      
      if (!server) {
        return res.status(404).json({ message: 'Server not found' });
      }
      
      const metrics = await storage.getServerMetrics(serverId);
      res.json(metrics);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
  
  app.post('/api/servers/:id/fetch-metrics', requirePermission('manage_servers'), async (req: Request, res: Response) => {
    try {
      const serverId = parseInt(req.params.id);
      const server = await storage.getServer(serverId);
      
      if (!server) {
        return res.status(404).json({ message: 'Server not found' });
      }
      
      await sshManager.fetchServerMetrics(serverId, req.user!.id);
      
      const metrics = await storage.getServerMetrics(serverId);
      res.json(metrics.length > 0 ? metrics[metrics.length - 1] : null);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
  
  // Commands
  app.post('/api/servers/:id/execute', requirePermission('execute_commands'), async (req: Request, res: Response) => {
    try {
      const serverId = parseInt(req.params.id);
      const server = await storage.getServer(serverId);
      
      if (!server) {
        return res.status(404).json({ message: 'Server not found' });
      }
      
      const { command } = req.body;
      
      if (!command) {
        return res.status(400).json({ message: 'Command is required' });
      }
      
      const result = await sshManager.executeCommand(serverId, command, req.user!.id);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
  
  app.get('/api/servers/:id/commands', requirePermission('view_commands'), async (req: Request, res: Response) => {
    try {
      const serverId = parseInt(req.params.id);
      const server = await storage.getServer(serverId);
      
      if (!server) {
        return res.status(404).json({ message: 'Server not found' });
      }
      
      const commands = await storage.getCommandsByServer(serverId);
      res.json(commands);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
  
  // Get all commands across all servers
  app.get('/api/commands', requirePermission('view_commands'), async (req: Request, res: Response) => {
    try {
      const commands = await storage.getAllCommands();
      res.json(commands);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Playbooks
  app.get('/api/playbooks', requirePermission('view_playbooks'), async (req: Request, res: Response) => {
    try {
      const playbooks = await storage.getPlaybooks();
      res.json(playbooks);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
  
  app.get('/api/playbooks/:id', requirePermission('view_playbooks'), async (req: Request, res: Response) => {
    try {
      const playbookId = parseInt(req.params.id);
      const playbook = await storage.getPlaybook(playbookId);
      
      if (!playbook) {
        return res.status(404).json({ message: 'Playbook not found' });
      }
      
      res.json(playbook);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
  
  app.post('/api/playbooks', requirePermission('manage_playbooks'), async (req: Request, res: Response) => {
    try {
      // Create a partial schema without requiring createdById
      const partialSchema = insertPlaybookSchema.omit({ createdById: true });
      
      // Validate the request data
      const reqData = partialSchema.parse(req.body);
      
      // Create the full playbook data with createdById
      const playbookData = {
        ...reqData,
        createdById: req.user!.id,
      };
      
      // Create playbook
      const playbook = await storage.createPlaybook(playbookData);
      
      res.status(201).json(playbook);
    } catch (error: any) {
      console.error("Playbook creation error:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: 'Invalid playbook data', errors: error.errors });
      }
      res.status(500).json({ message: error.message });
    }
  });
  
  app.put('/api/playbooks/:id', requirePermission('manage_playbooks'), async (req: Request, res: Response) => {
    try {
      const playbookId = parseInt(req.params.id);
      const playbook = await storage.getPlaybook(playbookId);
      
      if (!playbook) {
        return res.status(404).json({ message: 'Playbook not found' });
      }
      
      // Create a partial schema without createdById
      const partialSchema = insertPlaybookSchema.omit({ createdById: true }).partial();
      
      // Validate the request data using the partial schema
      const reqData = partialSchema.parse(req.body);
      
      // Update playbook
      const updatedPlaybook = await storage.updatePlaybook(playbookId, reqData);
      
      res.json(updatedPlaybook);
    } catch (error: any) {
      console.error("Playbook update error:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: 'Invalid playbook data', errors: error.errors });
      }
      res.status(500).json({ message: error.message });
    }
  });
  
  app.delete('/api/playbooks/:id', requirePermission('manage_playbooks'), async (req: Request, res: Response) => {
    try {
      const playbookId = parseInt(req.params.id);
      const playbook = await storage.getPlaybook(playbookId);
      
      if (!playbook) {
        return res.status(404).json({ message: 'Playbook not found' });
      }
      
      // Delete playbook
      await storage.deletePlaybook(playbookId);
      
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
  
  // Tasks
  app.get('/api/tasks', requirePermission('view_logs'), async (req: Request, res: Response) => {
    try {
      const serverId = req.query.serverId ? parseInt(req.query.serverId as string) : undefined;
      
      if (serverId) {
        // If serverId is provided, filter tasks by server
        const tasks = await storage.getTasksByServer(serverId);
        res.json(tasks);
      } else {
        // Otherwise, get all tasks
        const tasks = await storage.getTasks();
        res.json(tasks);
      }
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
  
  app.get('/api/tasks/:id', requirePermission('view_logs'), async (req: Request, res: Response) => {
    try {
      const taskId = parseInt(req.params.id);
      const task = await storage.getTask(taskId);
      
      if (!task) {
        return res.status(404).json({ message: 'Task not found' });
      }
      
      res.json(task);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
  
  app.post('/api/tasks', requirePermission('schedule_tasks'), async (req: Request, res: Response) => {
    try {
      console.log("📥 Task creation request:", JSON.stringify(req.body, null, 2));
      
      // Create a partial schema without requiring createdById
      const partialSchema = insertTaskSchema.omit({ createdById: true, executedById: true });
      
      // Validate request data with partial schema
      let reqData;
      try {
        reqData = partialSchema.parse(req.body);
        console.log("✅ Base validation passed");
      } catch (validationError: any) {
        console.error("❌ Base validation failed:", validationError);
        return res.status(400).json({ 
          message: 'Invalid task data', 
          errors: validationError.errors || validationError.message,
          location: 'base schema' 
        });
      }
      
      // Create the full task data with user tracking
      const taskData = {
        ...reqData,
        createdById: req.user!.id,
        executedById: req.user!.id // Track who is running this task
      };
      
      console.log("👤 Added user data:", { createdById: req.user!.id, executedById: req.user!.id });
      
      // Validate task config based on type
      try {
        if (taskData.type === 'command') {
          console.log("⚙️ Validating command config:", JSON.stringify(taskData.config, null, 2));
          commandTaskConfigSchema.parse(taskData.config);
        } else if (taskData.type === 'playbook') {
          console.log("⚙️ Validating playbook config:", JSON.stringify(taskData.config, null, 2));
          playbookTaskConfigSchema.parse(taskData.config);
        } else if (taskData.type === 'system') {
          console.log("⚙️ Validating system config:", JSON.stringify(taskData.config, null, 2));
          systemTaskConfigSchema.parse(taskData.config);
        } else if (taskData.type === 'vulnerability_scan') {
          console.log("⚙️ Validating vulnerability scan config:", JSON.stringify(taskData.config, null, 2));
          vulnerabilityScanTaskConfigSchema.parse(taskData.config);
        }
        console.log("✅ Config validation passed");
      } catch (configError: any) {
        console.error("❌ Config validation failed:", configError);
        return res.status(400).json({ 
          message: 'Invalid task configuration', 
          errors: configError.errors || configError.message,
          type: taskData.type,
          location: 'config schema'
        });
      }
      
      // Create task
      console.log("📝 Creating task in database:", JSON.stringify(taskData, null, 2));
      let task;
      try {
        task = await storage.createTask(taskData);
        console.log("✅ Task created successfully with ID:", task.id);
      } catch (storageError: any) {
        console.error("❌ Database error:", storageError);
        return res.status(500).json({ 
          message: 'Database error creating task', 
          error: storageError.message,
          location: 'storage'
        });
      }
      
      // Add to the queue for immediate execution
      try {
        console.log("🚀 Adding task to execution queue:", task.id);
        await taskQueue.addTask(task.id);
        console.log("✅ Task added to queue successfully");
      } catch (queueError: any) {
        console.error("⚠️ Queue warning:", queueError);
        // Don't fail the request if queueing fails, just log it
      }
      
      console.log("🎉 Task creation complete!");
      res.status(201).json(task);
    } catch (error: any) {
      console.error("❌ Task creation error:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ 
          message: 'Invalid task data', 
          errors: error.errors,
          location: 'unknown schema'
        });
      }
      res.status(500).json({ 
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined 
      });
    }
  });
  
  app.post('/api/tasks/:id/run', requirePermission('schedule_tasks'), async (req: Request, res: Response) => {
    try {
      const taskId = parseInt(req.params.id);
      const task = await storage.getTask(taskId);
      
      if (!task) {
        return res.status(404).json({ message: 'Task not found' });
      }
      
      // Only allow running tasks that aren't already running
      if (task.status === 'running') {
        return res.status(400).json({ message: 'Task is already running' });
      }
      
      // Reset task status and track executing user
      await storage.updateTask(taskId, { 
        status: 'queued',
        executedById: req.user!.id // Track who is running the task
      });
      
      // Add to queue
      taskQueue.addTask(taskId);
      
      res.json({ message: 'Task queued for execution' });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
  
  app.put('/api/tasks/:id/schedule', requirePermission('schedule_tasks'), async (req: Request, res: Response) => {
    try {
      // Send a message explaining that task scheduling has been removed
      res.status(400).json({ 
        message: 'Task scheduling has been removed. Tasks now run immediately when created.'
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
  
  app.delete('/api/tasks/:id', requirePermission('schedule_tasks'), async (req: Request, res: Response) => {
    try {
      const taskId = parseInt(req.params.id);
      const task = await storage.getTask(taskId);
      
      if (!task) {
        return res.status(404).json({ message: 'Task not found' });
      }
      
      // Use the task queue's delete method which handles everything
      const success = await taskQueue.deleteTask(taskId);
      
      if (success) {
        res.status(204).send();
      } else {
        res.status(500).json({ message: 'Failed to delete task' });
      }
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
  
  // Task control endpoints - pause, resume, stop
  app.post('/api/tasks/:id/pause', requirePermission('schedule_tasks'), async (req: Request, res: Response) => {
    try {
      const taskId = parseInt(req.params.id);
      const task = await storage.getTask(taskId);
      
      if (!task) {
        return res.status(404).json({ message: 'Task not found' });
      }
      
      const success = await taskQueue.pauseTask(taskId);
      
      if (success) {
        res.status(200).json({ success: true });
      } else {
        res.status(400).json({ message: 'Failed to pause task' });
      }
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
  
  app.post('/api/tasks/:id/resume', requirePermission('schedule_tasks'), async (req: Request, res: Response) => {
    try {
      const taskId = parseInt(req.params.id);
      const task = await storage.getTask(taskId);
      
      if (!task) {
        return res.status(404).json({ message: 'Task not found' });
      }
      
      const success = await taskQueue.resumeTask(taskId);
      
      if (success) {
        res.status(200).json({ success: true });
      } else {
        res.status(400).json({ message: 'Failed to resume task' });
      }
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
  
  app.post('/api/tasks/:id/stop', requirePermission('schedule_tasks'), async (req: Request, res: Response) => {
    try {
      const taskId = parseInt(req.params.id);
      const task = await storage.getTask(taskId);
      
      if (!task) {
        return res.status(404).json({ message: 'Task not found' });
      }
      
      const success = await taskQueue.stopTask(taskId);
      
      if (success) {
        res.status(200).json({ success: true });
      } else {
        res.status(400).json({ message: 'Failed to stop task' });
      }
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
  
  app.get('/api/tasks/active', requirePermission('view_logs'), async (req: Request, res: Response) => {
    try {
      const activeTasks = taskQueue.getActiveTasks();
      const tasks = [];
      
      for (const taskId of activeTasks) {
        const task = await storage.getTask(taskId);
        if (task) {
          tasks.push(task);
        }
      }
      
      res.json(tasks);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
  
  // Debug auth endpoint
  app.get('/api/auth-debug', (req: Request, res: Response) => {
    const auth = {
      isAuthenticated: req.isAuthenticated(),
      user: req.user ? { 
        id: req.user.id, 
        username: req.user.username, 
        role: req.user.role 
      } : null,
      hasManageUsersPermission: req.isAuthenticated() && req.hasPermission('manage_users')
    };
    console.log("Auth debug:", auth);
    res.json(auth);
  });

  // User Management (Admin only)
  app.get('/api/users', requirePermission('manage_users'), async (req: Request, res: Response) => {
    try {
      const users = await storage.getAllUsers();
      
      // Remove passwords before sending
      const safeUsers = users.map(user => {
        // Ensure user is typed correctly before destructuring
        const typedUser = user as SelectUser;
        const { password, ...safeUser } = typedUser;
        return safeUser;
      });
      
      res.json(safeUsers);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
  
  // Get a single user by ID
  app.get('/api/users/:id', async (req: Request, res: Response) => {
    // We removed the permission requirement to allow all authenticated users
    // to fetch user info for display in task details
    try {
      const userId = parseInt(req.params.id);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Remove password before sending
      const { password, ...safeUser } = user;
      res.json(safeUser);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
  
  // Update user's role
  app.put('/api/users/:id/role', requirePermission('manage_users'), async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.id);
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      
      // Check if this is the default admin user (username: admin)
      // Prevent changing role for the default admin account
      if (user.username === 'admin') {
        return res.status(403).json({ 
          message: 'Cannot change role for the default admin account'
        });
      }
      
      const { role } = req.body;
      
      if (!role || !['admin', 'operator', 'viewer'].includes(role)) {
        return res.status(400).json({ message: 'Invalid role' });
      }
      
      // Update user
      const updatedUser = await storage.updateUser(userId, { role });
      
      // Remove password before sending
      const typedUser = updatedUser! as SelectUser;
      const { password, ...safeUser } = typedUser;
      
      res.json(safeUser);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
  
  // Update user's general information (name, email, etc.)
  app.put('/api/users/:id', requirePermission('manage_users'), async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.id);
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      
      // Only allow updating certain fields
      const { email, twoFactorEnabled } = req.body;
      
      const updateData: Partial<User> = {};
      if (email !== undefined) updateData.email = email;
      if (twoFactorEnabled !== undefined) updateData.twoFactorEnabled = twoFactorEnabled;
      
      // Update user
      const updatedUser = await storage.updateUser(userId, updateData);
      
      // Remove password before sending
      const typedUser = updatedUser! as SelectUser;
      const { password, ...safeUser } = typedUser;
      
      res.json(safeUser);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
  
  // Delete a user
  app.delete('/api/users/:id', requirePermission('manage_users'), async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.id);
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      
      // Protection for the default admin account
      if (user.username === 'admin') {
        return res.status(403).json({ 
          message: 'The default admin account cannot be deleted for security reasons'
        });
      }
      
      // Prevent admins from deleting themselves
      if (user.id === req.user!.id) {
        return res.status(403).json({ 
          message: 'You cannot delete your own account' 
        });
      }
      
      // Check if this is the last admin account
      const allUsers = await storage.getAllUsers();
      const adminUsers = allUsers.filter(u => u.role === 'admin');
      
      if (user.role === 'admin' && adminUsers.length <= 1) {
        return res.status(403).json({ 
          message: 'Cannot delete the last admin account' 
        });
      }
      
      await storage.deleteUser(userId);
      res.status(200).json({ message: 'User deleted successfully' });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Vulnerability scan endpoints
  app.post('/api/servers/:id/scan', requirePermission('scan_vulnerabilities'), async (req: Request, res: Response) => {
    try {
      const serverId = parseInt(req.params.id);
      const server = await storage.getServer(serverId);
      
      if (!server) {
        return res.status(404).json({ message: 'Server not found' });
      }
      
      // Create a vulnerability scan task
      const taskData = {
        name: `Vulnerability scan for ${server.name}`,
        description: `Initiated by ${req.user!.username}`,
        type: 'vulnerability_scan',
        serverId: serverId,
        config: {
          scanType: req.body.scanType || 'full',
          options: req.body.options || {},
          serverId: serverId, // Include serverId in config
          type: 'vulnerability_scan'
        },
        createdById: req.user!.id,
        executedById: req.user!.id
      };
      
      // Create task
      const task = await storage.createTask(taskData);
      
      // Add to the queue for immediate execution
      taskQueue.addTask(task.id);
      
      res.status(201).json({
        message: 'Vulnerability scan initiated',
        taskId: task.id
      });
    } catch (error: any) {
      console.error("Vulnerability scan error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get('/api/vulnerability-scans', requirePermission('scan_vulnerabilities'), async (req: Request, res: Response) => {
    try {
      const serverId = req.query.serverId ? parseInt(req.query.serverId as string) : undefined;
      const scans = await storage.getVulnerabilityScans(serverId);
      res.json(scans);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get('/api/vulnerability-scans/:id', requirePermission('scan_vulnerabilities'), async (req: Request, res: Response) => {
    try {
      const scanId = parseInt(req.params.id);
      const scan = await storage.getVulnerabilityScan(scanId);
      
      if (!scan) {
        return res.status(404).json({ message: 'Vulnerability scan not found' });
      }
      
      res.json(scan);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get('/api/vulnerability-scans/:id/vulnerabilities', requirePermission('scan_vulnerabilities'), async (req: Request, res: Response) => {
    try {
      const scanId = parseInt(req.params.id);
      const scan = await storage.getVulnerabilityScan(scanId);
      
      if (!scan) {
        return res.status(404).json({ message: 'Vulnerability scan not found' });
      }
      
      const vulnerabilities = await storage.getVulnerabilities(scanId);
      res.json(vulnerabilities);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
  
  // Get vulnerability scan by task ID
  app.get('/api/tasks/:id/vulnerability-scan', requirePermission('scan_vulnerabilities'), async (req: Request, res: Response) => {
    try {
      const taskId = parseInt(req.params.id);
      const scans = await storage.getVulnerabilityScans();
      const scanForTask = scans.find(scan => scan.taskId === taskId);
      
      if (!scanForTask) {
        return res.status(404).json({ message: 'No vulnerability scan found for this task' });
      }
      
      res.json(scanForTask);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Malware Scan Endpoints
  app.post('/api/servers/:id/malware-scan', requirePermission('scan_malware'), async (req: Request, res: Response) => {
    try {
      const serverId = parseInt(req.params.id);
      const server = await storage.getServer(serverId);
      
      if (!server) {
        return res.status(404).json({ message: 'Server not found' });
      }

      const { scanDirectory = '/', scheduled = false } = req.body;
      
      if (scheduled) {
        // Create a scheduled task
        const taskData = {
          name: `Malware scan for ${server.name}`,
          description: `Initiated by ${req.user!.username}`,
          type: 'malware_scan',
          serverId: serverId,
          config: {
            scanDirectory: scanDirectory,
            type: 'malware_scan'
          },
          createdById: req.user!.id,
          executedById: req.user!.id
        };
        
        // Create task
        const task = await storage.createTask(taskData);
        
        // Add to the queue for immediate execution
        taskQueue.addTask(task.id);
        
        res.status(201).json({
          message: 'Malware scan task created',
          taskId: task.id
        });
      } else {
        // Start immediate scan
        const scanResult = await clamavScanner.runScan(serverId, req.user!.id, scanDirectory);
        
        if (!scanResult.success) {
          return res.status(500).json({ 
            message: scanResult.message,
            scanId: scanResult.scanId
          });
        }
        
        res.status(200).json({ 
          message: scanResult.message,
          scanId: scanResult.scanId
        });
      }
    } catch (error: any) {
      console.error("Malware scan error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get('/api/malware-scans', requirePermission('scan_malware'), async (req: Request, res: Response) => {
    try {
      const serverId = req.query.serverId ? parseInt(req.query.serverId as string) : undefined;
      const scans = await storage.getMalwareScans(serverId);
      res.json(scans);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get('/api/malware-scans/:id', requirePermission('scan_malware'), async (req: Request, res: Response) => {
    try {
      const scanId = parseInt(req.params.id);
      const scan = await storage.getMalwareScan(scanId);
      
      if (!scan) {
        return res.status(404).json({ message: 'Malware scan not found' });
      }
      
      res.json(scan);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get('/api/malware-scans/:id/threats', requirePermission('scan_malware'), async (req: Request, res: Response) => {
    try {
      const scanId = parseInt(req.params.id);
      const scan = await storage.getMalwareScan(scanId);
      
      if (!scan) {
        return res.status(404).json({ message: 'Malware scan not found' });
      }
      
      const threats = await storage.getMalwareThreats(scanId);
      res.json(threats);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
  
  // Get malware scan by task ID
  app.get('/api/tasks/:id/malware-scan', requirePermission('scan_malware'), async (req: Request, res: Response) => {
    try {
      const taskId = parseInt(req.params.id);
      const scans = await storage.getMalwareScans();
      const scanForTask = scans.find(scan => scan.taskId === taskId);
      
      if (!scanForTask) {
        return res.status(404).json({ message: 'No malware scan found for this task' });
      }
      
      res.json(scanForTask);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  return httpServer;
}
