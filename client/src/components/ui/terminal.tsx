import { useRef, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { useSSHTerminal } from "@/hooks/use-ssh-terminal";
import { Maximize2, ChevronRight } from "lucide-react";
import { Server } from "@shared/schema";

interface TerminalProps {
  server: Server;
  fullscreen?: boolean;
}

export function Terminal({ server, fullscreen = false }: TerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const [command, setCommand] = useState("");
  
  // Use the hook unconditionally as required by React Hook Rules
  const { isConnected, isLoading, error, sendCommand } = useSSHTerminal({
    serverId: server.id,
    terminalRef,
  });
  
  const handleSendCommand = () => {
    if (command.trim()) {
      sendCommand(command);
      setCommand("");
    }
  };
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSendCommand();
    }
  };
  
  return (
    <Card className={`overflow-hidden ${fullscreen ? 'h-full' : ''}`}>
      <CardHeader className="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <div className="flex justify-between items-center">
          <CardTitle className="text-lg font-medium text-gray-900">Terminal</CardTitle>
          <div className="flex space-x-2">
            <Select defaultValue={server.id.toString()}>
              <SelectTrigger className="w-[180px] h-8 text-sm">
                <SelectValue placeholder="Select server" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={server.id.toString()}>{server.name}</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="ghost" size="sm">
              <Maximize2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="p-4">
        <div 
          ref={terminalRef} 
          className="terminal rounded-md bg-gray-900 text-gray-100 font-mono text-sm h-64"
        />
        
        <div className="mt-3 flex">
          <Input
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter command..."
            className="text-sm"
          />
          <Button className="ml-2" onClick={handleSendCommand}>
            <ChevronRight className="h-4 w-4 mr-1" />
            Run
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
