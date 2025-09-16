import { Router } from 'express';
import ipRoutes from './ip.routes';
import groupsRouter from './groups.routes';

const apiRoutes: Router = Router();

apiRoutes.use('/guacamole-ip', ipRoutes);
apiRoutes.use('/guacamole-groups', groupsRouter);

export default apiRoutes;
