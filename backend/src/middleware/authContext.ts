import { Request, Response } from "express";
import { verifyToken } from "../utils/token.js";
import User, { IUser } from "../models/User.js";

export interface AuthContext {
  req: Request;
  res: Response;
  user: IUser | null;
}

export async function buildContext({
  req,
  res,
}: {
  req: Request;
  res: Response;
}): Promise<AuthContext> {
  let user: IUser | null = null;

  try {
    const token: string | undefined = req.cookies?.delina_token;
    if (token) {
      const decoded = verifyToken(token);
      // .lean ->Return a plain JavaScript object, not a full Mongoose document.
      // without it ->will return the db document with extra methods
      user = await User.findById(decoded.id).lean() as IUser | null;

      // A deleted account's cookie may still be technically valid (it
      // hasn't expired yet) — treat it as unauthenticated regardless, so
      // a deleted user can't query/mutate anything even with an old
      // cached cookie.
      if (user?.isDeleted) {
        user = null;
      }
    }
  } catch {
    // Invalid / expired token — context user stays null
  }

  return { req, res, user };
}

// Guard: throws if not authenticated
export function requireAuth(context: AuthContext): IUser {
  if (!context.user) {
    throw new Error("UNAUTHENTICATED: You must be logged in.");
  }
  return context.user;
}