import { useState } from "react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertCircle, CheckCircle, Plus } from "lucide-react";
import { createServer, testConnection } from "@/lib/ssh";
import { useToast } from "@/hooks/use-toast";

const serverFormSchema = z.object({
  name: z.string().min(2, {
    message: "Server name must be at least 2 characters.",
  }),
  hostname: z.string().min(1, { message: "Hostname is required." }),
  ipAddress: z.string().ip({ message: "Please enter a valid IP address." }),
  port: z.coerce
    .number()
    .int()
    .min(1)
    .max(65535)
    .default(22),
  username: z.string().min(1, { message: "Username is required." }),
  authType: z.enum(["password", "key"]),
  authData: z.string().min(1, { message: "Authentication data is required." }),
  tags: z.string().optional(),
  os: z.string().optional(),
});

type ServerFormValues = z.infer<typeof serverFormSchema>;

export function AddServerDialog() {
  const [open, setOpen] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const { toast } = useToast();

  const form = useForm<ServerFormValues>({
    resolver: zodResolver(serverFormSchema),
    defaultValues: {
      name: "",
      hostname: "",
      ipAddress: "",
      port: 22,
      username: "",
      authType: "password",
      authData: "",
      tags: "",
      os: "",
    },
  });

  const authType = form.watch("authType");

  const onSubmit = async (data: ServerFormValues) => {
    try {
      // Process tags if provided
      const tags = data.tags
        ? data.tags.split(",").map((tag) => tag.trim())
        : undefined;

      // Create server object
      await createServer({
        ...data,
        tags,
      });

      toast({
        title: "Server added successfully",
        description: `${data.name} has been added to your servers.`,
      });

      // Reset form and close dialog
      form.reset();
      setTestResult(null);
      setOpen(false);
    } catch (error: any) {
      toast({
        title: "Failed to add server",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleTestConnection = async () => {
    try {
      // Validate form before testing
      await form.trigger(["hostname", "port", "username", "authType", "authData"]);

      if (
        form.formState.errors.hostname ||
        form.formState.errors.port ||
        form.formState.errors.username ||
        form.formState.errors.authType ||
        form.formState.errors.authData
      ) {
        return;
      }

      setTestingConnection(true);
      setTestResult(null);

      const { hostname, port, username, authType, authData } = form.getValues();

      const testData: any = {
        hostname,
        port,
        username,
        authType,
      };

      // Set auth data based on type
      if (authType === "password") {
        testData.password = authData;
      } else {
        testData.privateKey = authData;
      }

      const result = await testConnection(testData);
      setTestResult(result);
    } catch (error: any) {
      setTestResult({
        success: false,
        message: error.message,
      });
    } finally {
      setTestingConnection(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" /> Add Server
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>Add New Server</DialogTitle>
          <DialogDescription>
            Enter your server details to add it to LinuxControlHub.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Server Name</FormLabel>
                    <FormControl>
                      <Input placeholder="web-server-01" {...field} />
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
                    <FormLabel>Hostname / IP</FormLabel>
                    <FormControl>
                      <Input placeholder="192.168.1.100" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="ipAddress"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>IP Address</FormLabel>
                    <FormControl>
                      <Input placeholder="192.168.1.100" {...field} />
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
                      <Input type="number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

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

            <FormField
              control={form.control}
              name="authData"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {authType === "password" ? "Password" : "Private Key"}
                  </FormLabel>
                  <FormControl>
                    {authType === "password" ? (
                      <Input
                        type="password"
                        placeholder="Enter server password"
                        {...field}
                      />
                    ) : (
                      <Textarea
                        placeholder="Paste your private key here"
                        className="min-h-[100px] font-mono text-sm"
                        {...field}
                      />
                    )}
                  </FormControl>
                  <FormDescription>
                    {authType === "key" &&
                      "Private key will be encrypted before storage."}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="tags"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tags (Optional)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="production, web, nginx"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Comma-separated list of tags for grouping servers.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {testResult && (
              <Alert
                variant={testResult.success ? "default" : "destructive"}
                className={
                  testResult.success ? "bg-green-50 text-green-800" : ""
                }
              >
                {testResult.success ? (
                  <CheckCircle className="h-4 w-4" />
                ) : (
                  <AlertCircle className="h-4 w-4" />
                )}
                <AlertDescription>{testResult.message}</AlertDescription>
              </Alert>
            )}

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={handleTestConnection}
                disabled={testingConnection}
              >
                {testingConnection ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Testing...
                  </>
                ) : (
                  "Test Connection"
                )}
              </Button>
              <Button type="submit" disabled={testingConnection}>
                Add Server
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
