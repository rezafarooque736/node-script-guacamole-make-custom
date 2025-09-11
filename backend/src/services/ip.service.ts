import { prisma } from '../configs/database';

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

// Fetch function return type: Promise of array of available IPs
export const fetchGuacamoleUserAvailableIPs = async (): Promise<GuacamoleUserAvailableIP[]> => {
  try {
    const result = await prisma.guacamole_user_available_ip.findMany({
      select: { ip: true, group_name: true },
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
    const result = await prisma.$transaction(
      data.map((item) =>
        prisma.guacamole_user_available_ip.update({
          where: { ip: item.old_ip, group_name: item.old_group },
          data: { ip: item.new_ip, group_name: item.new_group },
        })
      )
    );
    return result;
  } catch (error: any) {
    console.error('Error updating Guacamole user available IP:', error.message);
    throw error;
  }
};
