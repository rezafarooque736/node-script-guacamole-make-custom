import { prisma } from '@/configs/database';

// The shape of a single IP entry returned from DB
export interface GuacamoleUserAvailableIP {
  ip: string;
  group_name: string;
}

// Define the shape of a single update item (matches IncomingData)
export interface IncomingData {
  old_ip: string;
  new_ip: string;
  old_group: string;
  new_group: string;
}

function parseIp(ip: string): number[] {
  return ip.split('.').map((p) => Number(p));
}

function ipToString(parts: number[]): string {
  return parts.join('.');
}

function nextIp(ip: string): string {
  const p = parseIp(ip);
  for (let i = 3; i >= 0; i--) {
    p[i] += 1;
    if (p[i] <= 255) break;
    p[i] = 0;
  }
  return ipToString(p);
}

async function findStartBase(): Promise<string> {
  // pick a stable base: use the earliest DB IP and set last octet to 1
  const row = await prisma.guacamole_user_available_ip.findFirst({
    orderBy: { id: 'asc' },
    select: { ip: true },
  });
  if (row?.ip) {
    const parts = parseIp(row.ip);
    // safe fallback if parse fails
    if (parts.length === 4 && parts.every((n) => Number.isInteger(n))) {
      return `${parts[0]}.${parts[1]}.${parts[2]}.1`;
    }
  }
  return '100.101.102.1';
}

// Fetch function return type: Promise of array of available IPs
export const fetchGuacamoleUserAvailableIPs = async (): Promise<GuacamoleUserAvailableIP[]> => {
  try {
    const result = await prisma.guacamole_user_available_ip.findMany({
      select: { ip: true, group_name: true },
      orderBy: [{ id: 'asc' }],
    });
    return result;
  } catch (error: any) {
    console.error('Error fetching Guacamole user available IPs:', error.message);
    throw error;
  }
};

// Update function takes an array of IncomingData and returns Promise of array of updated records
export const updateGuacamoleUserAvailableIP = async (
  data: IncomingData[]
): Promise<GuacamoleUserAvailableIP[]> => {
  try {
    // Use transaction but update by found id (safer than trying to update by composite)
    return prisma.$transaction(async (tx) => {
      const updated: GuacamoleUserAvailableIP[] = [];
      for (const item of data) {
        const found = await tx.guacamole_user_available_ip.findFirst({
          where: { ip: item.old_ip, group_name: item.old_group },
          select: { id: true },
        });
        if (!found) {
          throw new Error(`Row not found for ip=${item.old_ip} group=${item.old_group}`);
        }

        const u = await tx.guacamole_user_available_ip.update({
          where: { id: found.id },
          data: { ip: item.new_ip, group_name: item.new_group },
          select: { ip: true, group_name: true },
        });

        updated.push(u);
      }
      return updated;
    });
  } catch (error: any) {
    console.error('Error updating Guacamole user available IP:', error.message);
    throw error;
  }
};

/**
 * Create N IP rows distributed across provided groups.
 * - allocations: [{ amount, group }]
 * - total: total count (should equal sum of allocations)
 * - ips?: optional explicit ips array (length must be total). If provided server will use these ips in-order.
 */
export const createBulkGuacamoleIPs = async (
  allocations: { amount: number; group: string }[],
  total: number,
  ips?: string[]
): Promise<GuacamoleUserAvailableIP[]> => {
  if (!Array.isArray(allocations)) throw new Error('allocations must be an array');
  if (!Number.isInteger(total) || total <= 0) throw new Error('total must be integer > 0');

  if (ips && (!Array.isArray(ips) || ips.length !== total)) {
    throw new Error('ips array length must equal total when provided');
  }

  return prisma.$transaction(async (tx) => {
    // Determine starting IP = max existing + 1 or a base
    const latest = await tx.guacamole_user_available_ip.findFirst({
      orderBy: [{ id: 'desc' }],
      select: { ip: true },
    });

    let current = latest?.ip ?? (await findStartBase());
    const created: GuacamoleUserAvailableIP[] = [];

    // If ips is provided we use ips sequentially.
    let ipsIndex = 0;

    for (const alloc of allocations) {
      for (let i = 0; i < (alloc.amount || 0); i++) {
        let candidate: string;
        if (ips) {
          candidate = ips[ipsIndex++];
          // ensure candidate is not already in DB
          const exists = await tx.guacamole_user_available_ip.findFirst({
            where: { ip: candidate },
            select: { id: true },
          });
          if (exists) {
            throw new Error(`Requested ip ${candidate} already exists in database`);
          }
        } else {
          // advance current until free
          while (true) {
            const exists = await tx.guacamole_user_available_ip.findFirst({
              where: { ip: current },
              select: { id: true },
            });
            if (!exists) break;
            current = nextIp(current);
          }
          candidate = current;
          current = nextIp(current);
        }

        const row = await tx.guacamole_user_available_ip.create({
          data: {
            ip: candidate,
            group_name: alloc.group,
            is_available_user: 0,
          },
          select: { ip: true, group_name: true },
        });

        created.push(row);
      }
    }

    return created;
  });
};
