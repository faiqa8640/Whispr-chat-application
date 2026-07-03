export const typeDefs = /* GraphQL SCHEMAS -> LANGUAGE USE HERE IS GraphQL Schema Language (SDL).*/ `
  # ─── Scalars / Enums ─────────────────────────────────────────────────────────
  scalar DateTime

  enum AuthProvider {
    local
    google
  }

  # ─── Types ───────────────────────────────────────────────────────────────────
  type User {
    id: ID!
    name: String!
    email: String!
    provider: AuthProvider!
    avatar: String
    isVerified: Boolean!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type AuthPayload {
    user: User!
    message: String!
  }

  type MessagePayload {
    success: Boolean!
    message: String!
  }

  type Message {
    id: ID!
    sender: User!
    receiver: User!
    content: String!
    read: Boolean!
    createdAt: DateTime!
  }

  type Conversation {
    partner: User!
    lastMessage: Message
    unreadCount: Int!
  }

  """
  Emitted when someone opens a conversation and their unread messages
  get marked as read, so the original sender's client can flip their
  tick marks live instead of waiting for a refresh.
  """
  type MessagesReadPayload {
    """The id of the person who just read the messages."""
    readerId: ID!
    """The id of the person whose messages were marked as read (the original sender)."""
    conversationWith: ID!
  }

  # ─── Query ───────────────────────────────────────────────────────────────────
  type Query {
    """Returns the currently authenticated user."""
    me: User

    findUserByEmail(email: String!): User
    conversations: [Conversation!]!
    messages(withUserId: ID!, limit: Int): [Message!]!

  }

  # ─── Mutations ───────────────────────────────────────────────────────────────
  type Mutation {
    # ── Local auth ──────────────────────────────────────────────────────────────
    """
    Register a new user. Creates account (isVerified=false) and sends OTP email.
    """
    signup(name: String!, email: String!, password: String!): MessagePayload!

    """
    Verify email with the 6-digit OTP sent after signup.
    Returns the authenticated user + sets httpOnly cookie.
    """
    verifyOtp(email: String!, otp: String!): AuthPayload!

    """
    Resend the OTP verification code.
    """
    resendOtp(email: String!): MessagePayload!

    """
    Login with email + password.
    Returns the authenticated user + sets httpOnly cookie.
    Requires isVerified=true.
    """
    login(email: String!, password: String!): AuthPayload!

    """
    Logout — clears the httpOnly cookie.
    """
    logout: MessagePayload!

    # ── Google OAuth ─────────────────────────────────────────────────────────────
    """
    Authenticate / register via Google Identity Services credential token.
    Verifies the token server-side, upserts the user, sets httpOnly cookie.
    """
    googleAuth(idToken: String!): AuthPayload!

    # ── Forgot / Reset Password ───────────────────────────────────────────────────
    """
    Send a password-reset link to the given email address.
    """
    forgotPassword(email: String!): MessagePayload!

    """
    Reset the password using the token from the reset link.
    """
    resetPassword(token: String!, newPassword: String!): MessagePayload!

    # ── Profile ────────────────────────────────────────────────────────────────────
    """
    Update the logged-in user's profile.
    """
    updateProfile(name: String, avatar: String): User!


    # ── Message ────────────────────────────────────────────────────────────────────
    sendMessage(receiverId: ID!, content: String!): Message!
    markConversationRead(withUserId: ID!): Boolean!
  }


  # ── SUBSCRIPTION ────────────────────────────────────────────────────────────────────
  type Subscription {
    messageReceived: Message!
    messagesRead: MessagesReadPayload!
    """
    Emitted whenever any user updates their profile (name and/or avatar),
    so other clients currently viewing that user (sidebar row or an open
    chat) can update live without a refresh.
    """
    userUpdated: User!
  }
`;
