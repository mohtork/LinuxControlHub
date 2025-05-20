import { apiRequest, queryClient } from "./queryClient";
import { Server, Command, ServerMetrics } from "@shared/schema";

// Server API functions
export async function getServers(): Promise<Server[]> {
  const res = await apiRequest("GET", "/api/servers");
  return await res.json();
}

export async function getServer(id: number): Promise<Server> {
  const res = await apiRequest("GET", `/api/servers/${id}`);
  return await res.json();
}

export async function createServer(server: {
  name: string;
  hostname: string;
  ipAddress: string;
  port?: number;
  username: string;
  authType: string;
  authData: string;
  tags?: string[];
  os?: string;
}): Promise<Server> {
  const res = await apiRequest("POST", "/api/servers", server);
  await queryClient.invalidateQueries({ queryKey: ["/api/servers"] });
  return await res.json();
}

export async function updateServer(
  id: number,
  server: {
    name?: string;
    hostname?: string;
    ipAddress?: string;
    port?: number;
    username?: string;
    authType?: string;
    authData?: string;
    tags?: string[];
    os?: string;
  }
): Promise<Server> {
  const res = await apiRequest("PUT", `/api/servers/${id}`, server);
  await queryClient.invalidateQueries({ queryKey: ["/api/servers"] });
  await queryClient.invalidateQueries({ queryKey: [`/api/servers/${id}`] });
  return await res.json();
}

export async function deleteServer(id: number): Promise<void> {
  await apiRequest("DELETE", `/api/servers/${id}`);
  await queryClient.invalidateQueries({ queryKey: ["/api/servers"] });
}

export async function testConnection(server: {
  hostname: string;
  port?: number;
  username: string;
  authType: string;
  password?: string;
  privateKey?: string;
}): Promise<{ success: boolean; message: string }> {
  const res = await apiRequest("POST", "/api/servers/test-connection", server);
  return await res.json();
}

// Server Metrics API functions
export async function getServerMetrics(serverId: number): Promise<ServerMetrics[]> {
  const res = await apiRequest("GET", `/api/servers/${serverId}/metrics`);
  return await res.json();
}

export async function fetchServerMetrics(serverId: number): Promise<ServerMetrics> {
  const res = await apiRequest("POST", `/api/servers/${serverId}/fetch-metrics`);
  await queryClient.invalidateQueries({ queryKey: [`/api/servers/${serverId}/metrics`] });
  return await res.json();
}

// Command Execution API functions
export async function executeCommand(
  serverId: number,
  command: string
): Promise<Command> {
  const res = await apiRequest("POST", `/api/servers/${serverId}/execute`, { command });
  await queryClient.invalidateQueries({ queryKey: [`/api/servers/${serverId}/commands`] });
  return await res.json();
}

export async function getCommandHistory(serverId: number): Promise<Command[]> {
  const res = await apiRequest("GET", `/api/servers/${serverId}/commands`);
  return await res.json();
}
