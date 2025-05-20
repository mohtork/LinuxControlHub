import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { Redirect } from "wouter";
import { ReactNode } from "react";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  // We need to handle errors gracefully here
  try {
    const { user, isLoading } = useAuth();

    if (isLoading) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-border" />
        </div>
      );
    }

    if (!user) {
      return <Redirect to="/auth" />;
    }

    return <>{children}</>;
  } catch (error) {
    console.error("Protected route error:", error);
    // If we have an auth error, redirect to auth page
    return <Redirect to="/auth" />;
  }
}
