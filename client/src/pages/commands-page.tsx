import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Server } from "@shared/schema";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowRight, Clock, Search, Server as ServerIcon, Terminal, User } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

export default function CommandsPage() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");

  const { data: servers, isLoading: serversLoading } = useQuery<Server[]>({
    queryKey: ["/api/servers"],
  });

  const { data: commands, isLoading: commandsLoading } = useQuery<any[]>({
    queryKey: ["/api/commands"],
  });

  // Filter commands based on search
  const filteredCommands = commands
    ? commands.filter((command) => {
        return (
          searchTerm === "" ||
          command.command.toLowerCase().includes(searchTerm.toLowerCase())
        );
      })
    : [];

  // Get server name by ID
  const getServerName = (serverId: number) => {
    if (!servers) return "Unknown Server";
    const server = servers.find((s) => s.id === serverId);
    return server ? server.name : "Unknown Server";
  };

  // Format the timestamp
  const formatTimestamp = (timestamp: string) => {
    return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
  };

  return (
    <div>
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Commands</h1>
          <p className="mt-1 text-sm text-gray-500">
            View and manage executed commands
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
          <Search className="h-4 w-4 text-gray-400" />
        </div>
        <Input
          className="pl-10"
          placeholder="Search commands..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Commands List */}
      {commandsLoading ? (
        <div className="flex items-center justify-center h-64">
          <Clock className="h-6 w-6 text-gray-400 animate-spin" />
        </div>
      ) : filteredCommands.length > 0 ? (
        <div className="space-y-4">
          {filteredCommands.map((command) => (
            <Card key={command.id} className="hover:bg-gray-50 transition-colors">
              <CardHeader className="p-4 pb-2">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <CardTitle className="text-base font-medium text-gray-900 font-mono">
                      {command.command}
                    </CardTitle>
                    <CardDescription className="flex items-center gap-2 text-sm mt-1">
                      <ServerIcon className="h-3.5 w-3.5" />
                      {getServerName(command.serverId)}
                      <span>•</span>
                      <User className="h-3.5 w-3.5" />
                      {command.username || "Unknown user"}
                      <span>•</span>
                      <Clock className="h-3.5 w-3.5" />
                      {formatTimestamp(command.timestamp)}
                    </CardDescription>
                  </div>
                  <Badge
                    variant={command.exitCode === 0 ? "default" : "destructive"}
                  >
                    Exit: {command.exitCode}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-2">
                <div className="bg-gray-50 border rounded p-2 max-h-32 overflow-y-auto font-mono text-xs">
                  {command.output || <span className="text-gray-400">No output</span>}
                </div>
                <div className="flex justify-end mt-2">
                  <Link href={`/terminal/${command.serverId}`}>
                    <Button variant="outline" size="sm" className="gap-1">
                      <Terminal className="h-3.5 w-3.5" />
                      Open Terminal
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center p-12 bg-white rounded-lg shadow">
          <h3 className="text-lg font-medium text-gray-900 mb-2">No commands found</h3>
          <p className="text-gray-500 mb-6">
            {searchTerm
              ? "No commands match your search criteria. Try adjusting your search."
              : "You haven't executed any commands yet. Go to the terminal to start."}
          </p>
          {servers && servers.length > 0 && (
            <Link href={`/terminal/${servers[0].id}`}>
              <Button>
                <Terminal className="h-4 w-4 mr-2" />
                Open Terminal
              </Button>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}