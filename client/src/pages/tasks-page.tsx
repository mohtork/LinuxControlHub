import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { TaskListItem } from "@/components/ui/task-list-item";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Task, Server, Playbook } from "@shared/schema";
import { getServers } from "@/lib/ssh";
import { getPlaybooks } from "@/lib/ansible";
import { getTasks, runTask, deleteTask, createTask } from "@/lib/task-service";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Clock, Clock1, Search, AlertCircle, PlayCircle, Trash2, FileCode, Terminal, Settings } from "lucide-react";

// Simplified schema with minimal validation
const taskFormSchema = z.object({
  name: z.string(),
  type: z.enum(["command", "playbook", "system"]),
  serverId: z.any(),
  playbookId: z.any().optional(),
  commandConfig: z.object({
    command: z.string().optional(),
  }).optional(),
  systemConfig: z.object({
    action: z.string().optional(),
    serviceName: z.string().optional(),
    operation: z.string().optional(),
    serverId: z.any().optional(),
  }).optional(),
});

type TaskFormValues = z.infer<typeof taskFormSchema>;

export default function TasksPage() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [selectedTaskType, setSelectedTaskType] = useState("command");

  // Fetch necessary data first
  const { data: tasks, isLoading, refetch: refetchTasks } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
  });

  const { data: servers } = useQuery<Server[]>({
    queryKey: ["/api/servers"],
  });

  const { data: playbooks } = useQuery<Playbook[]>({
    queryKey: ["/api/playbooks"],
  });

  // Then initialize form with React Hook Form
  const form = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    mode: "onChange", // Enable continuous validation
    defaultValues: {
      name: "",
      type: "command",
      serverId: servers && servers.length > 0 ? servers[0].id : undefined,
      commandConfig: {
        command: "",
      },
      systemConfig: {
        action: "manage_service",
        serviceName: "",
        operation: "start",
        serverId: 0
      }
    },
  });

  // Watch task type for conditional form fields
  const watchTaskType = form.watch("type");

  // Log errors to help debugging
  const showFormErrors = () => {
    const errors = form.formState.errors;
    if (Object.keys(errors).length > 0) {
      console.log("Form validation errors:", errors);
    }
  };
  
  // Show form errors in console for debugging
  useEffect(() => {
    showFormErrors();
  }, [form.formState.errors]);

  // Set server ID when servers are loaded
  useEffect(() => {
    if (servers && servers.length > 0) {
      form.setValue("serverId", servers[0].id);
    }
  }, [servers, form]);
  
  // Set up auto-refresh for tasks page when there are running or queued tasks
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  useEffect(() => {
    // Always set up an interval to refresh the tasks list for status updates
    // This ensures we catch status changes quickly regardless of what tasks are visible
    if (!refreshIntervalRef.current) {
      refreshIntervalRef.current = setInterval(() => {
        // Check if there are running or queued tasks to adjust refresh rate
        const hasActiveJobs = tasks?.some(task => 
          task.status === "running" || task.status === "queued" || task.status === "paused"
        );
        
        // More frequent polling for active jobs
        if (hasActiveJobs) {
          refetchTasks();
        } else {
          // Less frequent refreshes if no active jobs (but still refresh)
          // Using a counter to slow down refreshes when no active tasks
          if (!refreshIntervalRef.current) {
            refetchTasks();
          }
        }
      }, 2000); // Faster refresh rate (every 2 seconds)
    }
    
    // Clean up on unmount
    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
    };
  }, [tasks, refetchTasks]);

  const onDialogOpenChange = (open: boolean) => {
    if (!open) {
      setIsDialogOpen(false);
      form.reset({
        name: "",
        type: "command",
        commandConfig: {
          command: "",
        },
        systemConfig: {
          action: "manage_service",
          serviceName: "",
          operation: "start",
          serverId: 0
        }
      });
    } else {
      setIsDialogOpen(true);
    }
  };

  const onSubmit = async (data: TaskFormValues) => {
    try {
      console.log("Form data:", data);
      
      // Prepare the task payload based on task type
      let taskPayload: any = {
        name: data.name,
        type: data.type,
        description: `${data.type} task created from web UI`,
        serverId: data.serverId || undefined
      };
      
      // Add type-specific configuration
      if (data.type === 'command') {
        taskPayload.config = {
          type: 'command',  // Explicitly add type to config
          command: data.commandConfig?.command,
          serverId: data.serverId
        };
      } else if (data.type === 'playbook') {
        taskPayload.config = {
          type: 'playbook',  // Explicitly add type to config
          playbookId: data.playbookId
        };
        taskPayload.playbookId = data.playbookId;
      } else if (data.type === 'system' && data.systemConfig) {
        taskPayload.config = {
          type: 'system',  // Explicitly add type to config
          action: 'manage_service',
          serviceName: data.systemConfig.serviceName,
          operation: data.systemConfig.operation,
          serverId: data.serverId
        };
      }
      
      console.log("Sending task payload:", taskPayload);
      
      // Direct fetch approach to debug the issue
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(taskPayload)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Error: ${response.status} - ${errorText}`);
      }
      
      const result = await response.json();
      console.log("Task created successfully:", result);
      
      toast({
        title: "Task created",
        description: `${data.name} has been created successfully.`,
      });
      
      refetchTasks();
      setIsDialogOpen(false);
      form.reset();
    } catch (error: any) {
      console.error("Task creation error:", error);
      toast({
        title: "Error",
        description: `Failed to create task: ${error.message}`,
        variant: "destructive",
      });
    }
  };

  const handleDeleteTask = async () => {
    try {
      if (deleteTarget) {
        await deleteTask(deleteTarget.id);
        toast({
          title: "Task deleted",
          description: `${deleteTarget.name} has been deleted.`,
        });
        refetchTasks();
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: `Failed to delete task: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleRunTask = async (task: Task) => {
    try {
      await runTask(task.id);
      
      // Immediate refetch to update status
      refetchTasks();
      
      // Set up a sequence of quick refreshes to catch status changes
      // This helps catch fast-completing tasks that might finish before our normal interval
      const quickRefreshes = [500, 1000, 2000, 3500]; // Milliseconds
      
      for (const delay of quickRefreshes) {
        setTimeout(() => {
          refetchTasks();
        }, delay);
      }
      
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

  // Filter tasks by search term and status
  const filteredTasks = tasks
    ? tasks.filter(
        (task) => {
          const matchesSearch = searchTerm === "" ||
            task.name.toLowerCase().includes(searchTerm.toLowerCase());
          
          const matchesStatus = 
            selectedStatus === null || 
            selectedStatus === "all" || 
            task.status === selectedStatus;
          
          return matchesSearch && matchesStatus;
        }
      )
    : [];

  return (
    <div className="container mx-auto px-4 py-6">
      {/* Page Header */}
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tasks & Automation</h1>
          <p className="mt-1 text-sm text-gray-500">
            Automate server management tasks
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={onDialogOpenChange}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> New Task
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Create New Task</DialogTitle>
              <DialogDescription>
                Define a task to execute on your servers.
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Task Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Update Packages" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Task Type</FormLabel>
                      <Select
                        onValueChange={(value) => {
                          field.onChange(value);
                          setSelectedTaskType(value);
                        }}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select task type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="command">Command</SelectItem>
                          <SelectItem value="playbook">Ansible Playbook</SelectItem>
                          <SelectItem value="system">System Action</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        {watchTaskType === "command" 
                          ? "Execute a shell command on the server" 
                          : watchTaskType === "playbook" 
                            ? "Run an Ansible playbook" 
                            : "Perform a system operation"}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="serverId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Target Server</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value?.toString()}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select server" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {servers?.map((server) => (
                            <SelectItem key={server.id} value={server.id.toString()}>
                              {server.name} ({server.ipAddress})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Select the server to run this task on
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {watchTaskType === "command" && (
                  <FormField
                    control={form.control}
                    name="commandConfig.command"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Command</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="e.g., apt-get update && apt-get upgrade -y"
                            className="font-mono"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          The shell command to execute on the target server
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                
                {watchTaskType === "playbook" && (
                  <FormField
                    control={form.control}
                    name="playbookId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Playbook</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value?.toString()}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select playbook" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {playbooks?.map((playbook) => (
                              <SelectItem key={playbook.id} value={playbook.id.toString()}>
                                {playbook.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Select the Ansible playbook to run
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                
                {watchTaskType === "system" && (
                  <>
                    <FormField
                      control={form.control}
                      name="systemConfig.action"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>System Action</FormLabel>
                          <FormControl>
                            <Input 
                              readOnly 
                              {...field}
                              value="manage_service" 
                            />
                          </FormControl>
                          <FormDescription>
                            System tasks are focused on systemd service management
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    {/* System task only handles service management now */}
                    
                    {/* Service management form fields */}
                    <FormField
                      control={form.control}
                      name="systemConfig.serviceName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Service Name</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., nginx" {...field} />
                          </FormControl>
                          <FormDescription>
                            Name of the systemd service to manage
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="systemConfig.operation"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Operation</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select operation" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="start">Start</SelectItem>
                              <SelectItem value="stop">Stop</SelectItem>
                              <SelectItem value="restart">Restart</SelectItem>
                              <SelectItem value="enable">Enable</SelectItem>
                              <SelectItem value="disable">Disable</SelectItem>
                              <SelectItem value="status">Status</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            Action to perform on the systemd service
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}
                
                {/* Scheduling has been removed from the task management system */}
                
                <DialogFooter className="flex gap-2">
                  <Button 
                    type="submit" 
                    className="bg-green-600 hover:bg-green-700"
                  >
                    Create Task
                  </Button>
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => {
                      // Debug info
                      console.log("Form state:", {
                        isValid: form.formState.isValid,
                        isDirty: form.formState.isDirty,
                        errors: form.formState.errors,
                        values: form.getValues()
                      });
                    }}
                  >
                    Debug Form
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-col md:flex-row gap-4">
        <div className="relative flex-grow">
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
            <Search className="h-4 w-4 text-gray-400" />
          </div>
          <Input
            className="pl-10"
            placeholder="Search tasks..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Select
          value={selectedStatus || ""}
          onValueChange={(value) => setSelectedStatus(value || null)}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="queued">Queued</SelectItem>
            <SelectItem value="running">Running</SelectItem>
            <SelectItem value="success">Success</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Task List */}
      <Card>
        <CardHeader className="px-4 py-5 border-b border-gray-200">
          <CardTitle className="text-lg font-medium text-gray-900">Tasks</CardTitle>
        </CardHeader>
        
        <CardContent className="p-0 divide-y divide-gray-200">
          {isLoading ? (
            <div className="p-6 text-center">
              <Clock1 className="h-12 w-12 text-gray-400 mx-auto mb-4 animate-pulse" />
              <p>Loading tasks...</p>
            </div>
          ) : filteredTasks.length > 0 ? (
            filteredTasks.map((task) => (
              <TaskListItem 
                key={task.id} 
                task={task} 
                onRun={handleRunTask}
                onTaskDeleted={refetchTasks}
              />
            ))
          ) : (
            <div className="text-center p-12">
              <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              {searchTerm || selectedStatus ? (
                <>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No matching tasks</h3>
                  <p className="text-gray-500 mb-6">
                    No tasks match your search criteria. Try adjusting your filters.
                  </p>
                  <Button 
                    onClick={() => {
                      setSearchTerm("");
                      setSelectedStatus(null);
                    }} 
                    variant="outline"
                  >
                    Clear Filters
                  </Button>
                </>
              ) : (
                <>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No tasks yet</h3>
                  <p className="text-gray-500 mb-6">
                    Create your first automation task to manage your servers efficiently.
                  </p>
                  <Button 
                    onClick={() => setIsDialogOpen(true)} 
                  >
                    <Plus className="mr-2 h-4 w-4" /> Create Task
                  </Button>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the task "{deleteTarget?.name}". This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteTask} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}