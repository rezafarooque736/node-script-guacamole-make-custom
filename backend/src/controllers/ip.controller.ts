import { fetchGuacamoleUserAvailableIPs, updateGuacamoleUserAvailableIP } from '../services/ip.service';
import { updateGuacamoleUserAvailableIPSchema, IncomingData } from '../validators/ip.validators';
import { Request, Response } from 'express';

/**
 * Controller to handle fetching available IPs for Guacamole users.
 * Controller to handle changing a single Guacamole user's available IPs.
 */

export const getGuacamoleUserAvailableIPs = async (req: Request, res: Response): Promise<void> => {
  try {
    // Logic to get available IPs for Guacamole user from the database
    const availableIPs = await fetchGuacamoleUserAvailableIPs();
    res.status(200).json({
      success: true,
      message: 'Available IPs fetched successfully',
      data: availableIPs,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching available IPs', error: error.message });
  }
};

export const changeSingleGuacamoleUserAvailableIPs = async (req: Request, res: Response): Promise<void> => {
  try {
    const incomingData: IncomingData = req.body;
    const validation = updateGuacamoleUserAvailableIPSchema.safeParse(incomingData);

    if (!validation.success) {
      // Extract all error messages
      const messages = validation.error.issues.map(
        (issue) => `Path ${issue.path.join('.')} - ${issue.message}`
      );

      // Print error messages
      console.error('Validation Error(s):', messages);

      // Return error messages
      res.status(400).json({
        success: false,
        message: 'Invalid input data',
        errors: messages,
      });
      return;
    }

    await updateGuacamoleUserAvailableIP(validation.data);

    res.status(200).json({
      success: true,
      message: 'IP, Group updated successfully',
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error updating IP', error: error.message });
  }
};
