import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertServerSchema, Server } from "@shared/schema";
import { z } from "zod";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { updateServer, testConnection } from "@/lib/ssh";
import { useToast } from "@/hooks/use-toast";
import { Edit } from "lucide-react";

// Create a smaller schema for editing, excluding sensitive info by default
const editServerSchema = insertServerSchema.partial().extend({
  id: z.number(),
  name: z.string().min(1, { message: "Server name is required." }),
  hostname: z.string().min(1, { message: "Hostname is required." }),
  ipAddress: z.string().min(1, { message: "IP address is required." }),
  username: z.string().min(1, { message: "Username is required." }),
});

type EditServerFormValues = z.infer<typeof editServerSchema>;

interface EditServerDialogProps {
  server: Server;
  onServerUpdated?: () => void;
  triggerElement?: React.ReactNode;
}

export function EditServerDialog({ server, onServerUpdated, triggerElement }: EditServerDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [updatePassword, setUpdatePassword] = useState(false);
  const [updateKey, setUpdateKey] = useState(false);
  const { toast } = useToast();

  const form = useForm<EditServerFormValues>({
    resolver: zodResolver(editServerSchema),
    defaultValues: {
      id: server.id,
      name: server.name,
      hostname: server.hostname,
      ipAddress: server.ipAddress,
      port: server.port || 22,
      username: server.username,
      authType: server.authType,
      tags: server.tags || [],
    },
  });

  const onSubmit = async (data: EditServerFormValues) => {
    setIsLoading(true);
    
    try {
      // Only include authData if the user is updating it
      const updateData: any = { ...data };
      
      // Remove unnecessary fields
      delete updateData.id;
      
      // Only include authData if updating
      if (!updatePassword && !updateKey) {
        delete updateData.authData;
      }
      
      await updateServer(server.id, updateData);
      
      setIsOpen(false);
      
      toast({
        title: "Server updated",
        description: `${data.name} has been updated successfully.`,
      });
      
      if (onServerUpdated) {
        onServerUpdated();
      }
    } catch (error: any) {
      toast({
        title: "Error updating server",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleTestConnection = async () => {
    const values = form.getValues();
    setIsLoading(true);
    
    try {
      // Prepare test data
      const testData: any = {
        hostname: values.hostname,
        port: values.port,
        username: values.username,
        authType: values.authType,
      };
      
      // Add auth data based on type
      if (values.authType === "password") {
        if (updatePassword) {
          testData.password = values.authData;
        } else {
          toast({
            title: "Cannot test connection",
            description: "Password is needed for testing. Please check 'Update password' to provide a new one.",
            variant: "destructive",
          });
          return;
        }
      } else if (values.authType === "key") {
        if (updateKey) {
          testData.privateKey = values.authData;
        } else {
          toast({
            title: "Cannot test connection",
            description: "Private key is needed for testing. Please check 'Update private key' to provide a new one.",
            variant: "destructive",
          });
          return;
        }
      }
      
      const result = await testConnection(testData);
      
      if (result.success) {
        toast({
          title: "Connection successful",
          description: "Successfully connected to the server."
        });
      } else {
        toast({
          title: "Connection failed",
          description: result.message,
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error testing connection",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {triggerElement ? (
        <DialogTrigger asChild>
          {triggerElement}
        </DialogTrigger>
      ) : (
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Edit className="mr-1 h-4 w-4" />
            Edit
          </Button>
        </DialogTrigger>
      )}
      
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Server</DialogTitle>
          <DialogDescription>
            Edit server information and connection details.
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Server Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Production Web Server" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="hostname"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hostname</FormLabel>
                    <FormControl>
                      <Input placeholder="example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="ipAddress"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>IP Address</FormLabel>
                    <FormControl>
                      <Input placeholder="192.168.1.1" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="port"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>SSH Port</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        placeholder="22" 
                        {...field}
                        onChange={e => field.onChange(parseInt(e.target.value) || 22)} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Username</FormLabel>
                    <FormControl>
                      <Input placeholder="root" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="authType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Authentication Type</FormLabel>
                    <Select 
                      onValueChange={field.onChange} 
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select authentication type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="password">Password</SelectItem>
                        <SelectItem value="key">SSH Key</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            {form.watch("authType") === "password" && (
              <div>
                <div className="flex items-center mb-2">
                  <input 
                    type="checkbox" 
                    id="update-password"
                    checked={updatePassword}
                    onChange={(e) => setUpdatePassword(e.target.checked)}
                    className="mr-2" 
                  />
                  <label htmlFor="update-password" className="text-sm">Update password</label>
                </div>
                
                {updatePassword && (
                  <FormField
                    control={form.control}
                    name="authData"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                          <Input type="password" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>
            )}
            
            {form.watch("authType") === "key" && (
              <div>
                <div className="flex items-center mb-2">
                  <input 
                    type="checkbox" 
                    id="update-key"
                    checked={updateKey}
                    onChange={(e) => setUpdateKey(e.target.checked)}
                    className="mr-2" 
                  />
                  <label htmlFor="update-key" className="text-sm">Update private key</label>
                </div>
                
                {updateKey && (
                  <FormField
                    control={form.control}
                    name="authData"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Private Key</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="-----BEGIN RSA PRIVATE KEY-----" 
                            className="font-mono text-xs h-32"
                            {...field} 
                          />
                        </FormControl>
                        <FormDescription>
                          Paste your private SSH key here including the BEGIN and END lines
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>
            )}
            
            <DialogFooter className="flex flex-col sm:flex-row gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleTestConnection}
                disabled={isLoading}
              >
                Test Connection
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? "Updating..." : "Update Server"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}