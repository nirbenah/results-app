import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getDb } from '../../shared/db';
import { config } from '../../shared/config';
import { BadRequestError, ConflictError, UnauthorizedError } from '../../shared/errors';
import { publishEvent } from '../../shared/events/publish';
import { EventNames } from '../../shared/events/types';

const SALT_ROUNDS = 10;

interface AuthResult {
  token: string;
  user: { id: string; username: string };
}

function signToken(userId: string): string {
  return jwt.sign({ user_id: userId }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  } as jwt.SignOptions);
}

export async function register(
  username: string,
  email: string,
  password: string,
): Promise<AuthResult> {
  if (!username || !email || !password) {
    throw new BadRequestError('VALIDATION', 'username, email, and password are required');
  }

  const db = getDb();
  const existing = await db('users')
    .where({ email })
    .orWhere({ username })
    .first();

  if (existing) {
    const field = existing.email === email ? 'email' : 'username';
    throw new ConflictError('DUPLICATE_USER', `A user with this ${field} already exists`);
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const [user] = await db('users')
    .insert({ username, email, password_hash: passwordHash })
    .returning(['id', 'username']);

  // Give the new user a signup bonus of 1000 credits
  await db('wallet_transactions').insert({
    user_id: user.id,
    type: 'signup_bonus',
    amount: 1000,
    direction: 'credit',
    reference_id: user.id,
  });

  return {
    token: signToken(user.id),
    user: { id: user.id, username: user.username },
  };
}

export async function login(email: string, password: string): Promise<AuthResult> {
  if (!email || !password) {
    throw new BadRequestError('VALIDATION', 'email and password are required');
  }

  const db = getDb();
  const user = await db('users').where({ email }).first();

  if (!user) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    throw new UnauthorizedError('Invalid email or password');
  }

  return {
    token: signToken(user.id),
    user: { id: user.id, username: user.username },
  };
}
