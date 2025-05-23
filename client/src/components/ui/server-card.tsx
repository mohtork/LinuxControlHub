import { Server } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Terminal, MoreHorizontal, Edit, ExternalLink, Trash } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Link } from "wouter";
import { ServerMetrics } from "./server-metrics";
import { useState, useEffect } from "react";
import { fetchServerMetrics } from "@/lib/ssh";
import { EditServerDialog } from "@/components/edit-server-dialog";

interface ServerCardProps {
  server: Server;
  onDelete: (server: Server) => void;
}

export function ServerCard({ server, onDelete }: ServerCardProps) {
  const [metrics, setMetrics] = useState<{
    cpuUsage: number;
    memoryUsage: number;
    diskUsage: number;
    uptime: number;
  } | null>(null);
  
  const [loading, setLoading] = useState(false);
  
  useEffect(() => {
    const getMetrics = async () => {
      try {
        setLoading(true);
        const latestMetrics = await fetchServerMetrics(server.id);
        setMetrics({
          cpuUsage: latestMetrics.cpuUsage || 0,
          memoryUsage: latestMetrics.memoryUsage || 0,
          diskUsage: latestMetrics.diskUsage || 0,
          uptime: latestMetrics.uptime || 0,
        });
      } catch (error) {
        console.error("Failed to fetch metrics:", error);
      } finally {
        setLoading(false);
      }
    };
    
    getMetrics();
  }, [server.id]);
  
  // Format uptime
  const formatUptime = (seconds: number) => {
    if (!seconds) return "Unknown";
    
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    return `${days}d ${hours}h ${minutes}m`;
  };
  
  // Get status badge color
  const getStatusColor = (status: string) => {
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
  
  // Server OS icon
  const getOSIcon = (os?: string) => {
    if (!os) return "ri-server-line";
    
    const osName = os.toLowerCase();
    if (osName.includes("ubuntu")) return "ri-ubuntu-fill";
    if (osName.includes("debian")) return "ri-debian-fill";
    if (osName.includes("centos")) return "ri-centos-fill";
    if (osName.includes("fedora")) return "ri-fedora-fill";
    if (osName.includes("redhat")) return "ri-redhat-fill";
    if (osName.includes("windows")) return "ri-windows-fill";
    return "ri-server-line";
  };
  
  return (
    <Card className="hover:bg-gray-50 transition-colors">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <div className="flex-shrink-0 h-10 w-10 bg-green-100 rounded-md flex items-center justify-center text-green-600">
              <i className={`${getOSIcon(server.os)} text-xl`}></i>
            </div>
            <div className="ml-4">
              <div className="text-sm font-medium text-gray-900">
                <span>{server.name}</span>
                {server.tags && server.tags.length > 0 && (
                  <Badge variant="outline" className="ml-2">
                    {server.tags[0]}
                  </Badge>
                )}
              </div>
              <div className="text-sm text-gray-500">
                <span>{server.ipAddress}</span> | <span>{server.os || "Unknown OS"}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Badge variant="outline" className={`${getStatusColor(server.status)}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-current mr-1"></span>
              {server.status.charAt(0).toUpperCase() + server.status.slice(1)}
            </Badge>
            
            <Link href={`/terminal/${server.id}`}>
              <Button variant="ghost" size="icon">
                <Terminal className="h-4 w-4" />
              </Button>
            </Link>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link href={`/servers/${server.id}`}><ExternalLink className="h-4 w-4 mr-2" /> View Details</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={`/terminal/${server.id}`}><Terminal className="h-4 w-4 mr-2" /> Terminal</Link>
                </DropdownMenuItem>
                <EditServerDialog 
                  server={server}
                  triggerElement={
                    <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                      <Edit className="h-4 w-4 mr-2" /> Edit Server
                    </DropdownMenuItem>
                  }
                />
                <DropdownMenuItem onClick={() => onDelete(server)} className="text-red-600">
                  <Trash className="h-4 w-4 mr-2" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        
        <div className="mt-2">
          <ServerMetrics 
            cpu={metrics?.cpuUsage || 0} 
            memory={metrics?.memoryUsage || 0} 
            disk={metrics?.diskUsage || 0} 
            uptime={formatUptime(metrics?.uptime || 0)}
            loading={loading}
          />
        </div>
      </CardContent>
    </Card>
  );
}
