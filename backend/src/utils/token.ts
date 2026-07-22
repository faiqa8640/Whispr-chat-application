import jwt from "jsonwebtoken";// used for creating and verifing jwt
import crypto from "crypto";//thisis builtin security library
// and it is used for gernerating secure random values => i.e password reset tokedn etc
import { ENV } from "../config/env";
import { Response } from "express";

// ─── JWT ──────────────────────────────────────────────────────────────────────
// CREATE A JWT TOKEN 
// -> input the user id and output the jwt token
export function signToken(userId: string): string { // CREATE JWT TOKEN
  // jwt.sign ->function provided by the jsonwebtoken library.
  // jwt.sign ->create a token. digitally sign it and return it
  // id:userid-> is a payload that stored inside the token
  // id:userid => is stored inside the token and it is not encrypted but it is only signed  
  // payload+secret key => jwt token
  // the secret key => is only known by the backend and not by the frontend or hacker
  // expiresIn => is and options=> it tells jwt that how it shoulf behave
  // Options → Extra settings such as when the token expires.
  // Secret Key → Used to digitally sign the token so it can't be forged.
  // expires in 7 days 
  // jwt.signoptions["expiresin"] => is this a valid expiresin string => yes => is just a javascript type 
  return jwt.sign({ id: userId }, ENV.JWT_SECRET, {
    expiresIn: ENV.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],// it expires in  7 d
  });
}

// verifyToken() → Opens that JWT and checks if it is valid.
// verifyToken() checks whether the JWT is valid and extracts the data stored inside it.
// input => the token and return the user id ( the payload )

export function verifyToken(token: string): { id: string } {
  // This function returns an object that contains an id property.
  // verify() function from the jsonwebtoken library.
  // function isto check -> 1) Check whether the token is genuine.
  // 2)Check whether it has expired.  3)is the signature correct
  // If everything is correct, return the payload inside the token.
  // this function returns the id of the user 
  return jwt.verify(token, ENV.JWT_SECRET) as { id: string };
}

// COOKIES FUNCTION_______________________________________________________
// attachCookie() is the function that actually sends the JWT to the browser, 
// so the browser can remember the user.
// Attach JWT to httpOnly cookie
// this function does:
// Take the JWT token and store it inside the user's browser as a cookie
export function attachCookie(res: Response, token: string): void {
  // using the response as we are sending from server to browser
  // token => jwt token 
  const isProd = ENV.NODE_ENV === "production"; // check that we are in production mode -> if yes so return true
  // if we are in development => return false 
  // basically in production the some cookie setting change therefore we check it 
  res.cookie("delina_token", token, {// res.cookies -> it send cookies to the browser
    // delina_ token -> is the name of the cookie
    // token is the jwt token 

    //SET OF RULESS::-----------------
    httpOnly: true,// very importanat security setting
    // without it javascript running in the  browser could read the cookies 
    // it means that javascript running in the background cant read it 
    // like without it -> doing document.cookies -> it will give the cookies 
    // but if we do this the cookies will not be acessable to the javascript 
    // so you can say that httpOnly:true=>the browser hides this cookie from JavaScript.
    // and even if we do document.cookies -> the cookies wont apear


    //secure = true => if porduction => in that case  only https is alloweded  and http is not allowed
    // means if someone tried http => cookies wont be send 
    // if secure =false => in that case http and https is allowed
    secure: isProd,

    //This controls when the browser sends the cookie.
    // In production (true) => sameSite = strict => only requests that comes from your own site
    // i.e request from whipr.com => cookies send  else cookies not send
    // during developmenet (false) =>  this is less strict =>coz development often involve 
    // diff local ports(frontend and backend )
    sameSite: isProd ? "strict" : "lax",
    // The cookie is still protected in most cross-site situations, but it allows some safe navigation scenarios (such as clicking a normal link to your site).


    //max age of the cookies => lives 7 days or 604800000 milliseconds 
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms-> this tells that how long will the cookie save in the browser
  });
}

export function clearCookie(res: Response): void {
  res.clearCookie("delina_token"); // is useed to clear cookie
}

// ─── OTP ──────────────────────────────────────────────────────────────────────
export function generateOtp(): string {
  // 6-digit numeric OTP
  return Math.floor(100000 + Math.random() * 900000).toString();
  // Math.random -> generate a random number btw 0 and 0.999999.. i.e 0.542
  // after that random number *900000 -> so the num will be from 0 to 899999}
  // now adding the 100000 ->  coz we want  our otp to be 6 digit number
  // sometime the number  can be 5678 to make it 6 digit number we add 100000 -> so automaically the number become 6 digit
  // math.floor => it remove the decimal part i.e 123455.789 => it become 123455
  // and in the end we convert the otp number into string as we need to return the string
}

// this function tell when this otp should expire
export function otpExpiryDate(): Date {  // return a date object
  const d = new Date(); 
  // Creates a Date object containing the current date and time.
  d.setMinutes(d.getMinutes() + ENV.OTP_EXPIRES_MINUTES); //otp expires in 20 mintures 
  // d.getmintues -> it return the current mintues i.e 10:30  times -> so return 30
  // now the  ENV.OTP_EXPIRES_MINUTES this tell when the opt will expire 
  // now adding both of them -> so 30+10 =40
  // d.setmintues ->change the time now 10:30 becomes 10:40
  // and then we return the date -> such as 15 July 2026 10:40 AM -> the token will expire at this time
  return d;
}

// ─── Password reset token ─────────────────────────────────────────────────────
//This is used for the Forgot Password feature
export function generateResetToken(): string {
  return crypto.randomBytes(32).toString("hex");
  // crypto.randombytes -> generates cryptographically secure random bytes. 
  // and it is more secure than the math.random 
  //32-> genarate 32 random bytes
  // convert those bytes into string 
}


// this function tells => "When should the password reset link expire?"
export function resetTokenExpiryDate(): Date { // as it will expire in 1 hour 
  const d = new Date();// get the date 
  d.setHours(d.getHours() + 1); 
  // get the current hour and add 1 to it and set the hour to it =>  i.e 5:20 =>5+1 =>6
  // hence return the date => i.e 15 july 2026 6:30 =>  this tell when the reset token will expire 
  return d;
}
