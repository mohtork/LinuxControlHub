import { useQuery } from "@tanstack/react-query";
import { DashboardStats } from "@/components/dashboard-stats";
import { ServerCard } from "@/components/ui/server-card";
import { TaskListItem } from "@/components/ui/task-list-item";
import { PlaybookItem } from "@/components/ui/playbook-item";
import { Button } from "@/components/ui/button";
import { AddServerDialog } from "@/components/add-server-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";
import { getServers } from "@/lib/ssh";
import { getTasks, runTask, getPlaybooks, createTask } from "@/lib/ansible";
import { Server, Task, Playbook } from "@shared/schema";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useState } from "react";

import { useToast } from "@/hooks/use-toast";
import { Plus, ArrowRight } from "lucide-react";

export default function DashboardPage() {
  const [deleteServerTarget, setDeleteServerTarget] = useState<Server | null>(null);
  const { toast } = useToast();

  const {
    data: servers,
    isLoading: isServersLoading,
    refetch: refetchServers,
  } = useQuery<Server[]>({
    queryKey: ["/api/servers"],
  });

  const {
    data: tasks,
    isLoading: isTasksLoading,
    refetch: refetchTasks,
  } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
  });

  const {
    data: playbooks,
    isLoading: isPlaybooksLoading,
  } = useQuery<Playbook[]>({
    queryKey: ["/api/playbooks"],
  });

  const handleDeleteServer = async () => {
    if (!deleteServerTarget) return;
    
    try {
      // Call delete API endpoint
      await fetch(`/api/servers/${deleteServerTarget.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      
      // Refetch servers
      refetchServers();
      
      toast({
        title: "Server deleted",
        description: `${deleteServerTarget.name} has been removed.`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: `Failed to delete server: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setDeleteServerTarget(null);
    }
  };

  const handleRunTask = async (task: Task) => {
    try {
      await runTask(task.id);
      refetchTasks();
      
      toast({
        title: "Task started",
        description: `${task.name} has been queued for execution.`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: `Failed to run task: ${error.message}`,
        variant: "destructive",
      });
    }
  };

  const handleRunPlaybook = async (playbook: Playbook) => {
    try {
      // Create a new task for the playbook
      await createTask({
        name: `Run: ${playbook.name}`,
        type: "playbook",
        config: { playbookId: playbook.id },
        playbookId: playbook.id,
      });
      
      refetchTasks();
      
      toast({
        title: "Playbook queued",
        description: `${playbook.name} has been queued for execution.`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: `Failed to run playbook: ${error.message}`,
        variant: "destructive",
      });
    }
  };

  // No longer using featured server for terminal

  return (
    <div>
      {/* Dashboard Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Monitor and manage your Linux servers
        </p>
      </div>

      {/* Summary Stats */}
      <DashboardStats />

      {/* Servers & Tasks Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        {/* Servers List */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="px-4 py-5 border-b border-gray-200 flex justify-between items-center">
              <CardTitle className="text-lg font-medium text-gray-900">
                Servers
              </CardTitle>
              <div className="flex space-x-2">
                <AddServerDialog />
              </div>
            </CardHeader>
            
            <CardContent className="p-0 divide-y divide-gray-200">
              {isServersLoading ? (
                <div className="p-4">Loading servers...</div>
              ) : servers && servers.length > 0 ? (
                servers
                  .slice(0, 3)
                  .map((server) => (
                    <ServerCard 
                      key={server.id} 
                      server={server} 
                      onDelete={setDeleteServerTarget} 
                    />
                  ))
              ) : (
                <div className="p-4 text-center text-gray-500">
                  No servers found. Add your first server to get started.
                </div>
              )}
            </CardContent>
            
            {servers && servers.length > 0 && (
              <div className="px-4 py-3 bg-gray-50 text-right">
                <Link href="/servers">
                  <Button variant="link" className="text-sm text-primary-600 hover:text-primary-800 font-medium">
                    View all servers <ArrowRight className="ml-1 h-4 w-4" />
                  </Button>
                </Link>
              </div>
            )}
          </Card>
        </div>

        {/* Tasks Section */}
        <div className="space-y-6">
          {/* Tasks Overview */}
          <Card>
            <CardHeader className="px-4 py-5 border-b border-gray-200 flex justify-between items-center">
              <CardTitle className="text-lg font-medium text-gray-900">
                Recent Tasks
              </CardTitle>
              <Link href="/tasks">
                <Button variant="link" className="text-sm text-primary-600 hover:text-primary-800 font-medium">
                  View all
                </Button>
              </Link>
            </CardHeader>
            
            <CardContent className="p-0 divide-y divide-gray-200">
              {isTasksLoading ? (
                <div className="p-4">Loading tasks...</div>
              ) : tasks && tasks.length > 0 ? (
                tasks.slice(0, 3).map((task) => (
                  <TaskListItem 
                    key={task.id} 
                    task={task} 
                    onRun={handleRunTask} 
                  />
                ))
              ) : (
                <div className="p-4 text-center text-gray-500">
                  No tasks found. Create a new task to get started.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Playbooks Section */}
      <div className="mt-6">
        <Card>
          <CardHeader className="px-4 py-5 border-b border-gray-200 flex justify-between items-center">
            <CardTitle className="text-lg font-medium text-gray-900">
              Recent Playbooks
            </CardTitle>
            <div className="flex space-x-2">
              <Link href="/playbooks">
                <Button>
                  <Plus className="mr-1 h-4 w-4" /> New Playbook
                </Button>
              </Link>
              <Link href="/playbooks">
                <Button variant="link" className="text-sm text-primary-600 hover:text-primary-800 font-medium">
                  View all
                </Button>
              </Link>
            </div>
          </CardHeader>
          
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Description
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Last Updated
                  </th>
                  <th scope="col" className="relative px-6 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {isPlaybooksLoading ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-4 text-center text-gray-500">
                      Loading playbooks...
                    </td>
                  </tr>
                ) : playbooks && playbooks.length > 0 ? (
                  playbooks.slice(0, 3).map((playbook) => (
                    <PlaybookItem
                      key={playbook.id}
                      playbook={playbook}
                      onRun={handleRunPlaybook}
                      onEdit={() => {}}
                      onDelete={() => {}}
                    />
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="px-6 py-4 text-center text-gray-500">
                      No playbooks found. Create your first playbook to get started.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Delete Server Confirmation Dialog */}
      <AlertDialog open={!!deleteServerTarget} onOpenChange={(open) => !open && setDeleteServerTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Server</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {deleteServerTarget?.name}? This action cannot be undone and all associated data will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteServer} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
