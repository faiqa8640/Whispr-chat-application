import { Request, Response } from "express";
// these are the express types :
//req => conatin the header , cookies, body ,params
// res => it is used to send the response back 
import { verifyToken } from "../utils/token";
// we import the verify token => that is used to verify the token 

import User, { IUser } from "../models/User";
// we import the user model and the user interface from the user

// ----------INTERFACE-------
// AUTHINTERFACE
// ---------------------------
export interface AuthContext {
  req: Request;
  res: Response;
  user: IUser | null;
}

// --------------
// BUILD CONTEXT FUNCTION -> this function is kind of used to make the authcontext 
// ----------------
// -> this function is used to verify the user and authenticate it

export async function buildContext({
  req,
  res,
}: {
  req: Request;// take the express req and responce object directly
  res: Response;
}): Promise<AuthContext> {//this function return the authcontext ->(req, res ,user)
  // but as is a asyn (Should return the promise )
  // so the things is that it return the authcontext inside the promise 
  let user: IUser | null = null;// the user can contain the actual user or the initionally it return the null

  try {

    // the browser send the cookies okay  with the upcoming request
    // remember in cookies we store the jwt token i.e delina_token : "abc123"
    // ?. => if the cookies exist => return the token else return the undefined
    const token: string | undefined = req.cookies?.delina_token;
    
    if (token) {// if token exist 
      // then we call the verify the token 
      // decoded contain the id of the user 
      const decoded = verifyToken(token); 

      // get the user whoese id is stored into the db 
      // .lean ->Return a plain JavaScript object, not a full Mongoose document.
      // .lean -> help us to return only the useful methods
      // without it ->will return the db document with extra methods
      user = await User.findById(decoded.id).lean() as IUser | null;

      // if the user is deleted and cookies still exist so we check that
      // if the user is deleted => so set user=nulll
      if (user?.isDeleted) {
        user = null;
      }
    }
  } catch {
    // Invalid / expired token — context user stays null
  }

  return { req, res, user };//return the authcontext=> this become the graphql context 
}


// --------------
// REQUIREAUTH
// -------------
// => this function => ans one question =>is this user loggined in?
// if yes =>> continue
// else => stop everything 
export function requireAuth(context: AuthContext): IUser {
  if (!context.user) {// if the context dont contain the user => null
    // in that case return the error
    throw new Error("UNAUTHENTICATED: You must be logged in.");
  }
  return context.user;// otherwise return that user 
}