// basically your backend starts => it load .env file and load all the variables 
// and store them in the inside env 
// and other file then can use these variable

// dotenv => is the library that is used to read the files from the .env 


import dotenv from "dotenv";//dotenv is to read the values stored inside your .env file.
dotenv.config();//read the .env file and load all the variables 


const PORT = parseInt(process.env.PORT || "5000", 10);
// process.env.PORT = 5000 => is the port where the backend run
// it is a string not a number => so using the parseInt we convert it into the number
// it is string coz everything in the .env is stored as a text 
// 10 => it tells the javascript to read a number using the base 10 (Decimal)
// parseInt("5000",10)=> becomes 5000

export const ENV = {
  // Server
  PORT,
  NODE_ENV: process.env.NODE_ENV || "development",

  // MongoDB
  MONGO_URI: process.env.MONGO_URI || "mongodb://localhost:27017/delinadb",

  // JWT
  JWT_SECRET: process.env.JWT_SECRET || "myjwtsecretkey123",
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d",

  // Frontend URL
  CLIENT_URL: process.env.CLIENT_URL || "http://localhost:5173",

  // Gmail SMTP
  EMAIL_USER: process.env.EMAIL_USER || "",
  EMAIL_PASS: process.env.EMAIL_PASS || "",

  // OTP
  OTP_EXPIRES_MINUTES: parseInt(process.env.OTP_EXPIRES_MINUTES || "10", 10),

  // Google OAuth
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || "",

  // AWS S3 (For image and voice sharing)
  AWS_REGION: process.env.AWS_REGION || "us-east-1",
  AWS_BUCKET_NAME: process.env.AWS_BUCKET_NAME || "",
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID || "",
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY || "",

  // Base URL the browser uses to reach this backend directly — needed to
  // build an absolute URL for the temporary local voice-message stream,
  // since the frontend runs on a different origin.
  PUBLIC_API_URL: process.env.PUBLIC_API_URL || `http://localhost:${PORT}`,
  // This is the base URL that browsers use to reach your backend.
};