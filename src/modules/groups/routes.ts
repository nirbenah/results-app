import { Request, Response, Router, NextFunction } from 'express';
import * as service from './service';

const router = Router();

// POST /v1/groups — Create group
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId!;
    const { name } = req.body;
    const result = await service.createGroup(userId, name, req.correlationId);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// GET /v1/groups/:groupId — Get group details
router.get('/:groupId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await service.getGroup(req.params.groupId as string);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

// POST /v1/groups/:groupId/members — Invite user
router.post('/:groupId/members', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId!;
    const { user_id } = req.body;
    const result = await service.addMember(
      req.params.groupId as string,
      userId,
      user_id,
      req.correlationId
    );
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// DELETE /v1/groups/:groupId/members/:userId — Remove member
router.delete('/:groupId/members/:userId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requesterId = req.userId!;
    await service.removeMember(
      req.params.groupId as string,
      requesterId,
      req.params.userId as string,
      req.correlationId
    );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// POST /v1/groups/:groupId/season — Start season
router.post('/:groupId/season', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId!;
    const { competition_id, starts_at, ends_at } = req.body;
    const result = await service.startSeason(
      req.params.groupId as string,
      userId,
      { competition_id, starts_at, ends_at },
      req.correlationId
    );
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// PATCH /v1/groups/:groupId/season/status — Activate or finish season
router.patch('/:groupId/season/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId!;
    const { status } = req.body;
    const result = await service.updateSeasonStatus(
      req.params.groupId as string,
      userId,
      status,
      req.correlationId
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

// GET /v1/groups/:groupId/leaderboard
router.get('/:groupId/leaderboard', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await service.getLeaderboard(req.params.groupId as string);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

export { router };
