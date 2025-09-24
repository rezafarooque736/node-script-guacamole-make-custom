// validators/ip.validators.ts
import { listGroups } from "@/services/group.service";
import { z } from "zod";
const groupsAllowed = await listGroups().then((gs) => gs.map((g) => g.name));

const singleIPSchema = z.object({
  old_ip: z.ipv4(),
  new_ip: z.ipv4(),
  old_group: z.enum(groupsAllowed),
  new_group: z.enum(groupsAllowed),
  old_gateway: z.ipv4().optional().or(z.literal("")),
  new_gateway: z.ipv4().optional().or(z.literal("")),
});
export const updateGuacamoleUserAvailableIPSchema = z.array(singleIPSchema);
export type UpdateIncomingData = z.infer<typeof updateGuacamoleUserAvailableIPSchema>;

// Update: allocation has gateway required now
const allocationSchema = z.object({
  amount: z.number().int().min(0),
  group: z.enum(groupsAllowed),
  firstIp: z.ipv4().optional(), // still allowed when ips provided
  gateway: z.ipv4(), // <- required IPv4 gateway per allocation
});

export const createGuacamoleUserAvailableIPSchema = z
  .object({
    count: z.number().int().min(1),
    allocations: z.array(allocationSchema).min(1),
    ips: z.array(z.ipv4()).optional(),
  })
  .superRefine((val, ctx) => {
    const { count, allocations, ips } = val;
    const sum = (allocations ?? []).reduce((s, a) => s + (Number(a.amount) || 0), 0);
    if (sum !== count) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Sum of allocations (${sum}) must equal count (${count}).`,
      });
    }

    if (Array.isArray(ips)) {
      if (ips.length !== count) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `ips length (${ips.length}) must equal count (${count}).`,
        });
      }
      const uniq = new Set(ips);
      if (uniq.size !== ips.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "ips array must not contain duplicate addresses.",
        });
      }
      return; // ips provided => OK
    }

    // No ips provided: require per-allocation firstIp (and gateway is required by schema already)
    if ((allocations ?? []).some((a) => !a.firstIp)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide ips or per-allocation firstIp for all allocations.",
      });
    }
  });

export type CreateIncomingData = z.infer<typeof createGuacamoleUserAvailableIPSchema>;
