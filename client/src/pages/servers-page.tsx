import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { AddServerDialog } from "@/components/add-server-dialog";
import { ServerCard } from "@/components/ui/server-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link, useLocation } from "wouter";
import { getServers, deleteServer } from "@/lib/ssh";
import { Server } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Filter, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function ServersPage() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [deleteServerTarget, setDeleteServerTarget] = useState<Server | null>(null);
  const [location, setLocation] = useLocation();
  const [showFilterMenu, setShowFilterMenu] = useState(false);

  // Parse tag from URL query parameters
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tagParam = urlParams.get('tag');
    if (tagParam) {
      setSelectedTag(tagParam);
    }
  }, [location]);

  const {
    data: servers,
    isLoading,
    refetch: refetchServers,
  } = useQuery<Server[]>({
    queryKey: ["/api/servers"],
  });

  const handleDeleteServer = async () => {
    if (!deleteServerTarget) return;
    
    try {
      await deleteServer(deleteServerTarget.id);
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

  // Filter servers based on search term and selected tag
  const filteredServers = servers
    ? servers.filter((server) => {
        const matchesSearch =
          searchTerm === "" ||
          server.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          server.ipAddress.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (server.os && server.os.toLowerCase().includes(searchTerm.toLowerCase()));
        
        const matchesTag =
          selectedTag === null ||
          (server.tags && server.tags.includes(selectedTag));
        
        return matchesSearch && matchesTag;
      })
    : [];

  // Get unique tags from all servers
  const allTags = servers
    ? Array.from(
        new Set(
          servers.flatMap((server) => (server.tags ? server.tags : []))
        )
      )
    : [];

  const handleTagClick = (tag: string) => {
    if (selectedTag === tag) {
      setSelectedTag(null);
    } else {
      setSelectedTag(tag);
    }
  };

  return (
    <div>
      {/* Page Header */}
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Servers</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage and monitor your Linux servers
          </p>
        </div>
        <AddServerDialog />
      </div>

      {/* Enhanced Search Filters */}
      <div className="mb-6 flex flex-col md:flex-row gap-4">
        <div className="relative flex-grow">
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
            <Search className="h-4 w-4 text-gray-400" />
          </div>
          <Input
            className="pl-10"
            placeholder="Filter by name, IP address, or Linux distro..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <div 
              className="absolute inset-y-0 right-0 flex items-center pr-3 cursor-pointer"
              onClick={() => setSearchTerm("")}
            >
              <X className="h-4 w-4 text-gray-400 hover:text-gray-600" />
            </div>
          )}
        </div>
        
        {selectedTag && (
          <div className="flex-shrink-0 flex items-center">
            <Badge variant="secondary" className="gap-1">
              {selectedTag}
              <X 
                className="h-3 w-3 cursor-pointer" 
                onClick={() => {
                  setSelectedTag(null);
                  setLocation('/servers');
                }}  
              />
            </Badge>
          </div>
        )}
      </div>

      {/* Tags */}
      {allTags.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {allTags.map((tag) => (
            <Badge
              key={tag}
              variant={selectedTag === tag ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => handleTagClick(tag)}
            >
              {tag}
            </Badge>
          ))}
        </div>
      )}

      {/* Servers Grid */}
      {isLoading ? (
        <div className="text-center p-12">Loading servers...</div>
      ) : filteredServers.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredServers.map((server) => (
            <ServerCard
              key={server.id}
              server={server}
              onDelete={setDeleteServerTarget}
            />
          ))}
        </div>
      ) : (
        <div className="text-center p-12 bg-white rounded-lg shadow">
          <h3 className="text-lg font-medium text-gray-900 mb-2">No servers found</h3>
          <p className="text-gray-500 mb-6">
            {searchTerm || selectedTag
              ? "No servers match your search criteria. Try adjusting your filters."
              : "You haven't added any servers yet. Add your first server to get started."}
          </p>
          <AddServerDialog />
        </div>
      )}

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
