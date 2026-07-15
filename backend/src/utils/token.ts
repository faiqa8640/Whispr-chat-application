import jwt from "jsonwebtoken";
import crypto from "crypto";
import { ENV } from "../config/env.js";
import { Response } from "express";

// ─── JWT ──────────────────────────────────────────────────────────────────────
export function signToken(userId: string): string { // CREATE JWT TOKEN
  // jwt.sign ->function provided by the jsonwebtoken library.
  // jwt.sign ->create a token. digitally sign it and return it
  // id:userid-> is a payload that stored inside the token
  // jwt secret works -> payload+secret key -> jwt token
  return jwt.sign({ id: userId }, ENV.JWT_SECRET, {
    expiresIn: ENV.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],// it expires in  7 d
  });
}


// verifyToken() checks whether the JWT is valid and extracts the data stored inside it.
export function verifyToken(token: string): { id: string } {
  // This function returns an object that contains an id property.
  // verify() function from the jsonwebtoken library.
  // function isto check -> 1) Check whether the token is genuine.
  // 2)Check whether it has expired.
  // 3) If everything is correct, return the payload inside the token.
  return jwt.verify(token, ENV.JWT_SECRET) as { id: string };
}

// COOKIES FUNCTION_______________________________________________________
// Attach JWT to httpOnly cookie
// this function does:
// Take the JWT token and store it inside the user's browser as a cookie
export function attachCookie(res: Response, token: string): void {
  const isProd = ENV.NODE_ENV === "production"; // check that we are in production mode -> if yes so return true
  res.cookie("delina_token", token, {// res.cookies -> it send cookies to the browser
    // delina_ token -> is the name of the cookie
    // token is the jwt token 
    httpOnly: true,// very importanat security setting
    // it means that javascript running in the background cant read it 
    // like without it -> doing document.cookies -> it will give the cookies 
    // but if we do this the cookies will not be acessable to the javascript 
    // and even if we do document.cookies -> the cookies wont apear

    secure: isProd,// this means that only send this cookies over https
    // // It controls when browsers send cookies across different websites
    // if true -> strict => cookie is send only when the request originate from the same site
    //  and if  request is originated from another website then it is not send
    // lax -> is is kind of bit more relaxed 
    sameSite: isProd ? "strict" : "lax",
    // The cookie is still protected in most cross-site situations, but it allows some safe navigation scenarios (such as clicking a normal link to your site).

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
  d.setMinutes(d.getMinutes() + ENV.OTP_EXPIRES_MINUTES);
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
