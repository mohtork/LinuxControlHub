import { useState } from "react";
import { Server, Playbook } from "@shared/schema";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { createTask } from "@/lib/ansible";
import { Loader2 } from "lucide-react";

interface RunPlaybookDialogProps {
  playbook: Playbook | null;
  isOpen: boolean;
  onClose: () => void;
}

export function RunPlaybookDialog({ playbook, isOpen, onClose }: RunPlaybookDialogProps) {
  const { toast } = useToast();
  const [selectedServers, setSelectedServers] = useState<number[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch available servers
  const { data: servers, isLoading } = useQuery<Server[]>({
    queryKey: ["/api/servers"],
  });

  // Toggle server selection
  const toggleServer = (serverId: number) => {
    setSelectedServers(prev => 
      prev.includes(serverId)
        ? prev.filter(id => id !== serverId)
        : [...prev, serverId]
    );
  };

  // Select all servers
  const selectAllServers = () => {
    if (servers) {
      const allServerIds = servers.map(server => server.id);
      setSelectedServers(allServerIds);
    }
  };

  // Deselect all servers
  const deselectAllServers = () => {
    setSelectedServers([]);
  };

  // Run playbook on selected servers
  const handleRunPlaybook = async () => {
    if (!playbook) return;
    
    if (selectedServers.length === 0) {
      toast({
        title: "No servers selected",
        description: "Please select at least one server to run the playbook on.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsSubmitting(true);
      
      // Create task with selected servers
      await createTask({
        name: `Run: ${playbook.name}`,
        type: "playbook",
        config: { playbookId: playbook.id },
        playbookId: playbook.id,
        serverIds: selectedServers
      });
      
      toast({
        title: "Playbook queued",
        description: `${playbook.name} has been queued for execution on ${selectedServers.length} server(s).`,
      });
      
      onClose();
    } catch (error: any) {
      toast({
        title: "Error",
        description: `Failed to run playbook: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Run Playbook</DialogTitle>
          <DialogDescription>
            Select the servers you want to run this playbook on.
          </DialogDescription>
        </DialogHeader>
        
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-primary-500" />
          </div>
        ) : servers && servers.length > 0 ? (
          <div className="py-4">
            <div className="flex justify-between mb-2">
              <Button 
                type="button" 
                variant="outline" 
                size="sm"
                onClick={selectAllServers}
              >
                Select All
              </Button>
              <Button 
                type="button" 
                variant="outline" 
                size="sm"
                onClick={deselectAllServers}
              >
                Deselect All
              </Button>
            </div>
            
            <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
              {servers.map((server) => (
                <div key={server.id} className="flex items-center space-x-2">
                  <Checkbox 
                    id={`server-${server.id}`} 
                    checked={selectedServers.includes(server.id)}
                    onCheckedChange={() => toggleServer(server.id)}
                  />
                  <Label 
                    htmlFor={`server-${server.id}`}
                    className="flex-1 cursor-pointer"
                  >
                    <div className="font-medium">{server.name}</div>
                    <div className="text-xs text-gray-500">{server.hostname}</div>
                  </Label>
                  <div className={`w-2 h-2 rounded-full ${
                    server.status === 'online' ? 'bg-green-500' : 
                    server.status === 'offline' ? 'bg-red-500' : 'bg-yellow-500'
                  }`} />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="py-6 text-center text-gray-500">
            No servers available. Please add a server first.
          </div>
        )}
        
        <DialogFooter>
          <Button 
            type="button" 
            variant="outline" 
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleRunPlaybook}
            disabled={isSubmitting || selectedServers.length === 0}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Running...
              </>
            ) : (
              'Run Playbook'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}