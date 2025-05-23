import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getServers } from "@/lib/ssh";
import { getTasks } from "@/lib/ansible";
import { Server, Task } from "@shared/schema";
import { 
  ServerIcon, 
  FileCode, 
  Activity,
  HeartPulse, 
  TrendingUp,
  AlertCircle 
} from "lucide-react";

interface StatCardProps {
  icon: React.ReactNode;
  iconBgColor: string;
  iconColor: string;
  title: string;
  value: string | number;
  change?: {
    value: string | number;
    isPositive: boolean;
  };
  alert?: {
    count: number;
    label: string;
  };
}

function StatCard({
  icon,
  iconBgColor,
  iconColor,
  title,
  value,
  change,
  alert,
}: StatCardProps) {
  return (
    <Card className="bg-white overflow-hidden shadow rounded-lg">
      <CardContent className="px-4 py-5 sm:p-6">
        <div className="flex items-center">
          <div
            className={`flex-shrink-0 rounded-md p-3 ${iconBgColor}`}
          >
            <div className={`text-xl ${iconColor}`}>{icon}</div>
          </div>
          <div className="ml-5 w-0 flex-1">
            <dl>
              <dt className="text-sm font-medium text-gray-500 truncate">
                {title}
              </dt>
              <dd className="flex items-baseline">
                <div className="text-2xl font-semibold text-gray-900">
                  {value}
                </div>
                {change && (
                  <div
                    className={`ml-2 flex items-baseline text-sm font-semibold ${
                      change.isPositive ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {change.isPositive ? (
                      <TrendingUp className="h-4 w-4 mr-1" />
                    ) : (
                      <TrendingUp className="h-4 w-4 mr-1 transform rotate-180" />
                    )}
                    <span className="sr-only">
                      {change.isPositive ? "Increased by" : "Decreased by"}
                    </span>
                    {change.value}
                  </div>
                )}
                {alert && (
                  <div className="ml-2 flex items-baseline text-sm font-semibold text-yellow-600">
                    <AlertCircle className="h-4 w-4 mr-1" />
                    <span>{alert.count} {alert.label}</span>
                  </div>
                )}
              </dd>
            </dl>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function DashboardStats() {
  const {
    data: servers,
    isLoading: isServersLoading,
  } = useQuery<Server[]>({
    queryKey: ["/api/servers"],
  });

  const {
    data: tasks,
    isLoading: isTasksLoading,
  } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
  });

  if (isServersLoading || isTasksLoading) {
    return (
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {Array(4)
          .fill(0)
          .map((_, i) => (
            <Card key={i} className="bg-white shadow rounded-lg">
              <CardContent className="px-4 py-5 sm:p-6">
                <div className="flex items-center">
                  <Skeleton className="h-12 w-12 rounded-md" />
                  <div className="ml-5 w-0 flex-1">
                    <Skeleton className="h-4 w-24 mb-2" />
                    <Skeleton className="h-6 w-16" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
      </div>
    );
  }

  // Calculate stats
  const serversCount = servers?.length || 0;
  const onlineServers = servers?.filter(s => s.status === 'online').length || 0;
  
  const activeTasks = tasks?.filter(t => t.status === 'running').length || 0;
  const playbooksCount = tasks?.filter(t => t.type === 'playbook').length || 0;
  
  const failedTasks = tasks?.filter(t => t.status === 'failed').length || 0;
  const healthPercentage = servers && servers.length > 0 
    ? Math.round((onlineServers / servers.length) * 100) 
    : 0;

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        icon={<ServerIcon className="h-6 w-6" />}
        iconBgColor="bg-primary-100"
        iconColor="text-primary-600"
        title="Servers"
        value={serversCount}
        change={{ value: onlineServers, isPositive: true }}
      />
      <StatCard
        icon={<Activity className="h-6 w-6" />}
        iconBgColor="bg-green-100"
        iconColor="text-green-600"
        title="Active Tasks"
        value={activeTasks}
      />
      <StatCard
        icon={<FileCode className="h-6 w-6" />}
        iconBgColor="bg-indigo-100"
        iconColor="text-indigo-600"
        title="Playbooks"
        value={playbooksCount}
      />
      <StatCard
        icon={<HeartPulse className="h-6 w-6" />}
        iconBgColor="bg-yellow-100"
        iconColor="text-yellow-600"
        title="Health Status"
        value={`${healthPercentage}%`}
        alert={failedTasks > 0 ? { count: failedTasks, label: "alert" } : undefined}
      />
    </div>
  );
}
