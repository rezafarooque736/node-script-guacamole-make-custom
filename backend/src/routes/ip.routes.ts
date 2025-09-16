import { Router } from 'express';
import {
  getGuacamoleUserAvailableIPs,
  updateGuacamoleUserAvailableIPs,
  createGuacamoleUserAvailableIPs,
} from '../controllers/ip.controller';

const router: Router = Router();

router.get('/', getGuacamoleUserAvailableIPs);
router.put('/', updateGuacamoleUserAvailableIPs);
router.post('/', createGuacamoleUserAvailableIPs);

export default router;
