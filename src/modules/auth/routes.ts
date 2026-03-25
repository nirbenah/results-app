import { Router, Request, Response, NextFunction } from 'express';
import * as authService from './service';
import { getDb } from '../../shared/db';
import { BadRequestError, UnauthorizedError, NotFoundError } from '../../shared/errors';

const router = Router();

router.post('/auth/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { username, email, password } = req.body;
    const result = await authService.register(username, email, password);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/auth/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;
    const result = await authService.login(email, password);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

// ─── Profile endpoints (require auth — userId set by middleware) ───

// GET /v1/me — Get own profile
router.get('/me', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId;
    if (!userId) throw new UnauthorizedError();

    const user = await getDb()('users')
      .where('id', userId)
      .select('id', 'username', 'email', 'avatar_url', 'role', 'created_at')
      .first();
    if (!user) throw new NotFoundError('User');
    res.json(user);
  } catch (err) {
    next(err);
  }
});

// PUT /v1/me — Update own profile (avatar_url, username)
router.put('/me', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId;
    if (!userId) throw new UnauthorizedError();

    const { avatar_url, username } = req.body;
    const updates: Record<string, unknown> = {};
    if (avatar_url !== undefined) updates.avatar_url = avatar_url;
    if (username !== undefined) {
      if (!username || username.trim().length < 2) {
        throw new BadRequestError('VALIDATION', 'Username must be at least 2 characters');
      }
      // Check uniqueness
      const existing = await getDb()('users')
        .where('username', username.trim())
        .whereNot('id', userId)
        .first();
      if (existing) {
        throw new BadRequestError('USERNAME_TAKEN', 'This username is already taken');
      }
      updates.username = username.trim();
    }

    if (Object.keys(updates).length === 0) {
      throw new BadRequestError('VALIDATION', 'Nothing to update');
    }

    const [user] = await getDb()('users')
      .where('id', userId)
      .update(updates)
      .returning(['id', 'username', 'email', 'avatar_url', 'role', 'created_at']);
    res.json(user);
  } catch (err) {
    next(err);
  }
});

export { router };
