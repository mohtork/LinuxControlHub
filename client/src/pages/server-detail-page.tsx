import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { getServer, fetchServerMetrics, getCommandHistory, executeCommand, deleteServer } from "@/lib/ssh";
import { getTasksByServer, runTask } from "@/lib/task-service";
import { startVulnerabilityScan, getVulnerabilityScans, getSeverityColor } from "@/lib/vulnerability-service";
import { startMalwareScan, getMalwareScans, getScanStatusText, getScanStatusColor } from "@/lib/malware-service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Terminal as TerminalIcon, Server, ExternalLink, Activity, History, Edit, Trash2, ChevronLeft, ListTodo, Bug } from "lucide-react";
import { ServerMetrics } from "@/components/ui/server-metrics";
import { Terminal } from "@/components/ui/terminal";
import { Server as ServerType, Command, ServerMetrics as ServerMetricsType, Task } from "@shared/schema";
import { TaskListItem } from "@/components/ui/task-list-item";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { EditServerDialog } from "@/components/edit-server-dialog";
import VulnerabilityDetailsDialog from "@/components/vulnerability-details-dialog";
import MalwareDetailsDialog from "@/components/malware-details-dialog";
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { 
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from "recharts";

interface ServerDetailPageProps {
  serverId: number;
}

export default function ServerDetailPage({ serverId }: ServerDetailPageProps) {
  const [, setLocation] = useLocation();
  const [command, setCommand] = useState("");
  const [currentTab, setCurrentTab] = useState("metrics"); // Track current tab
  const [tabChanged, setTabChanged] = useState(false); // State to force re-render on tab change
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: server, isLoading: isServerLoading } = useQuery<ServerType>({
    queryKey: [`/api/servers/${serverId}`],
  });

  const { data: metrics, isLoading: isMetricsLoading, refetch: refetchMetrics } = useQuery<ServerMetricsType[]>({
    queryKey: [`/api/servers/${serverId}/metrics`],
  });

  const { data: commands, isLoading: isCommandsLoading, refetch: refetchCommands } = useQuery<Command[]>({
    queryKey: [`/api/servers/${serverId}/commands`],
  });
  
  const { data: serverTasks, isLoading: isTasksLoading, refetch: refetchTasks } = useQuery<Task[]>({
    queryKey: [`/api/tasks`, serverId],
    queryFn: async () => {
      return await getTasksByServer(serverId);
    },
    refetchInterval: 5000 // Refresh every 5 seconds to check for status changes
  });
  
  const [selectedVulnerabilityScanId, setSelectedVulnerabilityScanId] = useState<number | null>(null);
  const [selectedMalwareScanId, setSelectedMalwareScanId] = useState<number | null>(null);

  const { data: vulnerabilityScans, isLoading: isVulnerabilityScanLoading, refetch: refetchVulnerabilityScans } = useQuery({
    queryKey: [`/api/vulnerability-scans`, serverId],
    queryFn: async () => {
      return await getVulnerabilityScans(serverId);
    },
    refetchInterval: 10000 // Refresh every 10 seconds to check for new scans
  });
  
  const { data: malwareScans, isLoading: isMalwareScanLoading, refetch: refetchMalwareScans } = useQuery({
    queryKey: [`/api/malware-scans`, serverId],
    queryFn: async () => {
      return await getMalwareScans(serverId);
    },
    refetchInterval: 10000 // Refresh every 10 seconds to check for new scans
  });

  const handleRefreshMetrics = async () => {
    try {
      await fetchServerMetrics(serverId);
      refetchMetrics();
      toast({
        title: "Metrics refreshed",
        description: "Server metrics have been updated.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: `Failed to refresh metrics: ${error.message}`,
        variant: "destructive",
      });
    }
  };

  const handleRunCommand = async () => {
    if (!command.trim()) return;
    
    try {
      await executeCommand(serverId, command);
      setCommand("");
      refetchCommands();
      toast({
        title: "Command executed",
        description: "Check command history for results.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: `Failed to execute command: ${error.message}`,
        variant: "destructive",
      });
    }
  };

  // Format uptime
  const formatUptime = (seconds: number) => {
    if (!seconds) return "Unknown";
    
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    return `${days}d ${hours}h ${minutes}m`;
  };

  // Prepare chart data
  const prepareChartData = (metrics: ServerMetricsType[] | undefined) => {
    if (!metrics || metrics.length === 0) return [];
    
    return metrics.map(metric => ({
      time: metric.timestamp ? format(new Date(metric.timestamp), 'HH:mm') : 'Unknown',
      cpu: metric.cpuUsage || 0,
      memory: metric.memoryUsage || 0,
      disk: metric.diskUsage || 0,
    })).slice(-20); // Last 20 data points
  };

  const chartData = prepareChartData(metrics);

  // Get status badge color
  const getStatusColor = (status: string | null) => {
    switch (status) {
      case "online":
        return "bg-green-100 text-green-800";
      case "offline":
        return "bg-red-100 text-red-800";
      case "error":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  if (isServerLoading) {
    return <div className="text-center p-12">Loading server details...</div>;
  }

  if (!server) {
    return (
      <div className="text-center p-12">
        <h2 className="text-xl font-semibold mb-4">Server not found</h2>
        <p className="mb-4">The server you are looking for doesn't exist or has been deleted.</p>
        <Button onClick={() => setLocation("/servers")}>
          <ChevronLeft className="mr-2 h-4 w-4" />
          Back to Servers
        </Button>
      </div>
    );
  }

  return (
    <div>
      {/* Header with back button */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setLocation("/servers")}>
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <h1 className="text-2xl font-bold text-gray-900">{server.name}</h1>
          <Badge className={getStatusColor(server.status || 'unknown')}>
            <span className="w-1.5 h-1.5 rounded-full bg-current mr-1"></span>
            {server.status ? server.status.charAt(0).toUpperCase() + server.status.slice(1) : 'Unknown'}
          </Badge>
        </div>
        <div className="flex gap-2">
          <Link href={`/terminal/${server.id}`}>
            <Button variant="outline" size="sm">
              <TerminalIcon className="mr-1 h-4 w-4" />
              Terminal
            </Button>
          </Link>
          <EditServerDialog 
            server={server} 
            onServerUpdated={() => {
              window.location.reload();
            }}
          />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700">
                <Trash2 className="mr-1 h-4 w-4" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Server</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete this server? This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction 
                  className="bg-red-600 hover:bg-red-700"
                  onClick={async () => {
                    try {
                      await deleteServer(server.id);
                      toast({
                        title: "Server deleted",
                        description: "Server has been successfully deleted.",
                      });
                      setLocation("/servers");
                    } catch (error: any) {
                      toast({
                        title: "Error deleting server",
                        description: error.message,
                        variant: "destructive",
                      });
                    }
                  }}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Server Info Card */}
      <Card className="mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Server Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <h3 className="text-sm font-medium text-gray-500">Connection Details</h3>
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div className="font-medium">Hostname:</div>
                <div>{server.hostname}</div>
                <div className="font-medium">IP Address:</div>
                <div>{server.ipAddress}</div>
                <div className="font-medium">SSH Port:</div>
                <div>{server.port}</div>
                <div className="font-medium">Username:</div>
                <div>{server.username}</div>
                <div className="font-medium">Auth Type:</div>
                <div>{server.authType === 'password' ? 'Password' : 'SSH Key'}</div>
              </div>
            </div>
            
            <div>
              <h3 className="text-sm font-medium text-gray-500">System Information</h3>
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div className="font-medium">Operating System:</div>
                <div>{server.os || "Unknown"}</div>
                <div className="font-medium">Status:</div>
                <div>
                  <Badge className={getStatusColor(server.status || 'unknown')}>
                    {server.status ? server.status.charAt(0).toUpperCase() + server.status.slice(1) : 'Unknown'}
                  </Badge>
                </div>
                <div className="font-medium">Last Check:</div>
                <div>{server.lastChecked ? format(new Date(server.lastChecked), 'MMM dd, yyyy HH:mm') : "Never"}</div>
              </div>
            </div>
            
            <div>
              <h3 className="text-sm font-medium text-gray-500">Tags & Groups</h3>
              <div className="mt-2 text-sm">
                {server.tags && server.tags.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {server.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="mr-1 mb-1">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <span className="text-gray-500">No tags assigned</span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs for different sections */}
      <Tabs defaultValue="metrics" onValueChange={(value) => {
        // Update the current tab for conditional rendering
        setCurrentTab(value);
      }}>
        <TabsList>
          <TabsTrigger value="metrics">
            <Activity className="h-4 w-4 mr-2" />
            Metrics
          </TabsTrigger>
          <TabsTrigger value="terminal">
            <TerminalIcon className="h-4 w-4 mr-2" />
            Terminal
          </TabsTrigger>
          <TabsTrigger value="commands">
            <History className="h-4 w-4 mr-2" />
            Command History
          </TabsTrigger>
          <TabsTrigger value="tasks">
            <ListTodo className="h-4 w-4 mr-2" />
            Task History
          </TabsTrigger>
          <TabsTrigger value="vulnerabilities">
            <svg className="h-4 w-4 mr-2" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
              <path d="M8 11h8" />
              <path d="M12 15v-8" />
            </svg>
            Vulnerability Scans
          </TabsTrigger>
          <TabsTrigger value="malware">
            <Bug className="h-4 w-4 mr-2" />
            Malware Scans
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="metrics" className="mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg">Server Metrics</CardTitle>
              <Button onClick={handleRefreshMetrics} size="sm" variant="outline">
                Refresh Metrics
              </Button>
            </CardHeader>
            <CardContent>
              {isMetricsLoading ? (
                <div className="text-center p-6">Loading metrics...</div>
              ) : metrics && metrics.length > 0 ? (
                <>
                  <div className="mb-6">
                    <ServerMetrics 
                      cpu={metrics[metrics.length - 1].cpuUsage || 0}
                      memory={metrics[metrics.length - 1].memoryUsage || 0}
                      disk={metrics[metrics.length - 1].diskUsage || 0}
                      uptime={formatUptime(metrics[metrics.length - 1].uptime || 0)}
                    />
                  </div>
                  
                  <div className="mt-6">
                    <h3 className="text-sm font-medium mb-4">Historical Metrics</h3>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                          data={chartData}
                          margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                          <XAxis dataKey="time" />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          <Area type="monotone" dataKey="cpu" stackId="1" stroke="#3b82f6" fill="#3b82f6" name="CPU %" />
                          <Area type="monotone" dataKey="memory" stackId="2" stroke="#10b981" fill="#10b981" name="Memory %" />
                          <Area type="monotone" dataKey="disk" stackId="3" stroke="#f59e0b" fill="#f59e0b" name="Disk %" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center p-6">
                  <p className="text-gray-500 mb-4">No metrics available for this server.</p>
                  <Button onClick={handleRefreshMetrics}>Fetch Metrics</Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="terminal" className="mt-6">
          {/* Only render Terminal when this tab is active to prevent WebSocket issues */}
          {currentTab === "terminal" && (
            <Terminal key={`terminal-${serverId}`} server={server} fullscreen />
          )}
        </TabsContent>
        
        <TabsContent value="commands" className="mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg">Command History</CardTitle>
              <div className="flex items-center gap-2">
                <div className="flex items-center">
                  <Input
                    placeholder="Enter command..."
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleRunCommand()}
                    className="min-w-[300px]"
                  />
                  <Button onClick={handleRunCommand} className="ml-2">
                    Run
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isCommandsLoading ? (
                <div className="text-center p-6">Loading command history...</div>
              ) : commands && commands.length > 0 ? (
                <div className="overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Command
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Exit Code
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Timestamp
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {commands.map((cmd) => (
                        <tr key={cmd.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-mono">
                            {cmd.command}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <Badge variant={cmd.exitCode === 0 ? "default" : "destructive"}>
                              {cmd.exitCode}
                            </Badge>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {cmd.timestamp ? format(new Date(cmd.timestamp), 'MMM dd, yyyy HH:mm:ss') : 'Unknown'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center p-6">
                  <p className="text-gray-500">No command history available for this server.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="tasks" className="mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg">Task History</CardTitle>
              <Link href="/tasks">
                <Button variant="outline" size="sm">
                  View All Tasks
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {isTasksLoading ? (
                <div className="text-center p-6">Loading task history...</div>
              ) : serverTasks && serverTasks.length > 0 ? (
                <div className="border rounded-md divide-y">
                  {serverTasks.map((task) => (
                    <TaskListItem 
                      key={task.id} 
                      task={task} 
                      onRun={async (task) => {
                        try {
                          await runTask(task.id);
                          toast({
                            title: "Task started",
                            description: "The task has been queued for execution."
                          });
                          // Refresh the tasks list after a short delay
                          setTimeout(() => refetchTasks(), 1000);
                        } catch (error: any) {
                          toast({
                            title: "Failed to run task",
                            description: error.message,
                            variant: "destructive"
                          });
                        }
                      }}
                      onTaskDeleted={() => refetchTasks()}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center p-6">
                  <p className="text-gray-500 mb-4">No tasks have been executed on this server.</p>
                  <Link href="/tasks">
                    <Button>Create a Task</Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="vulnerabilities" className="mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg">Vulnerability Scans</CardTitle>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button>
                    Start New Scan
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Start Vulnerability Scan</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will scan the server for known vulnerabilities. The scan may take several minutes to complete.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={async () => {
                        try {
                          const result = await startVulnerabilityScan(serverId);
                          toast({
                            title: "Scan started",
                            description: "Vulnerability scan has been initiated. Check the task history for progress.",
                          });
                          
                          // Refresh the tasks and scans lists after a short delay
                          setTimeout(() => {
                            refetchTasks();
                            refetchVulnerabilityScans();
                            
                            // Invalidate the vulnerability scans cache to ensure fresh data
                            queryClient.invalidateQueries({
                              queryKey: [`/api/vulnerability-scans`, serverId]
                            });
                          }, 1000);
                        } catch (error: any) {
                          toast({
                            title: "Error",
                            description: `Failed to start scan: ${error.message}`,
                            variant: "destructive",
                          });
                        }
                      }}
                    >
                      Start Scan
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Vulnerability Scan History */}
                <div>
                  <h3 className="text-sm font-medium mb-4">Recent Vulnerability Scans</h3>
                  
                  <div className="overflow-hidden border rounded-md">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Date
                          </th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Findings
                          </th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Status
                          </th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {isVulnerabilityScanLoading ? (
                          <tr>
                            <td colSpan={4} className="px-6 py-10 text-center text-sm text-gray-500">
                              Loading vulnerability scan history...
                            </td>
                          </tr>
                        ) : vulnerabilityScans && vulnerabilityScans.length > 0 ? (
                          vulnerabilityScans.map((scan) => (
                            <tr key={scan.id}>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {scan.scanDate ? format(new Date(scan.scanDate), 'MMM dd, yyyy HH:mm') : 'N/A'}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="flex flex-wrap gap-1">
                                  {(scan.criticalCount || 0) > 0 && (
                                    <Badge className="bg-red-100 text-red-800">
                                      {scan.criticalCount} Critical
                                    </Badge>
                                  )}
                                  {(scan.highCount || 0) > 0 && (
                                    <Badge className="bg-orange-100 text-orange-800">
                                      {scan.highCount} High
                                    </Badge>
                                  )}
                                  {(scan.mediumCount || 0) > 0 && (
                                    <Badge className="bg-yellow-100 text-yellow-800">
                                      {scan.mediumCount} Medium
                                    </Badge>
                                  )}
                                  {(scan.lowCount || 0) > 0 && (
                                    <Badge className="bg-blue-100 text-blue-800">
                                      {scan.lowCount} Low
                                    </Badge>
                                  )}
                                  {(scan.criticalCount || 0) === 0 && (scan.highCount || 0) === 0 && 
                                   (scan.mediumCount || 0) === 0 && (scan.lowCount || 0) === 0 && 
                                   scan.status === 'success' && (
                                    <Badge variant="outline" className="text-green-600">
                                      No issues found
                                    </Badge>
                                  )}
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <Badge variant="outline" className={
                                  scan.status === 'failed' ? 'text-red-600' : 
                                  scan.status === 'running' ? 'text-blue-600' :
                                  scan.status === 'success' ? 'text-green-600' : 'text-gray-600'
                                }>
                                  {scan.status ? scan.status.charAt(0).toUpperCase() + scan.status.slice(1) : 'Unknown'}
                                </Badge>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {scan.status === 'success' && (
                                  <Button variant="link" className="p-0 h-auto" onClick={() => {
                                    setSelectedVulnerabilityScanId(scan.id);
                                  }}>
                                    View Details
                                  </Button>
                                )}
                                {scan.errorMessage && (
                                  <Button variant="link" className="p-0 h-auto text-red-600" onClick={() => {
                                    toast({
                                      title: "Scan Error",
                                      description: scan.errorMessage,
                                      variant: "destructive"
                                    });
                                  }}>
                                    View Error
                                  </Button>
                                )}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={4} className="px-6 py-10 text-center text-sm text-gray-500">
                              No vulnerability scans have been performed yet. Click "Start New Scan" to run a vulnerability scan.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
                
                {/* Scan Information */}
                <div className="bg-gray-50 p-4 rounded-md">
                  <h3 className="text-sm font-medium mb-2">About Vulnerability Scanning</h3>
                  <p className="text-sm text-gray-600 mb-2">
                    Vulnerability scanning helps identify security weaknesses in your server's operating system and installed software.
                  </p>
                  <p className="text-sm text-gray-600">
                    The scan looks for known security vulnerabilities (CVEs) in installed packages and provides recommendations for remediation.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Add Malware Scan Tab Content */}
        <TabsContent value="malware" className="mt-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg">Malware Scans</CardTitle>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button>
                  Start New Scan
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Start Malware Scan</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will scan the server for malware. ClamAV will be installed if it's not already present. 
                    The scan may take several minutes to complete depending on the directory size.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="p-4 border rounded-md mb-4">
                  <h4 className="text-sm font-medium mb-2">Scan Directory</h4>
                  <Input 
                    id="scanDirectory" 
                    placeholder="/var/www" 
                    defaultValue="/"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Leave as "/" to scan the entire system (may take longer)
                  </p>
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={async () => {
                      try {
                        const scanDir = document.getElementById('scanDirectory') as HTMLInputElement;
                        const scanDirectory = scanDir?.value || '/';
                        
                        const result = await startMalwareScan(serverId, { scanDirectory });
                        toast({
                          title: "Scan started",
                          description: "Malware scan has been initiated. Check the task history for progress.",
                        });
                        
                        // Refresh the tasks and scans lists after a short delay
                        setTimeout(() => {
                          refetchTasks();
                          refetchMalwareScans();
                          
                          // Invalidate the malware scans cache to ensure fresh data
                          queryClient.invalidateQueries({
                            queryKey: [`/api/malware-scans`, serverId]
                          });
                        }, 1000);
                      } catch (error: any) {
                        toast({
                          title: "Error",
                          description: `Failed to start scan: ${error.message}`,
                          variant: "destructive",
                        });
                      }
                    }}
                  >
                    Start Scan
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {/* Malware Scan History */}
              <div>
                <h3 className="text-sm font-medium mb-4">Recent Malware Scans</h3>
                
                <div className="overflow-hidden border rounded-md">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Date
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Directory
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Findings
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {isMalwareScanLoading ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-10 text-center text-sm text-gray-500">
                            Loading malware scan history...
                          </td>
                        </tr>
                      ) : malwareScans && malwareScans.length > 0 ? (
                        malwareScans.map((scan: any) => (
                          <tr key={scan.id}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {scan.scanDate ? format(new Date(scan.scanDate), 'MMM dd, yyyy HH:mm') : 'N/A'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-mono">
                              {scan.scanDirectory || '/'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <Badge className={(scan.threatCount || 0) > 0 ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"}>
                                {(scan.threatCount || 0) > 0 ? `${scan.threatCount} threats detected` : "No threats found"}
                              </Badge>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={getScanStatusColor(scan.status)}>
                                {getScanStatusText(scan.status)}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {scan.status === 'success' && (
                                <Button variant="link" className="p-0 h-auto" onClick={() => {
                                  setSelectedMalwareScanId(scan.id);
                                }}>
                                  View Details
                                </Button>
                              )}
                              {scan.errorMessage && (
                                <Button variant="link" className="p-0 h-auto text-red-600" onClick={() => {
                                  toast({
                                    title: "Scan Error",
                                    description: scan.errorMessage,
                                    variant: "destructive"
                                  });
                                }}>
                                  View Error
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="px-6 py-10 text-center text-sm text-gray-500">
                            No malware scans have been performed yet. Click "Start New Scan" to run a malware scan.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              
              {/* Scan Information */}
              <div className="bg-gray-50 p-4 rounded-md">
                <h3 className="text-sm font-medium mb-2">About Malware Scanning</h3>
                <p className="text-sm text-gray-600 mb-2">
                  Malware scanning uses ClamAV to detect viruses, trojans, malware, and other threats on your Linux server.
                </p>
                <p className="text-sm text-gray-600">
                  Regular scans help ensure your server remains secure and free from harmful software that could compromise your data.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
      </Tabs>

      {/* Vulnerability Details Dialog */}
      {selectedVulnerabilityScanId && (
        <VulnerabilityDetailsDialog 
          scanId={selectedVulnerabilityScanId}
          open={!!selectedVulnerabilityScanId}
          onClose={() => setSelectedVulnerabilityScanId(null)}
        />
      )}

      {/* Malware Details Dialog */}
      {selectedMalwareScanId && (
        <MalwareDetailsDialog 
          scanId={selectedMalwareScanId}
          open={!!selectedMalwareScanId}
          onOpenChange={(open) => {
            if (!open) setSelectedMalwareScanId(null);
          }}
        />
      )}
    </div>
  );
}
