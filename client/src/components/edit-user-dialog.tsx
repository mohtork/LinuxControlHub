import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { User } from "@shared/schema";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useMutation } from "@tanstack/react-query";

interface EditUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User | null;
}

export function EditUserDialog({ open, onOpenChange, user }: EditUserDialogProps) {
  const { toast } = useToast();
  
  const [email, setEmail] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  
  // Update user data when the dialog opens with a new user
  useEffect(() => {
    if (user) {
      setEmail(user.email || "");
    }
  }, [user]);
  
  // Update user mutation
  const updateUserMutation = useMutation({
    mutationFn: async ({ userId, userData }: { userId: number; userData: Partial<User> }) => {
      const res = await apiRequest("PUT", `/api/users/${userId}`, userData);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "User updated",
        description: "The user has been updated successfully",
      });
      
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      onOpenChange(false);
      setIsLoading(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error updating user",
        description: error.message,
        variant: "destructive",
      });
      setIsLoading(false);
    },
  });
  
  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) return;
    
    setIsLoading(true);
    
    const userData: Partial<User> = {};
    
    // Only include fields that have changed
    if (email !== user.email) {
      userData.email = email;
    }
    
    // Don't submit if nothing has changed
    if (Object.keys(userData).length === 0) {
      toast({
        title: "No changes made",
        description: "You didn't make any changes to the user",
      });
      onOpenChange(false);
      setIsLoading(false);
      return;
    }
    
    updateUserMutation.mutate({ userId: user.id, userData });
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit User</DialogTitle>
          <DialogDescription>
            {user ? (
              <>Update information for user: <strong>{user.username}</strong></>
            ) : (
              "Update user information"
            )}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="username" className="text-right">
                Username
              </Label>
              <Input
                id="username"
                value={user?.username || ""}
                className="col-span-3"
                disabled
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="email" className="text-right">
                Email
              </Label>
              <Input
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="col-span-3"
                placeholder="user@example.com"
                disabled={isLoading || !user || user.username === "admin"}
              />
            </div>
            
            {/* Future enhancement for 2FA */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">
                Two-Factor
              </Label>
              <div className="col-span-3">
                <div className="text-sm text-gray-500">
                  Two-factor authentication coming soon
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button 
              type="submit"
              disabled={
                isLoading || 
                !user || 
                user.username === "admin" ||
                email === user?.email
              }
            >
              {isLoading ? (
                <>
                  <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent"></div>
                  Saving...
                </>
              ) : (
                "Save changes"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}