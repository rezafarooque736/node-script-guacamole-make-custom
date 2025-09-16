'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { z } from 'zod';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';

import { Plus, X } from 'lucide-react';

type GroupOption = { name: string };

type Props = {
  groups: GroupOption[];
  refreshFromBackend: () => Promise<void>;
};

function generateIps(start: string, total: number) {
  const parts = start.split('.').map((p) => Number(p));
  const out: string[] = [];
  let curr = [...parts];
  for (let i = 0; i < total; i++) {
    out.push(curr.join('.'));
    for (let j = 3; j >= 0; j--) {
      curr[j] = (curr[j] ?? 0) + 1;
      if (curr[j] <= 255) break;
      curr[j] = 0;
    }
  }
  return out;
}

// Per-allocation schema: each allocation owns its starting IP
const allocSchema = z.object({
  amount: z
    .string()
    .regex(/^\d+$/, { message: 'Enter a non-negative integer.' })
    .transform((v) => String(Number(v)))
    .refine((v) => Number(v) >= 0, { message: 'Amount cannot be negative.' }),
  group: z.string().min(1, { message: 'Select a group.' }),
  firstIp: z
    .string()
    .min(1, { message: 'First IP is required.' })
    .refine(
      (v) => {
        const parts = v.split('.');
        return (
          parts.length === 4 && parts.every((p) => /^\d+$/.test(p) && Number(p) >= 0 && Number(p) <= 255)
        );
      },
      { message: 'Enter a valid IPv4 (e.g. 10.0.0.1).' }
    ),
});

const FormSchema = z
  .object({
    countStr: z
      .string()
      .min(1, { message: 'Enter a valid Number of IPs.' })
      .regex(/^\d+$/, { message: 'Enter a whole number.' })
      .refine((v) => Number(v) > 0, { message: 'Must be greater than 0.' }),
    allocations: z.array(allocSchema).min(1, { message: 'Add at least one allocation.' }),
  })
  .superRefine((val, ctx) => {
    const count = Number(val.countStr || 0);
    const sum = (val.allocations ?? []).reduce((s, a) => s + (Number(a.amount) || 0), 0);
    if (sum !== count) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['allocations'],
        message: `Total allocated (${sum}) must equal number of IPs (${count}).`,
      });
    }
  });

type FormValues = z.infer<typeof FormSchema>;

export default function AddIPsPanelForm({ groups, refreshFromBackend }: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const defaultGroup = groups?.[0]?.name ?? '';

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      countStr: '',
      allocations: [{ amount: '0', group: defaultGroup, firstIp: '' }],
    },
    mode: 'onChange',
  });

  const { control, handleSubmit, watch, reset } = form;
  const { fields, append, remove } = useFieldArray({ control, name: 'allocations' });

  const total = useMemo(() => {
    const n = Number(watch('countStr'));
    return Number.isInteger(n) && n > 0 ? n : 0;
  }, [watch('countStr')]);

  const sumEntered = useMemo(
    () => (watch('allocations') ?? []).reduce((s: number, a: any) => s + (Number(a.amount) || 0), 0),
    [watch('allocations')]
  );

  const remainder = Math.max(0, total - sumEntered);

  // Build payload with a flat ips array and group allocations
  const buildValidatedPayload = (values: FormValues) => {
    const countNum = Number(values.countStr);
    const finalAlloc = values.allocations
      .map((a) => ({ amount: Number(a.amount || 0), group: a.group, first_ip: a.firstIp }))
      .filter((a) => a.amount > 0);

    if (finalAlloc.length === 0) {
      return { ok: false as const, message: 'Provide allocation(s) that sum to Number of IPs.' };
    }

    const totalAlloc = finalAlloc.reduce((s, a) => s + a.amount, 0);
    if (totalAlloc !== countNum) {
      return {
        ok: false as const,
        message: `Total allocated (${totalAlloc}) must equal number of IPs (${countNum}).`,
      };
    }

    // Create flat ips by concatenating per-allocation ranges
    const ips: string[] = [];
    for (const a of finalAlloc) {
      const seq = generateIps(a.first_ip, a.amount);
      ips.push(...seq);
    }

    return {
      ok: true as const,
      payload: {
        count: countNum,
        allocations: finalAlloc.map(({ amount, group }) => ({ amount, group })), // server uses this for group counts
        ips, // authoritative sequence to insert
      },
    };
  };

  const onCreateClick = (values: FormValues) => {
    const result = buildValidatedPayload(values);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    setConfirmOpen(true);
  };

  const handleCreateConfirmed = async (payload: any) => {
    try {
      setIsSubmitting(true);
      await toast.promise(
        (async () => {
          const res = await fetch('http://localhost:3000/api/guacamole-ip', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.message ?? 'Failed to create IPs');
          }
          await refreshFromBackend();
        })(),
        { loading: 'Creating IP rows…', success: 'IP rows created!', error: (e) => e.message }
      );
      reset({
        countStr: '',
        allocations: [{ amount: '0', group: defaultGroup, firstIp: '' }],
      });
      setConfirmOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="p-4 mb-4 space-y-4">
      <Form {...form}>
        <form className="space-y-6" onSubmit={handleSubmit(onCreateClick)}>
          <div className="flex flex-col gap-4">
            <h2 className="text-xl font-semibold">Create Seats and Assign Departments</h2>

            <FormField
              control={control}
              name="countStr"
              render={({ field }) => (
                <FormItem className="flex flex-col md:flex-row md:items-center gap-4 md:gap-6">
                  <FormLabel htmlFor="ip-count">Number of IPs</FormLabel>
                  <FormControl>
                    <Input
                      id="ip-count"
                      type="number"
                      min={1}
                      inputMode="numeric"
                      placeholder="e.g. 10"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex flex-col md:flex-row md:items-start gap-4 md:gap-6">
              <FormLabel className="pt-2">Allocations</FormLabel>
              <div className="space-y-2 w-full">
                {fields.map((f, idx) => (
                  <div key={f.id} className="grid grid-cols-1 md:grid-cols-4 items-end gap-3">
                    {/* Count */}
                    <FormField
                      control={control}
                      name={`allocations.${idx}.amount`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Count</FormLabel>
                          <FormControl>
                            <Input type="number" min={0} inputMode="numeric" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Group */}
                    <Controller
                      control={control}
                      name={`allocations.${idx}.group`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Group</FormLabel>
                          <FormControl>
                            <Select value={field.value} onValueChange={field.onChange}>
                              <SelectTrigger className="min-w-40">
                                <SelectValue placeholder="Select group" />
                              </SelectTrigger>
                              <SelectContent>
                                {groups.map((g) => (
                                  <SelectItem key={g.name} value={g.name}>
                                    {g.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* First IP per allocation */}
                    <FormField
                      control={control}
                      name={`allocations.${idx}.firstIp`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">
                            First IP:{' '}
                            <span className="text-[11px] text-slate-700">
                              Sequential range will continue from here.
                            </span>
                          </FormLabel>
                          <FormControl>
                            <Input type="text" placeholder="e.g. 100.101.102.10" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Actions */}
                    <div className="flex gap-2 md:justify-end">
                      <Button
                        type="button"
                        className="cursor-pointer size-8 bg-rose-500 hover:bg-rose-600"
                        onClick={() => remove(idx)}
                        disabled={fields.length === 1}
                        title="Remove allocation"
                      >
                        <X className="size-6" />
                      </Button>
                      <Button
                        type="button"
                        className="cursor-pointer size-8 bg-green-500 hover:bg-green-600"
                        onClick={() => append({ amount: '0', group: groups?.[0]?.name ?? '', firstIp: '' })}
                        title="Add allocation"
                      >
                        <Plus className="size-6" />
                      </Button>
                    </div>
                  </div>
                ))}

                {fields.length === 0 && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => append({ amount: '0', group: groups?.[0]?.name ?? '', firstIp: '' })}
                  >
                    Add allocation
                  </Button>
                )}

                <div className="text-sm text-muted-foreground">
                  Total requested: <span className="font-medium">{total}</span>, entered:{' '}
                  <span className="font-medium">{sumEntered}</span>, remaining:{' '}
                  <span className="font-medium">{Math.max(0, remainder)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={isSubmitting}>
              Create IP Rows
            </Button>
          </div>
        </form>
      </Form>

      {/* Confirm dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm creation</DialogTitle>
            <DialogDescription>
              You are about to create <strong>{total}</strong> IPs across the following allocations:
            </DialogDescription>
          </DialogHeader>

          <div className="mb-4">
            <ul className="list-disc list-inside">
              {(() => {
                const values = form.getValues();
                const finalAlloc = values.allocations
                  .map((a) => ({ amount: Number(a.amount || 0), group: a.group, first_ip: a.firstIp }))
                  .filter((a) => a.amount > 0);
                return finalAlloc.map((a, i) => (
                  <li key={i} className="text-sm">
                    {a.amount} IP(s) starting at <strong>{a.first_ip}</strong> → <strong>{a.group}</strong>
                  </li>
                ));
              })()}
            </ul>
          </div>

          <DialogFooter className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                const values = form.getValues();
                const v = buildValidatedPayload(values);
                if (!v.ok) {
                  toast.error(v.message);
                  return;
                }
                await handleCreateConfirmed(v.payload);
              }}
              disabled={isSubmitting}
            >
              Confirm & Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
