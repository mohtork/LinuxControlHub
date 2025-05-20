import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { PlaybookItem } from "@/components/ui/playbook-item";
import { RunPlaybookDialog } from "@/components/ui/run-playbook-dialog";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Playbook } from "@shared/schema";
import { getPlaybooks, createPlaybook, updatePlaybook, deletePlaybook } from "@/lib/ansible";
import { useToast } from "@/hooks/use-toast";
import { Plus, FileCode, Search, AlertCircle } from "lucide-react";

const playBookFormSchema = z.object({
  name: z.string().min(2, "Playbook name must be at least 2 characters."),
  description: z.string().optional(),
  content: z.string().min(10, "Playbook content must be at least 10 characters."),
});

type PlaybookFormValues = z.infer<typeof playBookFormSchema>;

export default function PlaybooksPage() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isRunDialogOpen, setIsRunDialogOpen] = useState(false);
  const [selectedPlaybook, setSelectedPlaybook] = useState<Playbook | null>(null);
  const [editingPlaybook, setEditingPlaybook] = useState<Playbook | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Playbook | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const form = useForm<PlaybookFormValues>({
    resolver: zodResolver(playBookFormSchema),
    defaultValues: {
      name: "",
      description: "",
      content: "---\n# Ansible Playbook\n- hosts: all\n  tasks:\n    - name: Example task\n      debug:\n        msg: \"Hello, world!\"",
    },
  });

  const { data: playbooks, isLoading, refetch: refetchPlaybooks } = useQuery<Playbook[]>({
    queryKey: ["/api/playbooks"],
  });

  const onDialogOpenChange = (open: boolean) => {
    if (!open) {
      setIsDialogOpen(false);
      setEditingPlaybook(null);
      form.reset({
        name: "",
        description: "",
        content: "---\n# Ansible Playbook\n- hosts: all\n  tasks:\n    - name: Example task\n      debug:\n        msg: \"Hello, world!\"",
      });
    } else {
      setIsDialogOpen(true);
    }
  };

  const onSubmit = async (data: PlaybookFormValues) => {
    try {
      if (editingPlaybook) {
        await updatePlaybook(editingPlaybook.id, data);
        toast({
          title: "Playbook updated",
          description: `${data.name} has been updated successfully.`,
        });
      } else {
        await createPlaybook(data);
        toast({
          title: "Playbook created",
          description: `${data.name} has been created successfully.`,
        });
      }
      
      refetchPlaybooks();
      setIsDialogOpen(false);
      setEditingPlaybook(null);
      form.reset();
    } catch (error: any) {
      toast({
        title: "Error",
        description: `Failed to ${editingPlaybook ? "update" : "create"} playbook: ${error.message}`,
        variant: "destructive",
      });
    }
  };

  const handleEditPlaybook = (playbook: Playbook) => {
    setEditingPlaybook(playbook);
    form.reset({
      name: playbook.name,
      description: playbook.description || "",
      content: playbook.content,
    });
    setIsDialogOpen(true);
  };

  const handleDeletePlaybook = async () => {
    try {
      if (deleteTarget) {
        await deletePlaybook(deleteTarget.id);
        toast({
          title: "Playbook deleted",
          description: `${deleteTarget.name} has been deleted.`,
        });
        refetchPlaybooks();
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: `Failed to delete playbook: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleRunPlaybook = (playbook: Playbook) => {
    setSelectedPlaybook(playbook);
    setIsRunDialogOpen(true);
  };

  // Filter playbooks by search term
  const filteredPlaybooks = playbooks
    ? playbooks.filter(
        (playbook) =>
          playbook.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (playbook.description &&
            playbook.description.toLowerCase().includes(searchTerm.toLowerCase()))
      )
    : [];

  return (
    <div>
      {/* Page Header */}
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ansible Playbooks</h1>
          <p className="mt-1 text-sm text-gray-500">
            Create and manage Ansible playbooks for server automation
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={isDialogOpen} onOpenChange={onDialogOpenChange}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" /> New Playbook
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-3xl">
              <DialogHeader>
                <DialogTitle>{editingPlaybook ? "Edit Playbook" : "Create New Playbook"}</DialogTitle>
                <DialogDescription>
                  {editingPlaybook
                    ? "Update your Ansible playbook details below."
                    : "Define your Ansible playbook to automate server tasks."}
                </DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Playbook Name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Deploy Application" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description (Optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="Brief description of what this playbook does" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="content"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Playbook Content (YAML)</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Enter your Ansible playbook YAML content"
                            className="font-mono h-80"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          Use valid Ansible YAML syntax following Ansible best practices.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <DialogFooter>
                    <Button type="submit">
                      {editingPlaybook ? "Update Playbook" : "Create Playbook"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
          <Search className="h-4 w-4 text-gray-400" />
        </div>
        <Input
          className="pl-10"
          placeholder="Search playbooks..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Playbooks Table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="text-center p-12">Loading playbooks...</div>
          ) : filteredPlaybooks.length > 0 ? (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Description
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Last Updated
                  </th>
                  <th scope="col" className="relative px-6 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredPlaybooks.map((playbook) => (
                  <PlaybookItem
                    key={playbook.id}
                    playbook={playbook}
                    onRun={handleRunPlaybook}
                    onEdit={handleEditPlaybook}
                    onDelete={setDeleteTarget}
                  />
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-center p-12">
              <FileCode className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              {searchTerm ? (
                <>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No matching playbooks</h3>
                  <p className="text-gray-500 mb-6">
                    No playbooks match your search term "{searchTerm}". Try a different search or clear the filter.
                  </p>
                  <Button onClick={() => setSearchTerm("")} variant="outline">
                    Clear Search
                  </Button>
                </>
              ) : (
                <>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No playbooks found</h3>
                  <p className="text-gray-500 mb-6">
                    You haven't created any Ansible playbooks yet. Create your first playbook to get started.
                  </p>
                  <Button onClick={() => setIsDialogOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" /> New Playbook
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Playbook</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the playbook "{deleteTarget?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeletePlaybook} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Run Playbook Dialog */}
      <RunPlaybookDialog
        playbook={selectedPlaybook}
        isOpen={isRunDialogOpen}
        onClose={() => {
          setIsRunDialogOpen(false);
          setSelectedPlaybook(null);
        }}
      />
    </div>
  );
}