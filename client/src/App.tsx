import { Switch, Route } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { AuthProvider } from "@/hooks/use-auth";
import NotFound from "@/pages/not-found";
import AuthPage from "@/pages/auth-page";
import DashboardPage from "@/pages/dashboard-page";
import ServersPage from "@/pages/servers-page";
import ServerDetailPage from "@/pages/server-detail-page";
import TerminalPage from "@/pages/terminal-page";
import PlaybooksPage from "@/pages/playbooks-page";
import TasksPage from "@/pages/tasks-page";
import LogsPage from "@/pages/logs-page";
import SecurityPage from "@/pages/security-page";

import UsersPage from "@/pages/users-page";
import { ProtectedRoute } from "@/lib/protected-route";
import MainLayout from "@/components/main-layout";

function Router() {
  return (
    <Switch>
      <Route path="/auth" component={AuthPage} />
      
      <Route path="/">
        <ProtectedRoute>
          <MainLayout>
            <DashboardPage />
          </MainLayout>
        </ProtectedRoute>
      </Route>
      
      <Route path="/servers">
        <ProtectedRoute>
          <MainLayout>
            <ServersPage />
          </MainLayout>
        </ProtectedRoute>
      </Route>
      
      <Route path="/servers/:id">
        {(params) => (
          <ProtectedRoute>
            <MainLayout>
              <ServerDetailPage serverId={parseInt(params.id)} />
            </MainLayout>
          </ProtectedRoute>
        )}
      </Route>
      
      <Route path="/terminal/:id">
        {(params) => (
          <ProtectedRoute>
            <MainLayout>
              <TerminalPage serverId={parseInt(params.id)} />
            </MainLayout>
          </ProtectedRoute>
        )}
      </Route>
      
      <Route path="/playbooks">
        <ProtectedRoute>
          <MainLayout>
            <PlaybooksPage />
          </MainLayout>
        </ProtectedRoute>
      </Route>
      
      <Route path="/tasks">
        <ProtectedRoute>
          <MainLayout>
            <TasksPage />
          </MainLayout>
        </ProtectedRoute>
      </Route>
      
      <Route path="/logs">
        <ProtectedRoute>
          <MainLayout>
            <LogsPage />
          </MainLayout>
        </ProtectedRoute>
      </Route>
      
      <Route path="/security">
        <ProtectedRoute>
          <MainLayout>
            <SecurityPage />
          </MainLayout>
        </ProtectedRoute>
      </Route>
      
      <Route path="/users">
        <ProtectedRoute>
          <MainLayout>
            <UsersPage />
          </MainLayout>
        </ProtectedRoute>
      </Route>
      
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router />
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
