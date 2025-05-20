import { Task } from "@shared/schema";
import { apiRequest, queryClient } from "./queryClient";

// Fetch a task by ID
export async function getTask(taskId: number): Promise<Task> {
  const response = await fetch(`/api/tasks/${taskId}`, {
    credentials: 'include'
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch task: ${response.statusText}`);
  }
  
  return await response.json();
}

// Fetch all tasks
export async function getTasks(): Promise<Task[]> {
  const response = await fetch('/api/tasks', {
    credentials: 'include'
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch tasks: ${response.statusText}`);
  }
  
  return await response.json();
}

// Fetch tasks by server ID
export async function getTasksByServer(serverId: number): Promise<Task[]> {
  const response = await fetch(`/api/tasks?serverId=${serverId}`, {
    credentials: 'include'
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch server tasks: ${response.statusText}`);
  }
  
  return await response.json();
}

// Fetch active tasks
export async function getActiveTasks(): Promise<Task[]> {
  const response = await fetch('/api/tasks/active', {
    credentials: 'include'
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch active tasks: ${response.statusText}`);
  }
  
  return await response.json();
}

// Run a task
export async function runTask(taskId: number): Promise<void> {
  await apiRequest('POST', `/api/tasks/${taskId}/run`);
}

// Pause a running task
export async function pauseTask(taskId: number): Promise<void> {
  await apiRequest('POST', `/api/tasks/${taskId}/pause`);
}

// Resume a paused task
export async function resumeTask(taskId: number): Promise<void> {
  await apiRequest('POST', `/api/tasks/${taskId}/resume`);
}

// Stop a running task
export async function stopTask(taskId: number): Promise<void> {
  await apiRequest('POST', `/api/tasks/${taskId}/stop`);
}

// Delete a task
export async function deleteTask(taskId: number): Promise<void> {
  await apiRequest('DELETE', `/api/tasks/${taskId}`);
}

// Create a new task
export async function createTask(task: {
  name: string;
  type: string;
  config: any;
  serverId?: number;
  serverIds?: number[];
  playbookId?: number;
}): Promise<Task> {
  const res = await apiRequest('POST', '/api/tasks', task);
  await queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
  return await res.json();
}