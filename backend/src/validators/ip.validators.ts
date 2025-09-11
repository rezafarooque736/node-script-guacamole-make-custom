import { groupsAllowed } from '@/consts';
import { z } from 'zod';

const singleIPSchema = z.object({
  old_ip: z.ipv4(),
  new_ip: z.ipv4(),
  old_group: z.enum(groupsAllowed),
  new_group: z.enum(groupsAllowed),
});

export const updateGuacamoleUserAvailableIPSchema = z.array(singleIPSchema);
export type IncomingData = z.infer<typeof updateGuacamoleUserAvailableIPSchema>;
