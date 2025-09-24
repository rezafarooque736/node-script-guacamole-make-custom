"use client";

import React, { useEffect, useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormField, FormItem, FormControl, FormMessage } from "@/components/ui/form";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

import { toast } from "sonner";
import { CheckCircleIcon } from "lucide-react";

// import components and hooks
import GroupsPanel from "@/components/groups/groups-panel";
import AddIPsPanel from "@/components/ip/add-ips-panel";

// groupsAllowed kept simple here — server still authoritatively validates
const groupsAllowed = ["primary", "secondary"] as const;

// NOTE: I added old_gateway/new_gateway so gateway is tracked per-row
const ipEntrySchema = z.object({
  old_ip: z.string(),
  new_ip: z.string(),
  old_group: z.enum(groupsAllowed),
  new_group: z.enum(groupsAllowed),
  old_gateway: z.string().optional(),
  new_gateway: z.string().optional(),
  use_cidr: z.boolean().optional(),
});

const formSchema = z.object({
  entries: z.array(ipEntrySchema),
});

type FormValues = z.infer<typeof formSchema>;

function incrementIp(ip: string, increment: number) {
  const parts = ip.split(".").map(Number);
  let carry = increment;
  for (let i = 3; i >= 0; i--) {
    const val = parts[i] + carry;
    parts[i] = ((val % 256) + 256) % 256;
    carry = Math.floor(val / 256);
  }
  return parts.join(".");
}

export default function Page() {
  const [groups, setGroups] = useState<{ name: string }[]>([]);
  // map group name -> representative gateway discovered from backend rows
  const [groupGatewayMap, setGroupGatewayMap] = useState<Record<string, string>>({});

  // load groups for AddIPsPanel (keeps single source of truth in page)
  const loadGroups = async () => {
    try {
      const res = await fetch("http://localhost:3000/api/guacamole-groups", { cache: "no-store" });
      const jsonData = await res.json();
      if (!jsonData.success) {
        toast.message(jsonData.message, {
          description: jsonData.error,
        });
      }
      setGroups(jsonData.data ?? []);
    } catch (e) {
      setGroups([]);
      toast.error(e instanceof Error ? e.message : "Failed to load groups");
    }
  };

  useEffect(() => {
    loadGroups();
  }, []);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: async () => {
      try {
        const res = await fetch("http://localhost:3000/api/guacamole-ip", { cache: "no-store" });
        const jsonData = await res.json();
        if (!jsonData.success) {
          toast.message(jsonData.message, {
            description: jsonData.error,
          });
        }

        // Build entries and group->gateway map from backend rows
        const map: Record<string, string> = {};
        const entries = (jsonData.data ?? []).map(
          (row: { ip: string; group_name: string; gateway?: string }) => {
            if (row.gateway && !map[row.group_name]) map[row.group_name] = row.gateway;
            return {
              old_ip: row.ip,
              new_ip: row.ip,
              old_group: row.group_name,
              new_group: row.group_name,
              old_gateway: row.gateway ?? "",
              new_gateway: row.gateway ?? "",
              use_cidr: false,
            };
          }
        );

        setGroupGatewayMap(map);
        return { entries };
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load IPs");
        return { entries: [] };
      }
    },
    mode: "onBlur",
  });

  const { control, handleSubmit, setValue, getValues, formState, reset } = form;

  const { fields } = useFieldArray({ name: "entries", control });

  const [confirmIndex, setConfirmIndex] = useState<number | null>(null);
  const [confirmValue, setConfirmValue] = useState<boolean | null>(null);

  function findUseCidrIndices(entries: FormValues["entries"]) {
    return entries
      .map((e, i) => (e.use_cidr ? i : -1))
      .filter((i) => i !== -1)
      .sort((a, b) => a - b);
  }

  // When CIDR base IPs change, update dependent rows
  function updateIpsWithCidr(
    entries: FormValues["entries"],
    formSetValue: (name: `entries.${number}.new_ip`, value: string, opts?: any) => void
  ) {
    const cidrIndices = findUseCidrIndices(entries);
    if (cidrIndices.length === 0) return;

    // Treat end of array as virtual next CIDR start
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
    const updated = getValues("entries");
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

    const entries = getValues("entries");
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

  // NEW: gateway change handler (separate from IP)
  function onNewGatewayChange(index: number, value: string) {
    setValue(`entries.${index}.new_gateway`, value, { shouldDirty: true });
  }

  // NEW: when changing group select, auto-populate gateway for that group if we have a known mapping
  function onNewGroupChange(index: number, newGroup: string) {
    // update new_group
    setValue(`entries.${index}.new_group`, newGroup, { shouldDirty: true });

    // if we know a gateway for this group, set it
    const gw = groupGatewayMap[newGroup];
    if (gw) {
      setValue(`entries.${index}.new_gateway`, gw, { shouldDirty: true });
    } else {
      // if not known, preserve old_gateway by default or clear
      const existingOldGw = getValues(`entries.${index}.old_gateway`) ?? "";
      setValue(`entries.${index}.new_gateway`, existingOldGw, { shouldDirty: true });
    }
  }

  async function refreshFromBackend() {
    const res = await fetch("http://localhost:3000/api/guacamole-ip", { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to reload IPs");
    const jsonData = await res.json();

    // rebuild map and entries
    const map: Record<string, string> = {};
    const entries = (jsonData.data ?? []).map((row: { ip: string; group_name: string; gateway?: string }) => {
      if (row.gateway && !map[row.group_name]) map[row.group_name] = row.gateway;
      return {
        old_ip: row.ip,
        new_ip: row.ip,
        old_group: row.group_name,
        new_group: row.group_name,
        old_gateway: row.gateway ?? "",
        new_gateway: row.gateway ?? "",
        use_cidr: false,
      };
    });

    setGroupGatewayMap(map);
    reset({ entries });
  }

  const onSubmit = async (data: FormValues) => {
    const payload = data.entries.map(
      ({ old_ip, new_ip, old_group, new_group, old_gateway, new_gateway }) => ({
        old_ip,
        new_ip,
        old_group,
        new_group,
        old_gateway,
        new_gateway,
      })
    );

    await toast.promise(
      (async () => {
        const response = await fetch("http://localhost:3000/api/guacamole-ip", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.message ?? "Update failed");
        }
        await refreshFromBackend();
      })(),
      {
        loading: "Updating IPs…",
        success: "IP(s) updated successfully!",
        error: (e) => e.message || "Update failed",
      }
    );
  };

  return (
    <main className="max-w-7xl mx-auto p-6">
      <GroupsPanel />
      <AddIPsPanel groups={groups} refreshFromBackend={refreshFromBackend} />

      <h1 className="text-3xl font-bold mb-6">Update Secure Machine User IPs and Groups</h1>

      <div className="mb-4">
        <Alert>
          <CheckCircleIcon />
          <AlertTitle>How to update IPs or Groups</AlertTitle>
          <AlertDescription>
            <ul className="list-inside list-disc text-sm">
              <li>Edit New IP, Group or Gateway in rows that need changes.</li>
              <li>
                To auto-fill sequential IPs, check “Use CIDR” on the first row of a block and type a base IP;
                subsequent rows update automatically.
              </li>
              <li>Click “Update IPs” button to save.</li>
            </ul>
          </AlertDescription>
        </Alert>
      </div>

      <Form {...form}>
        <form
          onSubmit={handleSubmit(onSubmit, () => {
            toast.error("Please fix validation errors before submitting.");
            window.scrollTo({ top: 0, behavior: "smooth" });
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
                  <th className="p-2 border border-gray-300">Old Gateway</th>
                  <th className="p-2 border border-gray-300">New Gateway</th>
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
                                  // update group and auto-fill gateway for that group if known
                                  field.onChange(e);
                                  onNewGroupChange(index, e.target.value);
                                }}
                              >
                                {groups.map((g) => (
                                  <option key={g.name} value={g.name}>
                                    {g.name}
                                  </option>
                                ))}
                              </select>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </td>

                    <td className="p-2 border border-gray-300">
                      <FormField
                        control={control}
                        name={`entries.${index}.old_gateway`}
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
                        name={`entries.${index}.new_gateway`}
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Input {...field} onChange={(e) => onNewGatewayChange(index, e.target.value)} />
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
              {formState.isSubmitting ? "Updating…" : "Update IPs"}
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
              Are you sure you want to enable "Use CIDR" starting from IP{" "}
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
                  toast("CIDR enabled: subsequent IPs will auto-increment.");
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
