'use client';

import React, { useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Form, FormField, FormItem, FormControl, FormMessage } from '@/components/ui/form';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';

import { Toaster, toast } from 'sonner'; // add sonner
import { CheckCircleIcon } from 'lucide-react';
// Also render <Toaster /> once in this page component

const groupsAllowed = ['primary', 'secondary'] as const;

const ipEntrySchema = z.object({
  old_ip: z.ipv4(),
  new_ip: z.ipv4(),
  old_group: z.enum(groupsAllowed),
  new_group: z.enum(groupsAllowed),
  use_cidr: z.boolean().optional(),
});

const formSchema = z.object({
  entries: z.array(ipEntrySchema),
});

type FormValues = z.infer<typeof formSchema>;

function incrementIp(ip: string, increment: number) {
  const parts = ip.split('.').map(Number);
  let carry = increment;
  for (let i = 3; i >= 0; i--) {
    const val = parts[i] + carry;
    parts[i] = ((val % 256) + 256) % 256;
    carry = Math.floor(val / 256);
  }
  return parts.join('.');
}

export default function Page() {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: async () => {
      try {
        const res = await fetch('http://localhost:3000/api/guacamole-ip', { cache: 'no-store' });
        if (!res.ok) throw new Error('Failed to load IPs');
        const json: { data: { ip: string; group_name: 'primary' | 'secondary' }[] } = await res.json();
        const entries = (json.data ?? []).map((row) => ({
          old_ip: row.ip,
          new_ip: row.ip,
          old_group: row.group_name,
          new_group: row.group_name,
          use_cidr: false,
        }));
        return { entries };
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load IPs'); // non-blocking UI [1][5]
        return { entries: [] }; // safe fallback so page renders [7]
      }
    },
    mode: 'onBlur',
  });

  const { control, handleSubmit, setValue, getValues, formState, reset, trigger } = form;

  const { fields } = useFieldArray({ name: 'entries', control }); // [20]

  const [confirmIndex, setConfirmIndex] = useState<number | null>(null);
  const [confirmValue, setConfirmValue] = useState<boolean | null>(null);

  function findUseCidrIndices(entries: FormValues['entries']) {
    return entries
      .map((e, i) => (e.use_cidr ? i : -1))
      .filter((i) => i !== -1)
      .sort((a, b) => a - b);
  }

  // Fix: robust propagation when CIDR is enabled
  function updateIpsWithCidr(
    entries: FormValues['entries'],
    formSetValue: (name: `entries.${number}.new_ip`, value: string, opts?: any) => void
  ) {
    const cidrIndices = findUseCidrIndices(entries);
    if (cidrIndices.length === 0) return;

    // Treat end of array as a virtual next CIDR start
    cidrIndices.push(entries.length);

    for (let block = 0; block < cidrIndices.length - 1; block++) {
      const startIdx = cidrIndices[block];
      const endExclusive = cidrIndices[block + 1];

      // Base IP is whatever is at startIdx now
      const baseIp = getValues(`entries.${startIdx}.new_ip`);
      formSetValue(`entries.${startIdx}.new_ip`, baseIp, { shouldDirty: true });

      for (let i = startIdx + 1; i < endExclusive; i++) {
        const nextIp = incrementIp(baseIp, i - startIdx);
        formSetValue(`entries.${i}.new_ip`, nextIp, { shouldDirty: true });
      }
    }
  }

  function onUseCidrToggle(index: number, value: boolean) {
    setValue(`entries.${index}.use_cidr`, value);
    const updated = getValues('entries');
    updated[index].use_cidr = value;

    if (value) {
      for (let i = index + 1; i < updated.length; i++) {
        if (updated[i].use_cidr) {
          updated[i].use_cidr = false;
          setValue(`entries.${i}.use_cidr`, false);
        }
      }
    }
    updateIpsWithCidr(updated, setValue);
  }

  function onNewIpChange(index: number, value: string) {
    setValue(`entries.${index}.new_ip`, value, { shouldDirty: true });

    const entries = getValues('entries');
    if (entries[index].use_cidr) {
      const cidrIndices = findUseCidrIndices(entries);
      const blockStart = cidrIndices.reduce((prev, curr) => (curr <= index ? curr : prev), -1);
      if (blockStart === -1) return;

      // Set new base at blockStart to current value
      setValue(`entries.${blockStart}.new_ip`, value, { shouldDirty: true });

      const nextBlockStart = cidrIndices.find((i) => i > blockStart) ?? entries.length;

      for (let i = blockStart + 1; i < nextBlockStart; i++) {
        const inc = incrementIp(value, i - blockStart);
        setValue(`entries.${i}.new_ip`, inc, { shouldDirty: true });
      }
    }
  }

  async function refreshFromBackend() {
    const res = await fetch('http://localhost:3000/api/guacamole-ip', { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to reload IPs');
    const json: { data: { ip: string; group_name: 'primary' | 'secondary' }[] } = await res.json();
    const entries = (json.data ?? []).map((row) => ({
      old_ip: row.ip,
      new_ip: row.ip,
      old_group: row.group_name,
      new_group: row.group_name,
      use_cidr: false,
    }));
    reset({ entries }); // keep UI in sync with backend after write [7][11]
  }

  const onSubmit = async (data: FormValues) => {
    const payload = data.entries.map(({ old_ip, new_ip, old_group, new_group }) => ({
      old_ip,
      new_ip,
      old_group,
      new_group,
    }));

    // Use promise toast for UX
    await toast.promise(
      (async () => {
        const response = await fetch('http://localhost:3000/api/guacamole-ip', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.message ?? 'Update failed');
        }
        // After successful write, reload fresh data and sync UI
        await refreshFromBackend();
      })(),
      {
        loading: 'Updating IPs…',
        success: 'IP(s) updated successfully!',
        error: (e) => e.message || 'Update failed',
      }
    );
  };

  {
    (form.getValues('entries')?.length ?? 0) === 0 && (
      <Alert variant="destructive">
        <AlertTitle>No IP data loaded</AlertTitle>
        <AlertDescription>
          Unable to load IPs from the server. Try again later or check the API.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <main className="max-w-7xl mx-auto p-6">
      {/* Mount Sonner toaster once on the page */}
      {/* SOP alert at top */}
      <h1 className="text-3xl font-bold mb-6">Update Secure Machine User IPs and Groups</h1>
      <div className="mb-4">
        <Alert>
          <CheckCircleIcon />
          <AlertTitle>How to update IPs or Groups</AlertTitle>
          <AlertDescription>
            <ul className="list-inside list-disc text-sm">
              <li>Edit New IP or Group in rows that need changes.</li>
              <li>
                To auto-fill sequential IPs, check “Use CIDR” on the first row of a block and type a base IP;
                subsequent rows update automatically.
              </li>
              <li>Click “Update IPs” button to save.</li>
            </ul>
          </AlertDescription>
        </Alert>
      </div>{' '}
      {}
      <Form {...form}>
        <form
          onSubmit={handleSubmit(onSubmit, () => {
            toast.error('Please fix validation errors before submitting.'); // [3][1]
            // Optionally scroll to top
            window.scrollTo({ top: 0, behavior: 'smooth' });
          })}
          className="space-y-6"
        >
          <div className="overflow-x-auto max-h-[700px] border rounded-md shadow">
            <table className="table-auto w-full border-collapse border border-gray-300">
              <thead className="bg-gray-100 sticky top-0">
                <tr>
                  <th className="p-2 border border-gray-300 w-16 text-center">#</th>
                  <th className="p-2 border border-gray-300">Old IP</th>
                  <th className="p-2 border border-gray-300">New IP</th>
                  <th className="p-2 border border-gray-300">Old Group</th>
                  <th className="p-2 border border-gray-300">New Group</th>
                  <th className="p-2 border border-gray-300 text-center">Use CIDR</th>
                </tr>
              </thead>
              <tbody>
                {fields.map((field, index) => (
                  <tr key={field.id} className="odd:bg-white even:bg-gray-50">
                    <td className="p-2 border border-gray-300 text-center">{index + 1}</td>

                    <td className="p-2 border border-gray-300">
                      <FormField
                        control={control}
                        name={`entries.${index}.old_ip`}
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Input {...field} disabled />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </td>

                    <td className="p-2 border border-gray-300">
                      <FormField
                        control={control}
                        name={`entries.${index}.new_ip`}
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Input {...field} onChange={(e) => onNewIpChange(index, e.target.value)} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </td>

                    <td className="p-2 border border-gray-300">
                      <FormField
                        control={control}
                        name={`entries.${index}.old_group`}
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Input {...field} disabled />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </td>

                    <td className="p-2 border border-gray-300">
                      <FormField
                        control={control}
                        name={`entries.${index}.new_group`}
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <select
                                {...field}
                                className="rounded border border-gray-300 px-2 py-1"
                                onChange={(e) => {
                                  field.onChange(e);
                                  // mark dirty so partial updates can pick it up if needed
                                  setValue(`entries.${index}.new_group`, e.target.value as any, {
                                    shouldDirty: true,
                                  });
                                }}
                              >
                                {groupsAllowed.map((g) => (
                                  <option key={g} value={g}>
                                    {g}
                                  </option>
                                ))}
                              </select>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </td>

                    <td className="p-2 border border-gray-300 text-center">
                      <FormField
                        control={control}
                        name={`entries.${index}.use_cidr`}
                        render={({ field }) => (
                          <FormItem className="flex justify-center">
                            <FormControl>
                              <Checkbox
                                checked={field.value || false}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setConfirmIndex(index);
                                    setConfirmValue(true);
                                  } else {
                                    onUseCidrToggle(index, false);
                                  }
                                }}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end gap-4">
            <Button variant="outline" type="button" onClick={() => reset()}>
              Reset
            </Button>
            <Button type="submit" disabled={formState.isSubmitting}>
              {formState.isSubmitting ? 'Updating…' : 'Update IPs'}
            </Button>
          </div>
        </form>
      </Form>
      {/* Confirmation Dialog */}
      {confirmIndex !== null && confirmValue === true && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-md p-6 max-w-md w-full shadow-lg">
            <h2 className="text-xl font-semibold mb-4">Confirm Use CIDR</h2>
            <p className="mb-6">
              Are you sure you want to enable "Use CIDR" starting from IP{' '}
              <strong>{form.getValues(`entries.${confirmIndex}.old_ip`)}</strong>? <br />
              This will auto-update subsequent IPs.
            </p>
            <div className="flex justify-end gap-4">
              <Button
                variant="outline"
                onClick={() => {
                  if (confirmIndex !== null) setValue(`entries.${confirmIndex}.use_cidr`, false);
                  setConfirmIndex(null);
                  setConfirmValue(null);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  onUseCidrToggle(confirmIndex!, true);
                  setConfirmIndex(null);
                  setConfirmValue(null);
                  toast('CIDR enabled: subsequent IPs will auto-increment.');
                }}
              >
                Yes, Confirm
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
