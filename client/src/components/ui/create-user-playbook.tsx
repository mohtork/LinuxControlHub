import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormDescription, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createPlaybook } from "@/lib/ansible";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

const formSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  username: z.string().min(2, "Username must be at least 2 characters").refine(val => !val.includes(' '), {
    message: "Username cannot contain spaces",
  }),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type FormValues = z.infer<typeof formSchema>;

export function CreateUserPlaybook() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "Create User",
      username: "",
      password: "",
    },
  });

  const onSubmit = async (data: FormValues) => {
    setIsSubmitting(true);
    
    try {
      // Generate a more robust playbook
      const playbookContent = `---
# Create a user on different Linux distributions
- name: Create a new user on Linux servers
  hosts: all
  become: true
  vars:
    username: "${data.username}"
    password: "${data.password}"
  tasks:
    - name: Ensure the user exists
      ansible.builtin.user:
        name: "{{ username }}"
        password: "{{ password | password_hash('sha512') }}"
        shell: /bin/bash
        state: present
        create_home: yes

    - name: Check if sudo group exists
      ansible.builtin.shell: getent group sudo
      register: sudo_check
      ignore_errors: yes
      changed_when: false

    - name: Check if wheel group exists
      ansible.builtin.shell: getent group wheel
      register: wheel_check
      ignore_errors: yes
      changed_when: false

    - name: Add user to sudo group if it exists
      ansible.builtin.user:
        name: "{{ username }}"
        groups: sudo
        append: yes
      when: sudo_check.rc == 0

    - name: Add user to wheel group if sudo doesn't exist but wheel does
      ansible.builtin.user:
        name: "{{ username }}"
        groups: wheel
        append: yes
      when: 
        - sudo_check.rc != 0
        - wheel_check.rc == 0

    # For other distributions create a sudoers file
    - name: Create sudoers file for user when neither sudo nor wheel exists
      ansible.builtin.copy:
        dest: "/etc/sudoers.d/{{ username }}"
        content: "{{ username }} ALL=(ALL) NOPASSWD: ALL"
        mode: 0440
        validate: "/usr/sbin/visudo -cf %s"
      when: 
        - sudo_check.rc != 0 
        - wheel_check.rc != 0
`;

      await createPlaybook({
        name: data.name,
        description: `Creates user ${data.username} with sudo privileges across different Linux distributions.`,
        content: playbookContent,
      });

      toast({
        title: "Playbook created",
        description: "The user creation playbook has been created successfully.",
      });
      
      setOpen(false);
      form.reset();
    } catch (error) {
      console.error("Error creating playbook:", error);
      toast({
        title: "Error",
        description: "Failed to create the playbook. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Create User Playbook
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create User Playbook</DialogTitle>
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
                      <Input placeholder="Create User" {...field} />
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
                      <Input placeholder="newuser" {...field} />
                    </FormControl>
                    <FormDescription>
                      The Linux username to create
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input type="password" {...field} />
                    </FormControl>
                    <FormDescription>
                      Password for the new user (will be securely hashed)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Creating..." : "Create Playbook"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}