import { Skeleton } from "@/components/ui/skeleton";

interface ServerMetricsProps {
  cpu: number;
  memory: number;
  disk: number;
  uptime: string;
  loading?: boolean;
}

export function ServerMetrics({ cpu, memory, disk, uptime, loading = false }: ServerMetricsProps) {
  // Get color for usage bar
  const getUsageColor = (usage: number) => {
    if (usage >= 90) return "bg-red-500";
    if (usage >= 70) return "bg-yellow-500";
    return "bg-green-500";
  };
  
  if (loading) {
    return (
      <div className="grid grid-cols-4 gap-2 text-xs text-gray-500">
        <div>
          <p className="mb-1">CPU</p>
          <Skeleton className="h-2 w-full mb-1" />
          <Skeleton className="h-4 w-6" />
        </div>
        <div>
          <p className="mb-1">Memory</p>
          <Skeleton className="h-2 w-full mb-1" />
          <Skeleton className="h-4 w-6" />
        </div>
        <div>
          <p className="mb-1">Disk</p>
          <Skeleton className="h-2 w-full mb-1" />
          <Skeleton className="h-4 w-6" />
        </div>
        <div>
          <p className="mb-1">Uptime</p>
          <Skeleton className="h-4 w-20" />
        </div>
      </div>
    );
  }
  
  return (
    <div className="grid grid-cols-4 gap-2 text-xs text-gray-500">
      <div>
        <p className="mb-1">CPU</p>
        <div className="health-indicator bg-gray-200 h-2 rounded overflow-hidden">
          <div className={`${getUsageColor(cpu)} h-full`} style={{ width: `${cpu}%` }}></div>
        </div>
        <p className="mt-1">{cpu}%</p>
      </div>
      <div>
        <p className="mb-1">Memory</p>
        <div className="health-indicator bg-gray-200 h-2 rounded overflow-hidden">
          <div className={`${getUsageColor(memory)} h-full`} style={{ width: `${memory}%` }}></div>
        </div>
        <p className="mt-1">{memory}%</p>
      </div>
      <div>
        <p className="mb-1">Disk</p>
        <div className="health-indicator bg-gray-200 h-2 rounded overflow-hidden">
          <div className={`${getUsageColor(disk)} h-full`} style={{ width: `${disk}%` }}></div>
        </div>
        <p className="mt-1">{disk}%</p>
      </div>
      <div>
        <p className="mb-1">Uptime</p>
        <p className="font-medium text-gray-900">{uptime}</p>
      </div>
    </div>
  );
}
