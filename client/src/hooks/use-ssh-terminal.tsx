import { useState, useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { WebglAddon } from 'xterm-addon-webgl';
import 'xterm/css/xterm.css';

interface UseSSHTerminalProps {
  serverId: number;
  terminalRef: React.RefObject<HTMLDivElement>;
}

interface UseSSHTerminalReturn {
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  sendCommand: (command: string) => void;
  resize: () => void;
}

export function useSSHTerminal({ serverId, terminalRef }: UseSSHTerminalProps): UseSSHTerminalReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const socketRef = useRef<WebSocket | null>(null);
  const terminalInstanceRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  
  // Initialize and setup terminal
  useEffect(() => {
    let terminal: Terminal | null = null;
    let fitAddon: FitAddon | null = null;
    let socket: WebSocket | null = null;
    
    const initializeTerminal = () => {
      if (!terminalRef.current) return;
      
      // Clear any previous terminal instance
      if (terminalInstanceRef.current) {
        try {
          terminalInstanceRef.current.dispose();
        } catch (err) {
          console.warn('Error disposing previous terminal:', err);
        }
        terminalInstanceRef.current = null;
      }
      
      // Close any existing socket
      if (socketRef.current) {
        try {
          socketRef.current.close();
        } catch (err) {
          console.warn('Error closing previous socket:', err);
        }
        socketRef.current = null;
      }
      
      // Create new terminal instance with try/catch
      try {
        terminal = new Terminal({
          fontFamily: 'Fira Code, Menlo, monospace',
          fontSize: 14,
          cursorBlink: true,
          theme: {
            background: '#1e1e1e',
            foreground: '#f8f8f8',
            cursor: '#f8f8f8',
            black: '#000000',
            red: '#e06c75',
            green: '#98c379',
            yellow: '#e5c07b',
            blue: '#61afef',
            magenta: '#c678dd',
            cyan: '#56b6c2',
            white: '#dcdfe4',
            brightBlack: '#5c6370',
            brightRed: '#e06c75',
            brightGreen: '#98c379',
            brightYellow: '#e5c07b',
            brightBlue: '#61afef',
            brightMagenta: '#c678dd',
            brightCyan: '#56b6c2',
            brightWhite: '#ffffff'
          }
        });
        
        // Create addons
        fitAddon = new FitAddon();
        const webLinksAddon = new WebLinksAddon();
        
        // Load addons
        terminal.loadAddon(fitAddon);
        terminal.loadAddon(webLinksAddon);
        
        // Open terminal in container
        terminal.open(terminalRef.current);
        
        // Try to load WebGL addon
        try {
          const webglAddon = new WebglAddon();
          terminal.loadAddon(webglAddon);
        } catch (e) {
          console.warn('WebGL addon could not be loaded', e);
        }
        
        // Fit terminal to container
        fitAddon.fit();
        
        // Store references
        terminalInstanceRef.current = terminal;
        fitAddonRef.current = fitAddon;
        
        // Connect to WebSocket terminal endpoint
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        socket = new WebSocket(`${protocol}//${window.location.host}/api/terminal/${serverId}`);
        
        // Set up handlers for user input
        terminal.onData((data) => {
          if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
              type: 'input',
              data: btoa(data) // Base64 encode the data
            }));
          }
        });
        
        socket.onopen = () => {
          setIsLoading(false);
          if (terminal) {
            terminal.writeln('\r\n\x1b[1;32mConnected to server. Terminal session starting...\x1b[0m\r\n');
          }
        };
        
        socket.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            
            if (message.type === 'session') {
              setIsConnected(true);
            } else if (message.type === 'output' && terminal) {
              const decoded = atob(message.data); // Base64 decode the data
              terminal.write(decoded);
            } else if (message.type === 'resize') {
              // Terminal size was changed by the server
            } else if (message.type === 'error' && terminal) {
              setError(message.message);
              terminal.writeln(`\r\n\x1b[1;31mError: ${message.message}\x1b[0m\r\n`);
            }
          } catch (err) {
            console.error('Failed to parse WebSocket message', err, event.data);
          }
        };
        
        socket.onerror = (e) => {
          setError('WebSocket connection error');
          setIsLoading(false);
          if (terminal) {
            terminal.writeln('\r\n\x1b[1;31mConnection error. Check server status and try again.\x1b[0m\r\n');
          }
        };
        
        socket.onclose = () => {
          setIsConnected(false);
          if (terminal) {
            terminal.writeln('\r\n\x1b[1;33mConnection closed.\x1b[0m\r\n');
          }
        };
        
        socketRef.current = socket;
      } catch (err) {
        console.error('Failed to initialize terminal:', err);
        setError('Failed to initialize terminal');
        setIsLoading(false);
      }
    };
    
    // Handle window resize
    const handleResize = () => {
      if (fitAddonRef.current && terminalInstanceRef.current) {
        try {
          fitAddonRef.current.fit();
          
          // Send terminal size to server
          if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
            socketRef.current.send(JSON.stringify({
              type: 'resize',
              cols: terminalInstanceRef.current.cols,
              rows: terminalInstanceRef.current.rows
            }));
          }
        } catch (err) {
          console.warn('Error during resize:', err);
        }
      }
    };
    
    // Initialize terminal
    initializeTerminal();
    
    // Set up window resize listener
    window.addEventListener('resize', handleResize);
    
    // Clean up function
    return () => {
      window.removeEventListener('resize', handleResize);
      
      // Close socket
      if (socketRef.current) {
        try {
          socketRef.current.close();
          socketRef.current = null;
        } catch (err) {
          console.warn('Error closing socket during cleanup:', err);
        }
      }
      
      // Dispose terminal
      if (terminalInstanceRef.current) {
        try {
          terminalInstanceRef.current.dispose();
          terminalInstanceRef.current = null;
        } catch (err) {
          console.warn('Error disposing terminal during cleanup:', err);
        }
      }
      
      // Reset state
      setIsConnected(false);
      setIsLoading(true);
      setError(null);
    };
  }, [serverId, terminalRef]);
  
  // Method to send a command to the terminal
  const sendCommand = (command: string) => {
    if (terminalInstanceRef.current && socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'input',
        data: btoa(command + '\r') // Base64 encode and add carriage return
      }));
    }
  };
  
  // Method to manually resize the terminal
  const resize = () => {
    if (fitAddonRef.current && terminalInstanceRef.current) {
      fitAddonRef.current.fit();
      
      // Send terminal size to server
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({
          type: 'resize',
          cols: terminalInstanceRef.current.cols,
          rows: terminalInstanceRef.current.rows
        }));
      }
    }
  };
  
  return { isConnected, isLoading, error, sendCommand, resize };
}
