# WHISPR — Chat Application

A full-stack one-to-one messaging application where authenticated users can start a conversation by entering another registered user’s email address, send messages, view their inbox, and reply to received messages.

## Features

* User signup and login
* Google authentication
* Email-based user search
* Start a new conversation using receiver email
* Send and receive one-to-one messages
* Inbox with previous conversations
* View message history
* Reply within an existing conversation
* Password reset for local email/password accounts
* Secure JWT authentication using HTTP-only cookies

## Tech Stack

### Frontend

* React
* TypeScript
* Vite
* Tailwind CSS
* Apollo Client

### Backend

* Node.js
* Express.js
* TypeScript
* GraphQL
* Apollo Server
* MongoDB
* Mongoose
* JWT Authentication
* Google OAuth

## Project Structure

```text
vibelink-chat-app/
├── frontend/        # React frontend
├── backend/         # Node.js, Express, GraphQL backend
├── README.md
└── .gitignore
```

## Core User Flow

1. A user signs up or logs in.
2. The user clicks **Send New Message**.
3. The user enters the receiver’s registered email address.
4. The system finds the receiver and creates or opens a conversation.
5. The sender writes and sends a message.
6. The receiver logs in, sees the conversation in the inbox, and replies.

## Setup Instructions

### 1. Clone the repository

```bash
git clone <your-repository-url>
cd whispr-chat-app
```

### 2. Install dependencies

```bash
cd frontend
npm install

cd ../backend
npm install
```

### 3. Configure environment variables

Create a `.env` file inside the `backend` folder:

```env
PORT=5000
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
CLIENT_URL=http://localhost:5173
GOOGLE_CLIENT_ID=your_google_client_id
```

### 4. Run the application

Start the backend:

```bash
cd backend
npm run dev
```

Start the frontend in another terminal:

```bash
cd frontend
npm run dev
```

## Security Notes

* Environment files are excluded through `.gitignore`.
* Passwords are hashed before being stored.
* JWT tokens are stored in HTTP-only cookies.
* Google-authenticated users do not use the local password reset flow.
