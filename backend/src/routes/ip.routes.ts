import { Application, Router } from 'express';
import {
  changeSingleGuacamoleUserAvailableIPs,
  getGuacamoleUserAvailableIPs,
} from '../controllers/ip.controller';

const router: Application = Router();

router.get('/', getGuacamoleUserAvailableIPs);
router.put('/', changeSingleGuacamoleUserAvailableIPs);

export default router;
