import { 
  users, 
  servers, 
  serverMetrics, 
  commands, 
  playbooks, 
  tasks, 
  vulnerabilityScans, 
  vulnerabilities,
  malwareScans,
  malwareThreats 
} from "@shared/schema";
import type {
  User,
  InsertUser,
  Server,
  InsertServer,
  ServerMetrics,
  InsertServerMetrics,
  Command,
  InsertCommand,
  Playbook,
  InsertPlaybook,
  Task,
  InsertTask,
  VulnerabilityScan,
  InsertVulnerabilityScan,
  Vulnerability,
  InsertVulnerability,
  MalwareScan,
  InsertMalwareScan,
  MalwareThreat,
  InsertMalwareThreat
} from "@shared/schema";
import connectPg from "connect-pg-simple";
import session from "express-session";
import { db, pool } from "./db";
import { eq, desc, and, sql, inArray } from "drizzle-orm";

// Define the SessionStore interface
type SessionStore = session.Store;

export interface IStorage {
  // User management
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, user: Partial<User>): Promise<User | undefined>;
  deleteUser(id: number): Promise<boolean>;
  
  // Server management
  getServer(id: number): Promise<Server | undefined>;
  getServers(): Promise<Server[]>;
  getServersByTag(tag: string): Promise<Server[]>;
  createServer(server: InsertServer): Promise<Server>;
  updateServer(id: number, server: Partial<Server>): Promise<Server | undefined>;
  deleteServer(id: number): Promise<boolean>;
  
  // Server metrics
  getServerMetrics(serverId: number): Promise<ServerMetrics[]>;
  createServerMetrics(metrics: InsertServerMetrics): Promise<ServerMetrics>;
  
  // Commands
  getCommandsByServer(serverId: number): Promise<Command[]>;
  getCommandsByUser(userId: number): Promise<Command[]>;
  getAllCommands(): Promise<Command[]>;
  createCommand(command: InsertCommand): Promise<Command>;
  
  // Playbooks
  getPlaybook(id: number): Promise<Playbook | undefined>;
  getPlaybooks(): Promise<Playbook[]>;
  createPlaybook(playbook: InsertPlaybook): Promise<Playbook>;
  updatePlaybook(id: number, playbook: Partial<Playbook>): Promise<Playbook | undefined>;
  deletePlaybook(id: number): Promise<boolean>;
  
  // Tasks
  getTask(id: number): Promise<Task | undefined>;
  getTasks(): Promise<Task[]>;
  getTasksByServer(serverId: number): Promise<Task[]>;
  getTasksByStatus(status: string): Promise<Task[]>;
  createTask(task: InsertTask): Promise<Task>;
  updateTask(id: number, task: Partial<Task>): Promise<Task | undefined>;
  deleteTask(id: number): Promise<boolean>;
  
  // Vulnerability scans
  getVulnerabilityScan(id: number): Promise<VulnerabilityScan | undefined>;
  getVulnerabilityScans(serverId?: number): Promise<VulnerabilityScan[]>;
  createVulnerabilityScan(scan: InsertVulnerabilityScan): Promise<VulnerabilityScan>;
  updateVulnerabilityScan(id: number, scan: Partial<VulnerabilityScan>): Promise<VulnerabilityScan | undefined>;
  deleteVulnerabilityScan(id: number): Promise<boolean>;
  
  // Vulnerabilities
  getVulnerabilities(scanId: number): Promise<Vulnerability[]>;
  createVulnerability(vulnerability: InsertVulnerability): Promise<Vulnerability>;
  
  // Malware scans
  getMalwareScan(id: number): Promise<MalwareScan | undefined>;
  getMalwareScans(serverId?: number): Promise<MalwareScan[]>;
  createMalwareScan(scan: InsertMalwareScan): Promise<MalwareScan>;
  updateMalwareScan(id: number, scan: Partial<MalwareScan>): Promise<MalwareScan | undefined>;
  deleteMalwareScan(id: number): Promise<boolean>;
  
  // Malware threats
  getMalwareThreats(scanId: number): Promise<MalwareThreat[]>;
  createMalwareThreat(threat: InsertMalwareThreat): Promise<MalwareThreat>;
  updateMalwareThreat(id: number, threat: Partial<MalwareThreat>): Promise<MalwareThreat | undefined>;
  
  // Session store
  sessionStore: SessionStore;
}

// For session storage
import createMemoryStore from "memorystore";
const MemoryStore = createMemoryStore(session);

export class DatabaseStorage implements IStorage {
  sessionStore: SessionStore;

  constructor() {
    // Use memory store instead of PostgreSQL store due to pool client compatibility issues
    this.sessionStore = new MemoryStore({
      checkPeriod: 86400000 // Prune expired entries every 24h
    });
    
    console.log("Using MemoryStore for session storage");
  }

  // User management
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }
  
  async getAllUsers(): Promise<User[]> {
    return db.select().from(users);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }
  
  async updateUser(id: number, userData: Partial<User>): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set(userData)
      .where(eq(users.id, id))
      .returning();
    return user;
  }
  
  async deleteUser(id: number): Promise<boolean> {
    const result = await db.delete(users).where(eq(users.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }
  
  // Server management
  async getServer(id: number): Promise<Server | undefined> {
    const [server] = await db.select().from(servers).where(eq(servers.id, id));
    return server;
  }
  
  async getServers(): Promise<Server[]> {
    return db.select().from(servers);
  }
  
  async getServersByTag(tag: string): Promise<Server[]> {
    return db
      .select()
      .from(servers)
      .where(sql`${servers.tags} ? ${tag}`);
  }
  
  async createServer(insertServer: InsertServer): Promise<Server> {
    const [server] = await db
      .insert(servers)
      .values({
        ...insertServer,
        status: 'unknown',
        lastChecked: new Date()
      })
      .returning();
    return server;
  }
  
  async updateServer(id: number, serverData: Partial<Server>): Promise<Server | undefined> {
    const [server] = await db
      .update(servers)
      .set(serverData)
      .where(eq(servers.id, id))
      .returning();
    return server;
  }
  
  async deleteServer(id: number): Promise<boolean> {
    const result = await db.delete(servers).where(eq(servers.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }
  
  // Server metrics
  async getServerMetrics(serverId: number): Promise<ServerMetrics[]> {
    return db
      .select()
      .from(serverMetrics)
      .where(eq(serverMetrics.serverId, serverId))
      .orderBy(desc(serverMetrics.timestamp))
      .limit(100);
  }
  
  async createServerMetrics(insertMetrics: InsertServerMetrics): Promise<ServerMetrics> {
    const [metrics] = await db
      .insert(serverMetrics)
      .values({
        ...insertMetrics,
        timestamp: new Date()
      })
      .returning();
    return metrics;
  }
  
  // Commands
  async getCommandsByServer(serverId: number): Promise<Command[]> {
    return db
      .select()
      .from(commands)
      .where(eq(commands.serverId, serverId))
      .orderBy(desc(commands.timestamp));
  }
  
  async getCommandsByUser(userId: number): Promise<Command[]> {
    return db
      .select()
      .from(commands)
      .where(eq(commands.userId, userId))
      .orderBy(desc(commands.timestamp));
  }
  
  async getAllCommands(): Promise<Command[]> {
    return db
      .select()
      .from(commands)
      .orderBy(desc(commands.timestamp));
  }
  
  async createCommand(insertCommand: InsertCommand): Promise<Command> {
    const [command] = await db
      .insert(commands)
      .values({
        ...insertCommand,
        timestamp: new Date()
      })
      .returning();
    return command;
  }
  
  // Playbooks
  async getPlaybook(id: number): Promise<Playbook | undefined> {
    const [playbook] = await db.select().from(playbooks).where(eq(playbooks.id, id));
    return playbook;
  }
  
  async getPlaybooks(): Promise<Playbook[]> {
    return db.select().from(playbooks);
  }
  
  async createPlaybook(insertPlaybook: InsertPlaybook): Promise<Playbook> {
    const now = new Date();
    const [playbook] = await db
      .insert(playbooks)
      .values({
        ...insertPlaybook,
        createdAt: now,
        updatedAt: now
      })
      .returning();
    return playbook;
  }
  
  async updatePlaybook(id: number, playbookData: Partial<Playbook>): Promise<Playbook | undefined> {
    const [playbook] = await db
      .update(playbooks)
      .set({
        ...playbookData,
        updatedAt: new Date()
      })
      .where(eq(playbooks.id, id))
      .returning();
    return playbook;
  }
  
  async deletePlaybook(id: number): Promise<boolean> {
    const result = await db.delete(playbooks).where(eq(playbooks.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }
  
  // Tasks
  async getTask(id: number): Promise<Task | undefined> {
    const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
    return task;
  }
  
  async getTasks(): Promise<Task[]> {
    return db.select().from(tasks);
  }
  
  async getTasksByServer(serverId: number): Promise<Task[]> {
    return db
      .select()
      .from(tasks)
      .where(
        sql`${tasks.serverId} = ${serverId} OR ${serverId} = ANY(${tasks.serverIds})`
      );
  }
  
  async getTasksByStatus(status: string): Promise<Task[]> {
    return db
      .select()
      .from(tasks)
      .where(sql`${tasks.status}::text = ${status}`);
  }
  
  async createTask(insertTask: InsertTask): Promise<Task> {
    const [task] = await db
      .insert(tasks)
      .values({
        ...insertTask,
        status: 'queued',
        createdAt: new Date()
      })
      .returning();
    return task;
  }
  
  async updateTask(id: number, taskData: Partial<Task>): Promise<Task | undefined> {
    const [task] = await db
      .update(tasks)
      .set(taskData)
      .where(eq(tasks.id, id))
      .returning();
    return task;
  }
  
  async deleteTask(id: number): Promise<boolean> {
    const result = await db.delete(tasks).where(eq(tasks.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }
  
  // Vulnerability scans
  async getVulnerabilityScan(id: number): Promise<VulnerabilityScan | undefined> {
    const [scan] = await db.select().from(vulnerabilityScans).where(eq(vulnerabilityScans.id, id));
    return scan;
  }
  
  async getVulnerabilityScans(serverId?: number): Promise<VulnerabilityScan[]> {
    if (serverId) {
      return db
        .select()
        .from(vulnerabilityScans)
        .where(eq(vulnerabilityScans.serverId, serverId))
        .orderBy(desc(vulnerabilityScans.scanDate));
    }
    
    return db
      .select()
      .from(vulnerabilityScans)
      .orderBy(desc(vulnerabilityScans.scanDate));
  }
  
  async createVulnerabilityScan(insertScan: InsertVulnerabilityScan): Promise<VulnerabilityScan> {
    const [scan] = await db
      .insert(vulnerabilityScans)
      .values({
        ...insertScan,
        scanDate: new Date(),
      })
      .returning();
    return scan;
  }
  
  async updateVulnerabilityScan(id: number, scanData: Partial<VulnerabilityScan>): Promise<VulnerabilityScan | undefined> {
    const [scan] = await db
      .update(vulnerabilityScans)
      .set(scanData)
      .where(eq(vulnerabilityScans.id, id))
      .returning();
    return scan;
  }
  
  async deleteVulnerabilityScan(id: number): Promise<boolean> {
    const result = await db.delete(vulnerabilityScans).where(eq(vulnerabilityScans.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }
  
  // Vulnerabilities
  async getVulnerabilities(scanId: number): Promise<Vulnerability[]> {
    return db
      .select()
      .from(vulnerabilities)
      .where(eq(vulnerabilities.scanId, scanId))
      .orderBy(desc(vulnerabilities.severity));
  }
  
  async createVulnerability(insertVulnerability: InsertVulnerability): Promise<Vulnerability> {
    const [vulnerability] = await db
      .insert(vulnerabilities)
      .values(insertVulnerability)
      .returning();
    return vulnerability;
  }

  // Malware scans
  async getMalwareScan(id: number): Promise<MalwareScan | undefined> {
    const [scan] = await db.select().from(malwareScans).where(eq(malwareScans.id, id));
    return scan;
  }
  
  async getMalwareScans(serverId?: number): Promise<MalwareScan[]> {
    if (serverId) {
      return db
        .select()
        .from(malwareScans)
        .where(eq(malwareScans.serverId, serverId))
        .orderBy(desc(malwareScans.scanDate));
    }
    
    return db
      .select()
      .from(malwareScans)
      .orderBy(desc(malwareScans.scanDate));
  }
  
  async createMalwareScan(insertScan: InsertMalwareScan): Promise<MalwareScan> {
    const [scan] = await db
      .insert(malwareScans)
      .values({
        ...insertScan,
        scanDate: new Date(),
      })
      .returning();
    return scan;
  }
  
  async updateMalwareScan(id: number, scanData: Partial<MalwareScan>): Promise<MalwareScan | undefined> {
    const [scan] = await db
      .update(malwareScans)
      .set(scanData)
      .where(eq(malwareScans.id, id))
      .returning();
    return scan;
  }
  
  async deleteMalwareScan(id: number): Promise<boolean> {
    const result = await db.delete(malwareScans).where(eq(malwareScans.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }
  
  // Malware threats
  async getMalwareThreats(scanId: number): Promise<MalwareThreat[]> {
    return db
      .select()
      .from(malwareThreats)
      .where(eq(malwareThreats.scanId, scanId))
      .orderBy(desc(malwareThreats.filePath));
  }
  
  async createMalwareThreat(insertThreat: InsertMalwareThreat): Promise<MalwareThreat> {
    const [threat] = await db
      .insert(malwareThreats)
      .values(insertThreat)
      .returning();
    return threat;
  }
  
  async updateMalwareThreat(id: number, threatData: Partial<MalwareThreat>): Promise<MalwareThreat | undefined> {
    const [threat] = await db
      .update(malwareThreats)
      .set(threatData)
      .where(eq(malwareThreats.id, id))
      .returning();
    return threat;
  }
}

export const storage = new DatabaseStorage();
