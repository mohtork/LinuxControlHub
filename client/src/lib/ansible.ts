import { apiRequest, queryClient } from "./queryClient";
import { Playbook, Task } from "@shared/schema";

// Playbook API functions
export async function getPlaybooks(): Promise<Playbook[]> {
  const res = await apiRequest("GET", "/api/playbooks");
  return await res.json();
}

export async function getPlaybook(id: number): Promise<Playbook> {
  const res = await apiRequest("GET", `/api/playbooks/${id}`);
  return await res.json();
}

export async function createPlaybook(playbook: {
  name: string;
  description?: string;
  content: string;
}): Promise<Playbook> {
  const res = await apiRequest("POST", "/api/playbooks", playbook);
  await queryClient.invalidateQueries({ queryKey: ["/api/playbooks"] });
  return await res.json();
}

export async function updatePlaybook(
  id: number,
  playbook: {
    name?: string;
    description?: string;
    content?: string;
  }
): Promise<Playbook> {
  const res = await apiRequest("PUT", `/api/playbooks/${id}`, playbook);
  await queryClient.invalidateQueries({ queryKey: ["/api/playbooks"] });
  await queryClient.invalidateQueries({ queryKey: [`/api/playbooks/${id}`] });
  return await res.json();
}

export async function deletePlaybook(id: number): Promise<void> {
  await apiRequest("DELETE", `/api/playbooks/${id}`);
  await queryClient.invalidateQueries({ queryKey: ["/api/playbooks"] });
}

// Task API functions
export async function getTasks(): Promise<Task[]> {
  const res = await apiRequest("GET", "/api/tasks");
  return await res.json();
}

export async function getTask(id: number): Promise<Task> {
  const res = await apiRequest("GET", `/api/tasks/${id}`);
  return await res.json();
}

export async function createTask(task: {
  name: string;
  type: string;
  config: any;
  serverId?: number;
  serverIds?: number[];
  playbookId?: number;
}): Promise<Task> {
  const res = await apiRequest("POST", "/api/tasks", task);
  await queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
  return await res.json();
}

export async function runTask(id: number): Promise<{ message: string }> {
  const res = await apiRequest("POST", `/api/tasks/${id}/run`);
  await queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
  await queryClient.invalidateQueries({ queryKey: [`/api/tasks/${id}`] });
  return await res.json();
}

export async function scheduleTask(
  id: number,
  schedule: string | null
): Promise<{ message: string }> {
  const res = await apiRequest("PUT", `/api/tasks/${id}/schedule`, { schedule });
  await queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
  await queryClient.invalidateQueries({ queryKey: [`/api/tasks/${id}`] });
  return await res.json();
}

export async function deleteTask(id: number): Promise<void> {
  await apiRequest("DELETE", `/api/tasks/${id}`);
  await queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
}
