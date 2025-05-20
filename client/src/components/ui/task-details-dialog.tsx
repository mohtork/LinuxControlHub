import { useState, useEffect, useMemo } from "react";
import { Task, Server, ServerMetrics, VulnerabilityScan, User as UserType } from "@shared/schema";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDistanceToNow, format } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getTask, pauseTask, resumeTask, stopTask, deleteTask, runTask } from "@/lib/task-service";
import { Loader2, AlertCircle, CheckCircle, Clock, Server as ServerIcon, PauseCircle, PlayCircle, StopCircle, Trash2, Cpu, HardDrive, Network, Activity, Database, CheckCircleIcon, XCircleIcon, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";

interface TaskDetailsDialogProps {
  taskId: number | null;
  isOpen: boolean;
  onClose: () => void;
  onTaskDeleted?: () => void; // Add callback for when a task is deleted
}

export function TaskDetailsDialog({ taskId, isOpen, onClose, onTaskDeleted }: TaskDetailsDialogProps) {
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshInterval, setRefreshInterval] = useState<NodeJS.Timeout | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const { toast } = useToast();

  // Format date
  const formatDate = (date: Date | string | null) => {
    if (!date) return "N/A";
    return format(new Date(date), "PPpp"); // e.g., "Apr 29, 2022, 9:30 AM"
  };

  // Load task details
  const loadTaskDetails = async () => {
    if (!taskId) return;
    
    try {
      setLoading(true);
      setError(null);
      const taskData = await getTask(taskId);
      setTask(taskData);
    } catch (err: any) {
      setError(err.message || "Failed to load task details");
    } finally {
      setLoading(false);
    }
  };

  // Handle dialog open/close
  useEffect(() => {
    if (isOpen && taskId) {
      loadTaskDetails();
      
      // Set up auto-refresh for tasks that may change state
      if (task?.status === "running" || task?.status === "queued" || task?.status === "paused") {
        const interval = setInterval(loadTaskDetails, 1500); // More frequent updates
        setRefreshInterval(interval);
      }
    }
    
    return () => {
      if (refreshInterval) {
        clearInterval(refreshInterval);
        setRefreshInterval(null);
      }
    };
  }, [isOpen, taskId, task?.status]);

  // Get status badge
  const getStatusBadge = () => {
    if (!task) return null;
    
    switch (task.status) {
      case "success":
        return <Badge className="bg-green-100 text-green-800 flex items-center gap-1">
          <CheckCircle className="h-3 w-3" /> Success
        </Badge>;
      case "failed":
        return <Badge className="bg-red-100 text-red-800 flex items-center gap-1">
          <AlertCircle className="h-3 w-3" /> Failed
        </Badge>;
      case "running":
        return <Badge className="bg-yellow-100 text-yellow-800 flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" /> Running
        </Badge>;
      case "paused":
        return <Badge className="bg-orange-100 text-orange-800 flex items-center gap-1">
          <PauseCircle className="h-3 w-3" /> Paused
        </Badge>;
      case "stopped":
        return <Badge className="bg-slate-100 text-slate-800 flex items-center gap-1">
          <StopCircle className="h-3 w-3" /> Stopped
        </Badge>;
      case "queued":
        return <Badge className="bg-blue-100 text-blue-800 flex items-center gap-1">
          <Clock className="h-3 w-3" /> Queued
        </Badge>;
      default:
        return <Badge className="bg-gray-100 text-gray-800">{task.status}</Badge>;
    }
  };

  // Get task execution time
  const getExecutionTime = () => {
    if (!task) return "N/A";
    
    if (task.startedAt && task.completedAt) {
      const start = new Date(task.startedAt).getTime();
      const end = new Date(task.completedAt).getTime();
      const seconds = Math.floor((end - start) / 1000);
      
      if (seconds < 60) {
        return `${seconds} seconds`;
      } else {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes} min ${remainingSeconds} sec`;
      }
    }
    
    return "N/A";
  };

  // Fetch server information for the task - ensure it's refetched when the task changes
  const { data: targetServer, refetch: refetchServer } = useQuery<Server>({
    queryKey: ['/api/servers', task?.serverId],
    enabled: !!task?.serverId && task?.serverId > 0,
    refetchOnWindowFocus: true,
    staleTime: 10000, // 10 seconds
  });

  // For vulnerability scan tasks, use task.serverId directly 
  // This is different from other task types where server info might be in config
  const serverId = task?.type === 'vulnerability_scan' 
    ? task.serverId // Vulnerability scan tasks store the server ID directly in the task record
    : undefined;
  
  // Also fetch the vulnerability scan record if available
  const { data: vulnerabilityScan } = useQuery<VulnerabilityScan>({
    queryKey: ['/api/tasks', task?.id, 'vulnerability-scan'],
    enabled: !!task?.id && task?.type === 'vulnerability_scan',
    refetchOnWindowFocus: true,
    staleTime: 10000, // 10 seconds
  });

  // Refetch server info when task changes
  useEffect(() => {
    if (task?.serverId) {
      refetchServer();
    }
  }, [task?.serverId, refetchServer]);

  // Fetch any metrics for the target server
  const { data: serverMetrics, refetch: refetchMetrics } = useQuery<ServerMetrics[]>({
    queryKey: ['/api/servers', task?.serverId, 'metrics'],
    enabled: !!task?.serverId && (task?.type === 'playbook' || task?.type === 'command'),
    refetchOnWindowFocus: true,
    staleTime: 10000, // 10 seconds
  });
  
  // Refetch metrics when server info changes
  useEffect(() => {
    if (targetServer) {
      refetchMetrics();
    }
  }, [targetServer, refetchMetrics]);
  
  // Query for all servers - used for all task types so we can always look up server info
  const { data: targetServers } = useQuery<Server[]>({
    queryKey: ['/api/servers'],
    enabled: !!task, // Always fetch servers when we have a task
    staleTime: 30000, // 30 seconds
  });
  
  // Get all users to ensure we can display execution info correctly
  const { data: allUsers } = useQuery<UserType[]>({
    queryKey: ['/api/users'],
    staleTime: 30000, // 30 seconds
  });

  // Find the user who executed the task
  const executedByUser = useMemo(() => {
    if (!task?.executedById || !allUsers) return null;
    return allUsers.find(user => user.id === task.executedById);
  }, [task?.executedById, allUsers]);
  
  // Handle targets (servers)
  const getTargets = () => {
    if (!task) return "No targets";
    
    // Special handling for vulnerability scan tasks
    if (task.type === 'vulnerability_scan') {
      // For vulnerability scan tasks, server ID is stored directly in the task record
      if (task.serverId && targetServers) {
        const server = targetServers.find(s => s.id === task.serverId);
        if (server) {
          return `${server.name} (${server.ipAddress})`;
        }
        // If server not found in list but we have the ID, show the ID
        return `Server #${task.serverId}`;
      }
      
      // Fallback to check scan record if task.serverId is not set for some reason
      if (vulnerabilityScan && vulnerabilityScan.serverId && targetServers) {
        const server = targetServers.find(s => s.id === vulnerabilityScan.serverId);
        if (server) {
          return `${server.name} (${server.ipAddress})`;
        }
        return `Server #${vulnerabilityScan.serverId}`;
      }
      
      // Last fallback - check config object
      if (task.config && typeof task.config === 'object') {
        const serverId = Number('serverId' in task.config ? task.config.serverId : 
                               'targetServerId' in task.config ? task.config.targetServerId : 0);
        
        if (serverId && targetServers) {
          const server = targetServers.find(s => s.id === serverId);
          if (server) {
            return `${server.name} (${server.ipAddress})`;
          }
          if (!isNaN(serverId)) {
            return `Server #${serverId}`;
          }
        }
      }
    }
    
    // Regular handling for other task types
    // First check if there's a serverId directly on the task
    if (task.serverId && targetServers) {
      const server = targetServers.find(s => s.id === task.serverId);
      if (server) {
        return `${server.name} (${server.ipAddress})`;
      } else if (targetServer) {
        return `${targetServer.name} (${targetServer.ipAddress})`;
      } else {
        return `Server #${task.serverId}`;
      }
    } else if (task.serverId) {
      return `Server #${task.serverId}`;
    }
    
    // For command tasks, see if serverId is in config
    if (task.type === 'command' && task.config && typeof task.config === 'object') {
      if ('serverId' in task.config && targetServers) {
        const serverId = Number(task.config.serverId);
        const server = targetServers.find(s => s.id === serverId);
        if (server) {
          return `${server.name} (${server.ipAddress})`;
        }
        return `Server #${serverId}`;
      }
    }
    
    // Multiple servers case
    if (task.serverIds && task.serverIds.length > 0 && targetServers) {
      // Filter servers that match our serverIds array
      const servers = targetServers.filter(server => 
        task.serverIds && task.serverIds.includes(server.id)
      );
      
      if (servers.length === 0) {
        return `${task.serverIds.length} servers`;
      }
      
      if (servers.length === 1) {
        return `${servers[0].name} (${servers[0].ipAddress})`;
      } else if (servers.length <= 3) {
        return servers.map(s => `${s.name} (${s.ipAddress})`).join(", ");
      } else {
        return `${servers.length} servers: ${servers.slice(0, 2).map(s => `${s.name} (${s.ipAddress})`).join(", ")} and ${servers.length - 2} more`;
      }
    } else if (task.serverIds && task.serverIds.length > 0) {
      return `${task.serverIds.length} servers (IDs: ${task.serverIds.join(", ")})`;
    }
    
    return "No targets";
  };
  
  // Get list of target servers for display
  const getTargetServersList = () => {
    if (!task) return [];
    
    // Special handling for vulnerability scan tasks
    if (task.type === 'vulnerability_scan') {
      // For vulnerability scan tasks, server ID is stored directly in the task record
      if (task.serverId && targetServers) {
        const server = targetServers.find(s => s.id === task.serverId);
        if (server) {
          return [server];
        }
      }
      
      // Fallback to check scan record if task.serverId is not set for some reason
      if (vulnerabilityScan && vulnerabilityScan.serverId && targetServers) {
        const server = targetServers.find(s => s.id === vulnerabilityScan.serverId);
        if (server) {
          return [server];
        }
      }
      
      // Last fallback - check config object
      if (task.config && typeof task.config === 'object' && targetServers) {
        const serverId = Number('serverId' in task.config ? task.config.serverId : 
                               'targetServerId' in task.config ? task.config.targetServerId : 0);
        
        if (serverId && !isNaN(serverId)) {
          const server = targetServers.find(s => s.id === serverId);
          if (server) {
            return [server];
          }
        }
      }
    }
    
    // Regular handling for other task types
    // First check if there's a serverId directly on the task
    if (task.serverId && targetServers) {
      const server = targetServers.find(s => s.id === task.serverId);
      if (server) {
        return [server];
      } else if (targetServer) {
        return [targetServer];
      }
      return [];
    }
    
    // For command tasks, see if serverId is in config
    if (task.type === 'command' && task.config && typeof task.config === 'object') {
      if ('serverId' in task.config && targetServers) {
        const serverId = Number(task.config.serverId);
        const server = targetServers.find(s => s.id === serverId);
        if (server) {
          return [server];
        }
      }
    }
    
    // Multiple servers case
    if (task.serverIds && task.serverIds.length > 0 && targetServers) {
      return targetServers.filter(server => 
        task.serverIds && task.serverIds.includes(server.id)
      );
    }
    
    return [];
  };

  // Format task output for display
  const formatOutput = (output: string | null) => {
    if (!output) return "No output available";
    
    // Format Ansible outputs for better readability
    if (task?.type === "playbook") {
      // Add some styling to ansible output
      // Highlight error messages
      return output
        .replace(/fatal:.*?$/gm, '<span class="text-red-600 font-bold">$&</span>')
        .replace(/failed:.*?$/gm, '<span class="text-red-600 font-bold">$&</span>')
        .replace(/error:.*?$/gm, '<span class="text-red-600">$&</span>')
        .replace(/ok:.*?$/gm, '<span class="text-green-600">$&</span>')
        .replace(/changed:.*?$/gm, '<span class="text-blue-600">$&</span>')
        .replace(/PLAY \[.*?\]/g, '<span class="text-blue-600 font-bold">$&</span>')
        .replace(/TASK \[.*?\]/g, '<span class="text-purple-600 font-bold">$&</span>')
        .replace(/PLAY RECAP.*/g, '<span class="text-yellow-600 font-bold">$&</span>')
        .replace(/skipping:.*?$/gm, '<span class="text-gray-500">$&</span>')
        .replace(/included:.*?$/gm, '<span class="text-indigo-600">$&</span>');
    }
    
    // Handle command output
    if (task?.type === "command") {
      return output
        .replace(/error/gi, '<span class="text-red-600 font-semibold">$&</span>')
        .replace(/warning/gi, '<span class="text-yellow-600 font-semibold">$&</span>')
        .replace(/success/gi, '<span class="text-green-600 font-semibold">$&</span>')
        .replace(/(^|\n)#.*?$/gm, '<span class="text-gray-500">$&</span>') // Comment lines
        .replace(/(\$|\>) .*?$/gm, '<span class="text-blue-600 font-semibold">$&</span>'); // Command lines
    }
    
    // Preserve line breaks and spaces for other types
    return output;
  };
  
  // Task control methods
  const handleRunTask = async () => {
    if (!task?.id) return;
    
    try {
      setActionLoading('run');
      await runTask(task.id);
      toast({
        title: "Task started",
        description: "The task has been forced to run and will begin execution."
      });
      await loadTaskDetails(); // Refresh task data
    } catch (error: any) {
      toast({
        title: "Failed to run task",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handlePauseTask = async () => {
    if (!task?.id) return;
    
    try {
      setActionLoading('pause');
      await pauseTask(task.id);
      toast({
        title: "Task paused",
        description: "The task has been paused successfully."
      });
      await loadTaskDetails(); // Refresh task data
    } catch (error: any) {
      toast({
        title: "Failed to pause task",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setActionLoading(null);
    }
  };
  
  const handleResumeTask = async () => {
    if (!task?.id) return;
    
    try {
      setActionLoading('resume');
      await resumeTask(task.id);
      toast({
        title: "Task resumed",
        description: "The task has been resumed successfully."
      });
      await loadTaskDetails(); // Refresh task data
    } catch (error: any) {
      toast({
        title: "Failed to resume task",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setActionLoading(null);
    }
  };
  
  const handleStopTask = async () => {
    if (!task?.id) return;
    
    try {
      setActionLoading('stop');
      await stopTask(task.id);
      toast({
        title: "Task stopped",
        description: "The task has been stopped successfully."
      });
      await loadTaskDetails(); // Refresh task data
    } catch (error: any) {
      toast({
        title: "Failed to stop task",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setActionLoading(null);
    }
  };
  
  const handleDeleteTask = async () => {
    if (!task?.id) return;
    
    try {
      setActionLoading('delete');
      await deleteTask(task.id);
      toast({
        title: "Task deleted",
        description: "The task has been deleted successfully."
      });
      
      // Notify parent component that task was deleted
      if (onTaskDeleted) {
        onTaskDeleted();
      }
      
      onClose(); // Close dialog after deletion
    } catch (error: any) {
      toast({
        title: "Failed to delete task",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span className="truncate">Task Details: {task?.name}</span>
            {getStatusBadge()}
          </DialogTitle>
          <DialogDescription>
            View detailed information and output for this task
          </DialogDescription>
        </DialogHeader>
        
        {loading && !task ? (
          <div className="flex justify-center items-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2">Loading task details...</span>
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
            <p className="text-red-600">{error}</p>
            <Button 
              variant="outline" 
              className="mt-4" 
              onClick={loadTaskDetails}
            >
              Retry
            </Button>
          </div>
        ) : task ? (
          <div className="flex-1 overflow-hidden">
            <Tabs defaultValue="details" className="h-full flex flex-col">
              <TabsList>
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="output">
                  Output {task.status === "failed" && <AlertCircle className="ml-1 h-3 w-3 text-red-500" />}
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="details" className="flex-1 overflow-auto">
                <div className="space-y-4 py-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card>
                      <CardHeader className="py-4">
                        <CardTitle className="text-sm font-medium">Basic Information</CardTitle>
                      </CardHeader>
                      <CardContent className="py-2">
                        <dl className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <dt className="font-medium text-gray-500">ID:</dt>
                            <dd>{task.id}</dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="font-medium text-gray-500">Type:</dt>
                            <dd className="capitalize">{task.type}</dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="font-medium text-gray-500">Executed By:</dt>
                            <dd className="flex items-center">
                              <User className="h-3 w-3 mr-1" /> 
                              <span className="font-medium">
                                {task.executedById 
                                  ? (executedByUser 
                                      ? executedByUser.username 
                                      : `User ID: ${task.executedById}`)
                                  : "System"}
                              </span>
                            </dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="font-medium text-gray-500">Targets:</dt>
                            <dd className="flex items-center">
                              <ServerIcon className="h-3 w-3 mr-1" /> 
                              <span className="font-medium">{getTargets()}</span>
                            </dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="font-medium text-gray-500">Exit Code:</dt>
                            <dd>
                              {task.exitCode !== null && task.exitCode !== undefined 
                                ? <span className={task.exitCode === 0 ? "text-green-600" : "text-red-600"}>
                                    {task.exitCode}
                                  </span>
                                : "N/A"}
                            </dd>
                          </div>
                          {task.playbookId && (
                            <div className="flex justify-between">
                              <dt className="font-medium text-gray-500">Playbook ID:</dt>
                              <dd>{task.playbookId}</dd>
                            </div>
                          )}
                        </dl>
                      </CardContent>
                    </Card>
                    
                    <Card>
                      <CardHeader className="py-4">
                        <CardTitle className="text-sm font-medium">Timing Information</CardTitle>
                      </CardHeader>
                      <CardContent className="py-2">
                        <dl className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <dt className="font-medium text-gray-500">Created:</dt>
                            <dd>{formatDate(task.createdAt)}</dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="font-medium text-gray-500">Started:</dt>
                            <dd>{formatDate(task.startedAt)}</dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="font-medium text-gray-500">Completed:</dt>
                            <dd>{formatDate(task.completedAt)}</dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="font-medium text-gray-500">Execution Time:</dt>
                            <dd>{getExecutionTime()}</dd>
                          </div>
                        </dl>
                      </CardContent>
                    </Card>
                    
                    <Card className="md:col-span-2">
                      <CardHeader className="py-4">
                        <CardTitle className="text-sm font-medium">Configuration</CardTitle>
                      </CardHeader>
                      <CardContent className="py-2">
                        <ScrollArea className="h-24 rounded-md border p-4">
                          <pre className="text-xs">{JSON.stringify(task.config, null, 2)}</pre>
                        </ScrollArea>
                      </CardContent>
                    </Card>
                    
                    {/* Server details card removed as requested */}
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="output" className="flex-1 overflow-auto">
                <Card className="border-0 shadow-none h-full flex flex-col">
                  <CardHeader className="py-4 flex-none">
                    <CardTitle className="text-sm font-medium flex justify-between">
                      <span>Task Output</span>
                      {task.status === "running" && (
                        <Badge variant="outline" className="animate-pulse">
                          <Loader2 className="h-3 w-3 animate-spin mr-1" /> 
                          Live Output
                        </Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex-1 overflow-hidden py-0">
                    <ScrollArea className="h-[40vh] rounded-md border">
                      <div className="p-4 font-mono text-sm whitespace-pre-wrap">
                        {task.status === "queued" ? (
                          <div className="flex items-center justify-center h-full text-gray-500">
                            <Clock className="h-4 w-4 mr-2" />
                            Task is queued and waiting to be executed...
                          </div>
                        ) : task.output ? (
                          <div dangerouslySetInnerHTML={{ __html: formatOutput(task.output) }} />
                        ) : (
                          <div className="flex items-center justify-center h-full text-gray-500">
                            No output available
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
            
            {/* Task control buttons */}
            <DialogFooter className="border-t pt-4 mt-4">
              <div className="flex flex-wrap gap-2 justify-end w-full">
                {task.status === "queued" && (
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={handleRunTask}
                    disabled={actionLoading !== null}
                  >
                    {actionLoading === 'run' ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <PlayCircle className="h-4 w-4 mr-2" />
                    )}
                    Force Run
                  </Button>
                )}
                
                {task.status === "running" && (
                  <>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={handlePauseTask} 
                      disabled={actionLoading !== null}
                    >
                      {actionLoading === 'pause' ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <PauseCircle className="h-4 w-4 mr-2" />
                      )}
                      Pause
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={handleStopTask}
                      disabled={actionLoading !== null}
                    >
                      {actionLoading === 'stop' ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <StopCircle className="h-4 w-4 mr-2" />
                      )}
                      Stop
                    </Button>
                  </>
                )}
                
                {task.status === "paused" && (
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={handleResumeTask}
                    disabled={actionLoading !== null}
                  >
                    {actionLoading === 'resume' ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <PlayCircle className="h-4 w-4 mr-2" />
                    )}
                    Resume
                  </Button>
                )}
                
                <Button 
                  variant="destructive" 
                  size="sm"
                  onClick={handleDeleteTask}
                  disabled={actionLoading !== null || task.status === "running"}
                >
                  {actionLoading === 'delete' ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4 mr-2" />
                  )}
                  Delete
                </Button>
              </div>
            </DialogFooter>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}