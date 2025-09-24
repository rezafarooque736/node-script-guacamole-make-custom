'use client';

import React, { useEffect, useState } from 'react';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

type GroupRow = { name: string; disabled: boolean };

const CreateGroupSchema = z.object({
  name: z.string().min(1, { message: 'Group name is required' }).trim(),
});

export default function GroupsPanel() {
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [loading, setLoading] = useState(false);

  // delete confirmation
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const form = useForm<z.infer<typeof CreateGroupSchema>>({
    resolver: zodResolver(CreateGroupSchema),
    defaultValues: { name: '' },
  });

  const loadGroups = async () => {
    setLoading(true);
    try {
      const res = await fetch('http://localhost:3000/api/guacamole-groups', { cache: 'no-store' });

      const jsonData = await res.json();
      if (!jsonData.success) {
        toast.message(jsonData.message, {
          description: jsonData.error,
        });
      } else {
        setGroups(jsonData.data ?? []);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load groups');
      setGroups([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGroups();
  }, []);

  async function onCreate(data: z.infer<typeof CreateGroupSchema>) {
    const res = await fetch('http://localhost:3000/api/guacamole-groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: data.name }),
    });

    const jsonData = await res.json();
    if (!jsonData.success) {
      toast.message(jsonData.message, {
        description: jsonData.error,
      });
    } else {
      toast.success('Group created');
    }
    form.reset();
    await loadGroups();
  }

  const confirmDelete = (name: string) => setToDelete(name);
  const cancelDelete = () => setToDelete(null);

  const deleteGroup = async (name: string) => {
    setIsDeleting(true);
    try {
      const res = await fetch(`http://localhost:3000/api/guacamole-groups/${encodeURIComponent(name)}`, {
        method: 'DELETE',
      });

      const jsonData = await res.json();
      if (!jsonData.success) {
        toast.message(jsonData.message, {
          description: jsonData.error,
        });
      } else {
        toast.success('Group deleted');
      }
      form.reset();
      await loadGroups();
    } finally {
      setIsDeleting(false);
      setToDelete(null);
    }
  };

  return (
    <Card className="p-4 mb-4 space-y-4">
      <h1 className="text-3xl font-bold">Create New Secure Machine User Groups</h1>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onCreate)} className="flex gap-3 items-end">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem className="grow">
                <FormLabel>Create group</FormLabel>
                <FormControl>
                  <Input placeholder="group name" {...field} />
                </FormControl>
                <FormDescription />
                <FormMessage />
              </FormItem>
            )}
          />

          <Button className="mb-2" type="submit" disabled={loading}>
            Add Group
          </Button>
        </form>
      </Form>

      <div>
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-lg font-semibold">Groups</h3>
          <span className="text-sm text-muted-foreground">Total: {groups.length}</span>
        </div>

        <div className="overflow-auto">
          <Table>
            <TableCaption>List of groups</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[240px]">Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((g) => (
                <TableRow key={g.name}>
                  <TableCell className="font-medium truncate max-w-[200px]">{g.name}</TableCell>
                  <TableCell>{g.disabled ? 'Disabled' : 'Active'}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="destructive" size="sm" onClick={() => confirmDelete(g.name)}>
                      Remove
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={2}>Total</TableCell>
                <TableCell className="text-right">{groups.length}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      </div>

      {/* Delete confirmation dialog (shadcn Dialog) */}
      <Dialog open={Boolean(toDelete)} onOpenChange={(open) => !open && setToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Remove Group</DialogTitle>
          </DialogHeader>
          <div className="py-2 text-sm text-muted-foreground">
            Are you sure you want to remove the group <strong>{toDelete}</strong>? This action cannot be
            undone and any assigned IPs may be affected.
          </div>
          <DialogFooter className="flex justify-end gap-3">
            <Button variant="outline" onClick={cancelDelete} disabled={isDeleting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => toDelete && deleteGroup(toDelete)}
              disabled={isDeleting}
            >
              {isDeleting ? 'Removing…' : 'Yes, remove'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
