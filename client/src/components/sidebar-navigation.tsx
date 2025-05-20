import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/use-auth";
import { 
  Settings,
  LogOut,
  LayoutDashboard,
  Server,
  FileCode,
  Clock,
  History,
  Users,
  Shield
} from "lucide-react";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function SidebarNavigation() {
  const [location] = useLocation();
  
  // Default values in case auth context isn't available
  const defaultAuth = {
    user: { username: "User", role: "viewer" as const },
    logoutMutation: { 
      mutate: () => console.error("Logout mutation not available"),
      isPending: false
    }
  };
  
  // Try to get auth context, use defaults if not available
  let auth;
  try {
    auth = useAuth();
  } catch (error) {
    console.error("SidebarNavigation auth error:", error);
    auth = defaultAuth;
  }
  
  const { user, logoutMutation } = auth;

  // Get user initials for avatar
  const getUserInitials = () => {
    if (!user || !user.username) return "U";
    return user.username.substring(0, 2).toUpperCase();
  };

  // Get capitalized role
  const getUserRole = () => {
    if (!user || !user.role) return "";
    return user.role.charAt(0).toUpperCase() + user.role.slice(1);
  };

  const isActive = (path: string) => {
    return location === path;
  };

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  return (
    <div className="flex flex-col w-64 bg-gray-950 border-r border-gray-900 h-full">
      {/* Logo */}
      <div className="px-6 pt-6 pb-4">
        <div className="flex items-center">
          <i className="ri-terminal-box-fill text-primary-500 text-2xl mr-2"></i>
          <span className="text-white text-xl font-semibold">LinuxControlHub</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        <Link href="/">
          <Button
            variant="ghost"
            className={`w-full justify-start ${
              isActive("/")
                ? "bg-primary-700 text-white"
                : "text-gray-300 hover:bg-primary-600/70 hover:text-white font-medium"
            }`}
          >
            <LayoutDashboard className="mr-3 h-5 w-5" />
            Dashboard
          </Button>
        </Link>
        
        <Link href="/servers">
          <Button
            variant="ghost"
            className={`w-full justify-start ${
              isActive("/servers") || location.startsWith("/servers/")
                ? "bg-primary-700 text-white"
                : "text-gray-300 hover:bg-primary-600/70 hover:text-white font-medium"
            }`}
          >
            <Server className="mr-3 h-5 w-5" />
            Servers
          </Button>
        </Link>
        
        <Link href="/playbooks">
          <Button
            variant="ghost"
            className={`w-full justify-start ${
              isActive("/playbooks")
                ? "bg-primary-700 text-white"
                : "text-gray-300 hover:bg-primary-600/70 hover:text-white font-medium"
            }`}
          >
            <FileCode className="mr-3 h-5 w-5" />
            Playbooks
          </Button>
        </Link>
        
        <Link href="/tasks">
          <Button
            variant="ghost"
            className={`w-full justify-start ${
              isActive("/tasks")
                ? "bg-primary-700 text-white"
                : "text-gray-300 hover:bg-primary-600/70 hover:text-white font-medium"
            }`}
          >
            <Clock className="mr-3 h-5 w-5" />
            Tasks
          </Button>
        </Link>
        
        <Link href="/logs">
          <Button
            variant="ghost"
            className={`w-full justify-start ${
              isActive("/logs")
                ? "bg-primary-700 text-white"
                : "text-gray-300 hover:bg-primary-600/70 hover:text-white font-medium"
            }`}
          >
            <History className="mr-3 h-5 w-5" />
            Logs
          </Button>
        </Link>

        <Link href="/security">
          <Button
            variant="ghost"
            className={`w-full justify-start ${
              isActive("/security")
                ? "bg-primary-700 text-white"
                : "text-gray-300 hover:bg-primary-600/70 hover:text-white font-medium"
            }`}
          >
            <Shield className="mr-3 h-5 w-5" />
            Security
          </Button>
        </Link>
        
        {/* Only show Users link for admins */}
        {user?.role === "admin" && (
          <Link href="/users">
            <Button
              variant="ghost"
              className={`w-full justify-start ${
                isActive("/users")
                  ? "bg-primary-700 text-white"
                  : "text-gray-300 hover:bg-primary-600/70 hover:text-white font-medium"
              }`}
            >
              <Users className="mr-3 h-5 w-5" />
              Users
            </Button>
          </Link>
        )}
      </nav>

      {/* User Profile */}
      <div className="flex items-center px-4 py-3 border-t border-gray-700">
        <Avatar className="h-8 w-8 bg-primary-700 text-white">
          <AvatarFallback>{getUserInitials()}</AvatarFallback>
        </Avatar>
        <div className="ml-3">
          <p className="text-sm font-medium text-white">{user?.username || "User"}</p>
          <p className="text-xs text-gray-400">{getUserRole()}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto text-gray-400 hover:text-white"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              <span>Logout</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
