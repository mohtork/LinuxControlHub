import { useState } from "react";
import { Task } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";
import { CheckCircle, AlertCircle, Loader, Info, Clock, PauseCircle, StopCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TaskDetailsDialog } from "./task-details-dialog";

interface TaskListItemProps {
  task: Task;
  onRun: (task: Task) => void;
  onTaskDeleted?: () => void;
}

export function TaskListItem({ task, onRun, onTaskDeleted }: TaskListItemProps) {
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  
  // Format date
  const formatDate = (date: Date | null) => {
    if (!date) return "N/A";
    return formatDistanceToNow(new Date(date), { addSuffix: true });
  };
  
  // Get status icon
  const getStatusIcon = () => {
    switch (task.status) {
      case "success":
        return <CheckCircle className="text-green-500 text-xl" />;
      case "failed":
        return <AlertCircle className="text-red-500 text-xl" />;
      case "running":
        return <Loader className="text-yellow-500 text-xl animate-spin" />;
      case "paused":
        return <PauseCircle className="text-orange-500 text-xl" />;
      case "stopped":
        return <StopCircle className="text-slate-500 text-xl" />;
      case "queued":
        return <Clock className="text-blue-500 text-xl" />;
      default:
        return null;
    }
  };
  
  // Get status badge color
  const getStatusBadge = () => {
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
          <Loader className="h-3 w-3 animate-spin" /> Running
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
  
  // Get task targets description
  const getTaskTargets = () => {
    if (task.serverId) {
      return "1 server";
    } else if (task.serverIds && task.serverIds.length > 0) {
      return `${task.serverIds.length} servers`;
    }
    return "No targets";
  };
  
  // Get task time description
  const getTaskTime = () => {
    if (task.completedAt) {
      return `Completed ${formatDate(task.completedAt)}`;
    } else if (task.startedAt) {
      return `Started ${formatDate(task.startedAt)}`;
    }
    return `Created ${formatDate(task.createdAt)}`;
  };
  
  return (
    <div className="px-4 py-3 sm:px-6 hover:bg-gray-50">
      <div 
        className="flex items-center justify-between cursor-pointer" 
        onClick={() => setIsDetailsOpen(true)}
      >
        <div className="flex items-center">
          <div className="flex-shrink-0">
            {getStatusIcon()}
          </div>
          <div className="ml-3">
            <p className="text-sm font-medium text-gray-900">{task.name}</p>
            <p className="text-xs text-gray-500">
              {getTaskTargets()} • {getTaskTime()}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {getStatusBadge()}
          <Button 
            size="sm" 
            variant="ghost" 
            onClick={(e) => {
              e.stopPropagation();
              setIsDetailsOpen(true);
            }}
          >
            <Info className="h-4 w-4" />
          </Button>
          {task.status !== "running" && task.status !== "paused" && (
            <Button 
              size="sm" 
              variant="outline" 
              onClick={(e) => {
                e.stopPropagation();
                onRun(task);
              }}
            >
              Run
            </Button>
          )}
        </div>
      </div>
      
      {/* Task Details Dialog */}
      <TaskDetailsDialog 
        taskId={task.id}
        isOpen={isDetailsOpen}
        onClose={() => setIsDetailsOpen(false)}
        onTaskDeleted={onTaskDeleted}
      />
    </div>
  );
}
