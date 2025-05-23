import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Task, Command } from "@shared/schema";
import { getTasks } from "@/lib/ansible";
import { getServers, getCommandHistory } from "@/lib/ssh";
import { Search, ArrowDown, FileText, Terminal, Calendar, Filter } from "lucide-react";
import { format } from "date-fns";

export default function LogsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [selectedServer, setSelectedServer] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const { data: tasks, isLoading: isTasksLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
  });

  const { data: servers } = useQuery<any[]>({
    queryKey: ["/api/servers"],
  });

  const { data: commands, isLoading: isCommandsLoading } = useQuery<Command[]>({
    queryKey: [selectedServer ? `/api/servers/${selectedServer}/commands` : '/api/commands'],
  });

  // Filter tasks based on search and filters
  const filteredTasks = tasks
    ? tasks.filter((task) => {
        const matchesSearch =
          searchTerm === "" ||
          task.name.toLowerCase().includes(searchTerm.toLowerCase());
        
        const matchesStatus =
          selectedStatus === null || 
          selectedStatus === "all" || 
          task.status === selectedStatus;
        
        const matchesDate =
          selectedDate === null ||
          selectedDate === "all" ||
          (task.completedAt &&
            format(new Date(task.completedAt), "yyyy-MM-dd") === selectedDate);
        
        return matchesSearch && matchesStatus && matchesDate;
      })
    : [];

  // Filter commands based on search and filters
  const filteredCommands = commands
    ? commands.filter((command) => {
        const matchesSearch =
          searchTerm === "" ||
          command.command.toLowerCase().includes(searchTerm.toLowerCase());
        
        const matchesDate =
          selectedDate === null || 
          selectedDate === "all" ||
          (command.timestamp && typeof command.timestamp === 'string' && 
            format(new Date(command.timestamp), "yyyy-MM-dd") === selectedDate);
        
        return matchesSearch && matchesDate;
      })
    : [];

  // Generate dates for date filter (last 14 days)
  const generateDateOptions = () => {
    const dates = [];
    const today = new Date();
    
    for (let i = 0; i < 14; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      dates.push({
        value: format(date, "yyyy-MM-dd"),
        label: format(date, "MMM dd, yyyy"),
      });
    }
    
    return dates;
  };

  // Get status badge color
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "success":
        return <Badge className="bg-green-100 text-green-800">Success</Badge>;
      case "failed":
        return <Badge className="bg-red-100 text-red-800">Failed</Badge>;
      case "running":
        return <Badge className="bg-yellow-100 text-yellow-800">Running</Badge>;
      case "queued":
        return <Badge className="bg-blue-100 text-blue-800">Queued</Badge>;
      default:
        return <Badge className="bg-gray-100 text-gray-800">{status}</Badge>;
    }
  };

  return (
    <div>
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Logs & Activity</h1>
        <p className="mt-1 text-sm text-gray-500">
          View tasks, commands, and system activity logs
        </p>
      </div>

      {/* Filters */}
      <div className="mb-6 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="relative col-span-1 md:col-span-2">
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
            <Search className="h-4 w-4 text-gray-400" />
          </div>
          <Input
            className="pl-10"
            placeholder="Search logs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <Select
          value={selectedDate || "all"}
          onValueChange={(value) => setSelectedDate(value !== "all" ? value : null)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Filter by date" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All dates</SelectItem>
            {generateDateOptions().map((date) => (
              <SelectItem key={date.value} value={date.value}>
                {date.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        {selectedServer && (
          <Button 
            variant="outline" 
            className="flex items-center gap-2"
            onClick={() => {
              setSelectedServer(null);
              setSearchTerm("");
              setSelectedDate(null);
              setSelectedStatus(null);
            }}
          >
            <Filter className="h-4 w-4" />
            Clear Filters
          </Button>
        )}
      </div>

      {/* Logs Tabs */}
      <Tabs defaultValue="tasks" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="tasks">
            <FileText className="h-4 w-4 mr-2" />
            Task Logs
          </TabsTrigger>
          <TabsTrigger value="commands">
            <Terminal className="h-4 w-4 mr-2" />
            Command History
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="tasks">
          <Card>
            <CardHeader className="px-6 py-4 border-b border-gray-200 flex flex-row items-center justify-between">
              <CardTitle className="text-lg font-medium text-gray-900">Task Execution Logs</CardTitle>
              <div className="flex gap-2">
                <Select
                  value={selectedStatus || "all"}
                  onValueChange={(value) => setSelectedStatus(value !== "all" ? value : null)}
                >
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="queued">Queued</SelectItem>
                    <SelectItem value="running">Running</SelectItem>
                    <SelectItem value="success">Success</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm">
                  <ArrowDown className="h-4 w-4 mr-2" />
                  Export
                </Button>
              </div>
            </CardHeader>
            
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Task Name
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Type
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Started
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Completed
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Exit Code
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {isTasksLoading ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                          Loading task logs...
                        </td>
                      </tr>
                    ) : filteredTasks.length > 0 ? (
                      filteredTasks.map((task) => (
                        <tr key={task.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {task.name}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            <Badge variant="outline">
                              {task.type}
                            </Badge>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {getStatusBadge(task.status || 'unknown')}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {task.startedAt 
                              ? format(new Date(task.startedAt), 'MMM dd, yyyy HH:mm:ss')
                              : '-'
                            }
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {task.completedAt 
                              ? format(new Date(task.completedAt), 'MMM dd, yyyy HH:mm:ss')
                              : '-'
                            }
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {task.exitCode !== undefined ? task.exitCode : '-'}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                          No task logs found matching your criteria.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="commands">
          <Card>
            <CardHeader className="px-6 py-4 border-b border-gray-200 flex flex-row items-center justify-between">
              <CardTitle className="text-lg font-medium text-gray-900">Command History</CardTitle>
              <div className="flex gap-2">
                <Select
                  value={selectedServer?.toString() || "all"}
                  onValueChange={(value) => setSelectedServer(value && value !== "all" ? parseInt(value) : null)}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Select server" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All servers</SelectItem>
                    {servers?.map((server) => (
                      <SelectItem key={server.id} value={server.id.toString()}>
                        {server.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm">
                  <ArrowDown className="h-4 w-4 mr-2" />
                  Export
                </Button>
              </div>
            </CardHeader>
            
            <CardContent className="p-0">
              <div className="overflow-x-auto">
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
                    {isCommandsLoading ? (
                      <tr>
                        <td colSpan={3} className="px-6 py-4 text-center text-gray-500">
                          Loading command history...
                        </td>
                      </tr>
                    ) : filteredCommands?.length > 0 ? (
                      filteredCommands.map((command) => (
                        <tr key={command.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-mono">
                            {command.command}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <Badge variant={command.exitCode === 0 ? "default" : "destructive"}>
                              {command.exitCode}
                            </Badge>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {command.timestamp ? format(new Date(command.timestamp), 'MMM dd, yyyy HH:mm:ss') : '-'}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={3} className="px-6 py-4 text-center text-gray-500">
                          No command history found matching your criteria.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Activity Summary */}
      <div className="mt-6">
        <Card>
          <CardHeader className="px-6 py-4 border-b border-gray-200">
            <CardTitle className="text-lg font-medium text-gray-900">Activity Overview</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-primary-600 mb-1">
                  {tasks?.filter(t => t.status === 'success').length || 0}
                </div>
                <div className="text-sm text-gray-500">Successful Tasks</div>
              </div>
              
              <div className="text-center">
                <div className="text-3xl font-bold text-red-600 mb-1">
                  {tasks?.filter(t => t.status === 'failed').length || 0}
                </div>
                <div className="text-sm text-gray-500">Failed Tasks</div>
              </div>
              
              <div className="text-center">
                <div className="text-3xl font-bold text-indigo-600 mb-1">
                  {commands?.length || 0}
                </div>
                <div className="text-sm text-gray-500">Commands Executed</div>
              </div>
              
              <div className="text-center">
                <div className="text-3xl font-bold text-green-600 mb-1">
                  {tasks?.filter(t => t.scheduleExpression).length || 0}
                </div>
                <div className="text-sm text-gray-500">Scheduled Tasks</div>
              </div>
            </div>
            
            <div className="mt-6 text-sm text-gray-500 text-center">
              <Calendar className="h-4 w-4 inline-block mr-1" />
              Showing logs from the last 14 days
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
