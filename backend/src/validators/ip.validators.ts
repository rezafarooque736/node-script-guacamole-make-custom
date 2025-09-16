import { listGroups } from '@/services/group.service';
import { z } from 'zod';
const groupsAllowed = await listGroups().then((gs) => gs.map((g) => g.name));

const singleIPSchema = z.object({
  old_ip: z.ipv4(),
  new_ip: z.ipv4(),
  old_group: z.enum(groupsAllowed),
  new_group: z.enum(groupsAllowed),
});
export const updateGuacamoleUserAvailableIPSchema = z.array(singleIPSchema);
export type UpdateIncomingData = z.infer<typeof updateGuacamoleUserAvailableIPSchema>;

const allocationSchema = z.object({
  amount: z.number().int().min(0),
  group: z.enum(groupsAllowed),
  first_ip: z.ipv4().optional(), // allow per-allocation start if ips not provided
});

export const createGuacamoleUserAvailableIPSchema = z
  .object({
    count: z.number().int().min(1),
    allocations: z.array(allocationSchema).min(1),
    ips: z.array(z.ipv4()).optional(), // client-authoritative list
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
          message: 'ips array must not contain duplicate addresses.',
        });
      }
      return; // ips provided => OK
    }
    // No ips provided: require per-allocation first_ip
    if ((allocations ?? []).some((a) => !a.first_ip)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide ips or per-allocation first_ip for all allocations.',
      });
    }
  });

export type CreateIncomingData = z.infer<typeof createGuacamoleUserAvailableIPSchema>;
