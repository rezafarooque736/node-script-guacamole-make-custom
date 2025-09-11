import { Router } from 'express';
import ipRoutes from './ip.routes';

const apiRoutes: Router = Router();

apiRoutes.use('/guacamole-ip', ipRoutes);

export default apiRoutes;
