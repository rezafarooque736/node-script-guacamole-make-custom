// controllers/ip.controller.ts
import {
  fetchGuacamoleUserAvailableIPs,
  updateGuacamoleUserAvailableIP,
  createBulkGuacamoleIPs,
} from "../services/ip.service";
import {
  updateGuacamoleUserAvailableIPSchema,
  createGuacamoleUserAvailableIPSchema,
} from "../validators/ip.validators";
import { Request, Response } from "express";

function zodIssuesToMap(issues: any[]) {
  const map: Record<string, string[]> = {};
  for (const issue of issues) {
    const path =
      Array.isArray(issue.path) && issue.path.length > 0 ? issue.path.join(".") : issue.path || "root";
    if (!map[path]) map[path] = [];
    map[path].push(issue.message);
  }
  return map;
}

export const getGuacamoleUserAvailableIPs = async (req: Request, res: Response): Promise<void> => {
  try {
    const availableIPs = await fetchGuacamoleUserAvailableIPs();
    res.status(200).json({
      success: true,
      message: "Available IPs fetched successfully",
      data: availableIPs,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Error fetching available IPs", error: error.message });
  }
};

export const updateGuacamoleUserAvailableIPs = async (req: Request, res: Response): Promise<void> => {
  try {
    const incoming = req.body;
    console.log({ incoming });
    const parsed = updateGuacamoleUserAvailableIPSchema.safeParse(incoming);

    if (!parsed.success) {
      const errors = zodIssuesToMap(parsed.error.issues);
      return res.status(400).json({ success: false, message: "Invalid input data", errors });
    }

    await updateGuacamoleUserAvailableIP(parsed.data);

    res.status(200).json({
      success: true,
      message: "IP(s) updated successfully",
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Error updating IP(s)", error: error.message });
  }
};

export const createGuacamoleUserAvailableIPs = async (req: Request, res: Response) => {
  try {
    const parsed = createGuacamoleUserAvailableIPSchema.safeParse(req.body);
    if (!parsed.success) {
      const errors = zodIssuesToMap(parsed.error.issues);
      return res.status(400).json({ success: false, message: "Invalid input data", errors });
    }

    const { count, allocations, ips } = parsed.data;

    if (Array.isArray(ips) && ips.length > 0) {
      const created = await createBulkGuacamoleIPs(allocations, count, ips);
      return res.status(201).json({ success: true, message: "IPs created", data: created });
    }

    // Server-side generation per allocation from its firstIp
    const ipsToUse: string[] = [];
    for (const a of allocations) {
      const start = a.firstIp!;
      const parts = start.split(".").map(Number);
      let curr = [...parts];
      for (let i = 0; i < a.amount; i++) {
        ipsToUse.push(curr.join("."));
        for (let j = 3; j >= 0; j--) {
          curr[j] = (curr[j] ?? 0) + 1;
          if (curr[j] <= 255) break;
          curr[j] = 0;
        }
      }
    }

    const created = await createBulkGuacamoleIPs(allocations, count, ipsToUse);
    return res.status(201).json({ success: true, message: "IPs created", data: created });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Error creating IPs", error: error.message });
  }
};
