import { Request, Response, Router, NextFunction } from 'express';
import * as service from './service';

const router = Router();

// GET /v1/groups — List my groups
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId!;
    const groups = await service.listMyGroups(userId);
    res.status(200).json({ groups });
  } catch (err) {
    next(err);
  }
});

// POST /v1/groups — Create group
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId!;
    const { name, scoring_format, allowed_bet_types, competition_ids } = req.body;
    const result = await service.createGroup(userId, {
      name,
      scoring_format,
      allowed_bet_types,
      competition_ids,
    }, req.correlationId);
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

// POST /v1/groups/:groupId/members — Invite user (commissioner only)
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

// POST /v1/groups/:groupId/join — Self-join (no commissioner needed)
router.post('/:groupId/join', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId!;
    const result = await service.joinGroup(
      req.params.groupId as string,
      userId,
      req.correlationId
    );
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// DELETE /v1/groups/:groupId/members/:userId — Remove member (commissioner only)
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

// POST /v1/groups/:groupId/competitions — Add competition (commissioner only)
router.post('/:groupId/competitions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId!;
    const { competition_id } = req.body;
    const result = await service.addCompetition(
      req.params.groupId as string,
      userId,
      competition_id,
      req.correlationId
    );
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// DELETE /v1/groups/:groupId/competitions/:competitionId — Remove competition (commissioner only)
router.delete('/:groupId/competitions/:competitionId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId!;
    await service.removeCompetition(
      req.params.groupId as string,
      userId,
      req.params.competitionId as string,
      req.correlationId
    );
    res.status(204).send();
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
