import { Application, Router } from 'express';
import { Request, Response } from 'express';
import { createGroup, deleteGroupByName, listGroups } from '@/services/group.service';

const router: Router = Router();

router.get('/', async (_: Request, res: Response) => {
  try {
    const data = await listGroups();
    res.json({ success: true, data });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { name } = req.body as { name: string };
    if (!name?.trim()) return res.status(400).json({ success: false, message: 'name required' });
    const data = await createGroup(name.trim());
    res.status(201).json({ success: true, data });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.delete('/:name', async (req: Request, res: Response) => {
  try {
    const name = req.params.name;
    await deleteGroupByName(name);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message });
  }
});

export default router;
