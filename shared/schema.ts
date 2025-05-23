import { pgTable, text, serial, integer, boolean, timestamp, json, pgEnum, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Enums
export const userRoleEnum = pgEnum('user_role', ['admin', 'operator', 'viewer']);
export const serverStatusEnum = pgEnum('server_status', ['online', 'offline', 'unknown', 'error']);
export const taskStatusEnum = pgEnum('task_status', ['queued', 'running', 'paused', 'stopped', 'success', 'failed']);
export const authTypeEnum = pgEnum('auth_type', ['password', 'key']);
export const scanSeverityEnum = pgEnum('scan_severity', ['low', 'medium', 'high', 'critical']);
export const malwareCategoryEnum = pgEnum('malware_category', ['virus', 'trojan', 'spyware', 'ransomware', 'rootkit', 'backdoor', 'other']);

// Users table
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  role: userRoleEnum("role").notNull().default('viewer'),
  email: text("email").notNull(),
  twoFactorEnabled: boolean("two_factor_enabled").default(false),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  email: true,
  role: true,
});

// Servers table
export const servers = pgTable("servers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  hostname: text("hostname").notNull(),
  ipAddress: text("ip_address").notNull(),
  port: integer("port").default(22),
  username: text("username").notNull(),
  authType: authTypeEnum("auth_type").notNull(),
  authData: text("auth_data").notNull(), // encrypted password or key
  tags: text("tags").array(),
  os: text("os"),
  status: serverStatusEnum("status").default('unknown'),
  lastChecked: timestamp("last_checked"),
  createdById: integer("created_by_id"),
});

export const insertServerSchema = createInsertSchema(servers).pick({
  name: true,
  hostname: true,
  ipAddress: true,
  port: true,
  username: true,
  authType: true,
  authData: true,
  tags: true,
  os: true,
  createdById: true,
});

// Server metrics
export const serverMetrics = pgTable("server_metrics", {
  id: serial("id").primaryKey(),
  serverId: integer("server_id").notNull(),
  timestamp: timestamp("timestamp").defaultNow(),
  cpuUsage: integer("cpu_usage"), // percentage
  memoryUsage: integer("memory_usage"), // percentage
  diskUsage: integer("disk_usage"), // percentage
  uptime: integer("uptime"), // seconds
  loadAverage: text("load_average").array(), // 1m, 5m, 15m
});

export const insertServerMetricsSchema = createInsertSchema(serverMetrics).pick({
  serverId: true,
  cpuUsage: true,
  memoryUsage: true,
  diskUsage: true,
  uptime: true,
  loadAverage: true,
});

// Commands
export const commands = pgTable("commands", {
  id: serial("id").primaryKey(),
  command: text("command").notNull(),
  serverId: integer("server_id").notNull(),
  userId: integer("user_id").notNull(),
  timestamp: timestamp("timestamp").defaultNow(),
  output: text("output"),
  exitCode: integer("exit_code"),
});

export const insertCommandSchema = createInsertSchema(commands).pick({
  command: true,
  serverId: true,
  userId: true,
  output: true,
  exitCode: true,
});

// Playbooks
export const playbooks = pgTable("playbooks", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  content: text("content").notNull(), // YAML content
  createdById: integer("created_by_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPlaybookSchema = createInsertSchema(playbooks).pick({
  name: true,
  description: true,
  content: true,
  createdById: true,
});

// Tasks (for jobs/automation)
export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(), // command, playbook, system
  config: json("config").notNull(), // varies by task type
  status: taskStatusEnum("status").default('queued'),
  output: text("output"),
  exitCode: integer("exit_code"),
  serverId: integer("server_id"), // can be null for multi-server tasks
  serverIds: integer("server_ids").array(), // for tasks on multiple servers
  playbookId: integer("playbook_id"), // if task is a playbook
  createdById: integer("created_by_id").notNull(), // user who created the task
  executedById: integer("executed_by_id"), // user who executed/ran the task
  createdAt: timestamp("created_at").defaultNow(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
});

export const insertTaskSchema = createInsertSchema(tasks).pick({
  name: true,
  type: true,
  config: true,
  serverId: true,
  serverIds: true,
  playbookId: true,
  createdById: true,
  executedById: true,
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Server = typeof servers.$inferSelect;
export type InsertServer = z.infer<typeof insertServerSchema>;

export type ServerMetrics = typeof serverMetrics.$inferSelect;
export type InsertServerMetrics = z.infer<typeof insertServerMetricsSchema>;

export type Command = typeof commands.$inferSelect;
export type InsertCommand = z.infer<typeof insertCommandSchema>;

export type Playbook = typeof playbooks.$inferSelect;
export type InsertPlaybook = z.infer<typeof insertPlaybookSchema>;

export type Task = typeof tasks.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;

// Vulnerability Scans
export const vulnerabilityScans = pgTable("vulnerability_scans", {
  id: serial("id").primaryKey(),
  serverId: integer("server_id").notNull().references(() => servers.id, { onDelete: 'cascade' }),
  scanDate: timestamp("scan_date").defaultNow(),
  status: taskStatusEnum("status").default('queued'),
  lowCount: integer("low_count").default(0),
  mediumCount: integer("medium_count").default(0),
  highCount: integer("high_count").default(0), 
  criticalCount: integer("critical_count").default(0),
  // Field doesn't exist in database
  // rawOutputPath: text("raw_output_path"),
  errorMessage: text("error_message"),
  userId: integer("user_id").references(() => users.id),
  taskId: integer("task_id").references(() => tasks.id),
});

export const insertVulnerabilityScanSchema = createInsertSchema(vulnerabilityScans).pick({
  serverId: true,
  userId: true,
});

export const vulnerabilities = pgTable("vulnerabilities", {
  id: serial("id").primaryKey(),
  scanId: integer("scan_id").notNull().references(() => vulnerabilityScans.id, { onDelete: 'cascade' }),
  cveId: text("cve_id").notNull(),
  packageName: text("package_name").notNull(),
  severity: scanSeverityEnum("severity").notNull(),
  fixAvailable: boolean("fix_available").default(false),
  summary: text("summary"),
  cvssScore: doublePrecision("cvss_score"),
  detectedVersion: text("detected_version"),
  fixedVersion: text("fixed_version"),
});

export const insertVulnerabilitySchema = createInsertSchema(vulnerabilities);

export type VulnerabilityScan = typeof vulnerabilityScans.$inferSelect;
export type InsertVulnerabilityScan = z.infer<typeof insertVulnerabilityScanSchema>;

export type Vulnerability = typeof vulnerabilities.$inferSelect;
export type InsertVulnerability = z.infer<typeof insertVulnerabilitySchema>;

// Malware Scans
export const malwareScans = pgTable("malware_scans", {
  id: serial("id").primaryKey(),
  serverId: integer("server_id").notNull().references(() => servers.id, { onDelete: 'cascade' }),
  scanDate: timestamp("scan_date").defaultNow(),
  status: taskStatusEnum("status").default('queued'),
  filesScanned: integer("files_scanned").default(0),
  threatCount: integer("threat_count").default(0),
  scanDirectory: text("scan_directory").default('/'),
  // Field doesn't exist in database
  // rawOutputPath: text("raw_output_path"),
  scanDuration: integer("scan_duration"), // seconds
  errorMessage: text("error_message"),
  userId: integer("user_id").references(() => users.id),
  taskId: integer("task_id").references(() => tasks.id),
});

export const insertMalwareScanSchema = createInsertSchema(malwareScans).pick({
  serverId: true,
  scanDirectory: true,
  userId: true,
});

export const malwareThreats = pgTable("malware_threats", {
  id: serial("id").primaryKey(),
  scanId: integer("scan_id").notNull().references(() => malwareScans.id, { onDelete: 'cascade' }),
  filePath: text("file_path").notNull(),
  threatName: text("threat_name").notNull(),
  category: malwareCategoryEnum("category").default('other'),
  // Fields below don't exist in the database
  // hash: text("hash"), // SHA256 hash of the file
  // fileSize: integer("file_size"), // in bytes
  // quarantined: boolean("quarantined").default(false),
  // deleted: boolean("deleted").default(false),
});

export const insertMalwareThreatSchema = createInsertSchema(malwareThreats);

export type MalwareScan = typeof malwareScans.$inferSelect;
export type InsertMalwareScan = z.infer<typeof insertMalwareScanSchema>;

export type MalwareThreat = typeof malwareThreats.$inferSelect;
export type InsertMalwareThreat = z.infer<typeof insertMalwareThreatSchema>;

// Role-based permissions schema
export const rolePermissions = {
  admin: [
    "manage_users", 
    "manage_servers", 
    "execute_commands", 
    "manage_playbooks", 
    "view_logs", 
    "schedule_tasks", 
    "view_servers", 
    "view_commands", 
    "view_playbooks",
    "scan_vulnerabilities",
    "scan_malware"
  ],
  operator: [
    "manage_servers", 
    "execute_commands", 
    "manage_playbooks", 
    "view_logs", 
    "schedule_tasks", 
    "view_servers", 
    "view_commands", 
    "view_playbooks",
    "scan_vulnerabilities",
    "scan_malware"
  ],
  viewer: [
    "view_servers", 
    "view_commands", 
    "view_playbooks", 
    "view_logs"
  ]
};

// Task type schemas
export const commandTaskConfigSchema = z.object({
  command: z.string(),
  serverId: z.number().optional(),
});

export const playbookTaskConfigSchema = z.object({
  playbookId: z.number(),
  variables: z.record(z.string()).optional(),
});

export const systemTaskConfigSchema = z.object({
  action: z.enum(["manage_service"]),
  serviceName: z.string(),
  operation: z.enum(["start", "stop", "restart", "enable", "disable", "status"]),
  serverId: z.number(),
});

export const vulnerabilityScanTaskConfigSchema = z.object({
  serverId: z.number(),
});

export const malwareScanTaskConfigSchema = z.object({
  serverId: z.number(),
  scanDirectory: z.string().default('/'),
});

export const taskConfigSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("command"), ...commandTaskConfigSchema.shape }),
  z.object({ type: z.literal("playbook"), ...playbookTaskConfigSchema.shape }),
  z.object({ type: z.literal("system"), ...systemTaskConfigSchema.shape }),
  z.object({ type: z.literal("vulnerability_scan"), ...vulnerabilityScanTaskConfigSchema.shape }),
  z.object({ type: z.literal("malware_scan"), ...malwareScanTaskConfigSchema.shape }),
]);
