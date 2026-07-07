import dotenv from "dotenv";
dotenv.config();

export const ENV = {
  // Server
  PORT: parseInt(process.env.PORT || "5000", 10),
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
};