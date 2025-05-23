import { AuthForm } from "@/components/auth-form";
import { useAuth } from "@/hooks/use-auth";
import { useEffect } from "react";
import { Redirect } from "wouter";
import { Terminal, Shield, Server, FileCode, RefreshCw } from "lucide-react";

export default function AuthPage() {
  let user = null;
  let isLoading = false;
  
  try {
    const auth = useAuth();
    user = auth.user;
    isLoading = auth.isLoading;
    
    // Redirect if already logged in
    if (user) {
      return <Redirect to="/" />;
    }
  } catch (error) {
    console.error("Auth page error:", error);
    // Continue rendering the auth page if there's an error
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Auth Form */}
      <div className="flex-1 flex flex-col justify-center items-center px-4 sm:px-6 lg:px-8 py-12">
        <AuthForm />
      </div>

      {/* Hero Section */}
      <div className="hidden lg:flex relative flex-1 bg-gradient-to-r from-primary-900 to-primary-700">
        <div className="flex flex-col justify-center h-full px-12 text-white w-full max-w-2xl">
          <div>
            <h1 className="text-4xl font-bold mb-4">
              Welcome to LinuxControlHub
            </h1>
            <p className="text-lg text-gray-100 mb-8">
              A powerful platform for managing and automating your Linux servers with SSH and Ansible.
            </p>

            <div className="space-y-6">
              <div className="flex items-start">
                <div className="flex-shrink-0 mt-1">
                  <Terminal className="h-6 w-6 text-primary-200" />
                </div>
                <div className="ml-3">
                  <h3 className="text-lg font-medium">Web-based Terminal</h3>
                  <p className="mt-1 text-gray-200">
                    Execute commands directly in your browser with real-time output.
                  </p>
                </div>
              </div>

              <div className="flex items-start">
                <div className="flex-shrink-0 mt-1">
                  <FileCode className="h-6 w-6 text-primary-200" />
                </div>
                <div className="ml-3">
                  <h3 className="text-lg font-medium">Ansible Playbooks</h3>
                  <p className="mt-1 text-gray-200">
                    Create, manage, and execute Ansible playbooks across your servers.
                  </p>
                </div>
              </div>

              <div className="flex items-start">
                <div className="flex-shrink-0 mt-1">
                  <Server className="h-6 w-6 text-primary-200" />
                </div>
                <div className="ml-3">
                  <h3 className="text-lg font-medium">Server Monitoring</h3>
                  <p className="mt-1 text-gray-200">
                    Track CPU, memory, disk usage, and uptime of all your servers.
                  </p>
                </div>
              </div>

              <div className="flex items-start">
                <div className="flex-shrink-0 mt-1">
                  <RefreshCw className="h-6 w-6 text-primary-200" />
                </div>
                <div className="ml-3">
                  <h3 className="text-lg font-medium">Automated Tasks</h3>
                  <p className="mt-1 text-gray-200">
                    Schedule and automate routine server maintenance operations.
                  </p>
                </div>
              </div>

              <div className="flex items-start">
                <div className="flex-shrink-0 mt-1">
                  <Shield className="h-6 w-6 text-primary-200" />
                </div>
                <div className="ml-3">
                  <h3 className="text-lg font-medium">Secure Access</h3>
                  <p className="mt-1 text-gray-200">
                    Role-based permissions and encrypted credential storage.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
