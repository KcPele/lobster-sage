import { Router, Request, Response } from 'express';
import { LobsterSage } from '../../LobsterSage';

export function createSocialRoutes(getSage: () => LobsterSage | null): Router {
  const router = Router();

  // Post a cast to Farcaster
  router.post('/farcaster/post', async (req: Request, res: Response) => {
    try {
      const { text } = req.body;
      if (!text) {
        res.status(400).json({ error: 'text is required' });
        return;
      }
      const result = await getSage()!.postToFarcaster(text);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Post a thread (multiple connected casts) to Farcaster
  router.post('/farcaster/thread', async (req: Request, res: Response) => {
    try {
      const { casts } = req.body;
      if (!casts || !Array.isArray(casts) || casts.length === 0) {
        res.status(400).json({ error: 'casts array is required (array of strings)' });
        return;
      }
      const result = await getSage()!.postFarcasterThread(casts);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
