import { useQuery } from "@tanstack/react-query";
import { useRef, useEffect, useState } from "react";
import { getServer } from "@/lib/ssh";
import { useSSHTerminal } from "@/hooks/use-ssh-terminal";
import { Server } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Link, useLocation } from "wouter";
import { 
  ChevronLeft, 
  Maximize2, 
  Minimize2, 
  Copy, 
  Send, 
  X,
  AlertTriangle, 
  Loader2 
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface TerminalPageProps {
  serverId: number;
}

export default function TerminalPage({ serverId }: TerminalPageProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const terminalRef = useRef<HTMLDivElement>(null);
  const [command, setCommand] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  
  const { data: server, isLoading: isServerLoading } = useQuery<Server>({
    queryKey: [`/api/servers/${serverId}`],
  });
  
  const { isConnected, isLoading, error, sendCommand, resize } = useSSHTerminal({
    serverId,
    terminalRef,
  });
  
  const handleSendCommand = () => {
    if (command.trim()) {
      sendCommand(command);
      
      // Add to command history
      setCommandHistory(prev => [...prev, command]);
      setHistoryIndex(-1);
      
      setCommand("");
    }
  };
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleKeyDown;
      handleSendCommand();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (commandHistory.length > 0) {
        const newIndex = historyIndex < commandHistory.length - 1 ? historyIndex + 1 : historyIndex;
        setHistoryIndex(newIndex);
        setCommand(commandHistory[commandHistory.length - 1 - newIndex] || "");
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setCommand(commandHistory[commandHistory.length - 1 - newIndex] || "");
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setCommand("");
      }
    }
  };
  
  const toggleFullscreen = () => {
    setFullscreen(!fullscreen);
    // Give the DOM time to update before resizing the terminal
    setTimeout(() => {
      resize();
    }, 0);
  };
  
  const copyToClipboard = () => {
    if (document.getSelection) {
      const selection = document.getSelection();
      if (selection && selection.toString()) {
        navigator.clipboard.writeText(selection.toString());
        toast({
          title: "Copied to clipboard",
          description: "Terminal selection has been copied to clipboard.",
        });
      } else {
        toast({
          description: "No text selected",
        });
      }
    }
  };
  
  // Effect to resize terminal on window resize
  useEffect(() => {
    const handleResize = () => {
      resize();
    };
    
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [resize]);
  
  // Resize when fullscreen changes
  useEffect(() => {
    resize();
  }, [fullscreen, resize]);
  
  if (isServerLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
      </div>
    );
  }
  
  if (!server) {
    return (
      <div className="text-center p-12">
        <AlertTriangle className="h-16 w-16 text-yellow-500 mx-auto mb-4" />
        <h2 className="text-xl font-semibold mb-2">Server not found</h2>
        <p className="text-gray-500 mb-6">The server you are trying to connect to doesn't exist or has been deleted.</p>
        <Button onClick={() => setLocation("/servers")}>
          <ChevronLeft className="mr-2 h-4 w-4" />
          Back to Servers
        </Button>
      </div>
    );
  }
  
  return (
    <div className={`${fullscreen ? 'fixed inset-0 z-50 bg-gray-100 p-4' : ''}`}>
      <Card className={`${fullscreen ? 'h-full' : ''}`}>
        <CardHeader className="pb-2 flex flex-row items-center justify-between bg-gray-50 border-b">
          <div className="flex items-center">
            {!fullscreen && (
              <Button variant="ghost" size="sm" asChild className="mr-2">
                <Link href={`/servers/${serverId}`}>
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Back
                </Link>
              </Button>
            )}
            <CardTitle className="text-lg">
              Terminal: {server.name} ({server.ipAddress})
            </CardTitle>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={copyToClipboard}>
              <Copy className="h-4 w-4" />
              <span className="sr-only">Copy</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={toggleFullscreen}>
              {fullscreen ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
              <span className="sr-only">
                {fullscreen ? "Exit Fullscreen" : "Fullscreen"}
              </span>
            </Button>
            {fullscreen && (
              <Button variant="ghost" size="sm" onClick={() => setFullscreen(false)}>
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </Button>
            )}
          </div>
        </CardHeader>
        
        <CardContent className={`p-0 ${fullscreen ? 'flex flex-col h-[calc(100%-56px)]' : ''}`}>
          <div 
            ref={terminalRef} 
            className={`terminal rounded-none font-mono text-sm bg-gray-900 text-gray-100 ${
              fullscreen ? 'flex-grow overflow-auto' : 'h-[500px]'
            }`}
          />
          
          <div className="p-2 bg-gray-50 border-t flex items-center">
            <Input
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter command..."
              disabled={!isConnected || isLoading}
              className="font-mono"
            />
            <Button 
              onClick={handleSendCommand} 
              className="ml-2"
              disabled={!isConnected || isLoading}
            >
              <Send className="h-4 w-4 mr-1" />
              Send
            </Button>
          </div>
          
          {error && (
            <div className="p-2 text-red-600 text-sm bg-red-50 border-t">
              <AlertTriangle className="h-4 w-4 inline-block mr-1" />
              {error}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
