export const typeDefs = /* GraphQL SCHEMAS -> LANGUAGE USE HERE IS GraphQL Schema Language (SDL).*/ `
  # ─── Scalars / Enums ─────────────────────────────────────────────────────────
  scalar DateTime

  enum AuthProvider {
    local
    google
  }

  enum MessageType {
    text
    image
    voice
  }

  # ─── Types ───────────────────────────────────────────────────────────────────
  type User {
    id: ID!
    name: String!
    email: String!
    provider: AuthProvider!
    avatar: String
    isVerified: Boolean!
    """Whether this user currently has at least one live connection (a tab/device open)."""
    isOnline: Boolean!
    """When this user's last connection dropped. Null while they're online, or if never recorded."""
    lastSeen: DateTime
    """True if this account has been deleted — profile is scrubbed and rendered as 'Deleted User'."""
    isDeleted: Boolean!
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

  """
  A lightweight snapshot of the message being replied to — shown as the
  quoted preview above a reply, WhatsApp-style. Deliberately smaller than
  the full Message type (no receiver/read/createdAt) since the preview
  only needs who said it and what it said.
  """
  type ReplyPreview {
    id: ID!
    sender: User!
    content: String!
    type: MessageType!
    mediaUrl: String
    deleted: Boolean!
  }

  """
  A single emoji reaction on a message — WhatsApp/Instagram-style. One
  reaction per user per message; the sender picks which emoji it is.
  """
  type Reaction {
    emoji: String!
    user: User!
  }

  type Message {
    id: ID!
    sender: User!
    receiver: User!
    content: String!
    type: MessageType!
    mediaUrl: String
    mediaDuration: Int
    read: Boolean!
    deleted: Boolean!
    createdAt: DateTime!
    replyTo: ReplyPreview
    """Emoji reactions currently on this message."""
    reactions: [Reaction!]!
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

  type TypingStatus {
    userId: ID!
    receiverId: ID!
    isTyping: Boolean!
  }

  """
  Online/offline presence for a single user, used both for the initial
  fetch (userStatus query) and live updates (userStatusChanged subscription).
  """
  type UserStatus {
    userId: ID!
    isOnline: Boolean!
    lastSeen: DateTime
    """True if this account has been deleted — the frontend should lock the conversation to read-only."""
    isDeleted: Boolean!
  }


  

  # ─── Query ───────────────────────────────────────────────────────────────────
  type Query {
    """Returns the currently authenticated user."""
    me: User

    findUserByEmail(email: String!): User
    conversations: [Conversation!]!
    messages(withUserId: ID!, limit: Int): [Message!]!

    """Current online/offline status + last seen for a single user."""
    userStatus(userId: ID!): UserStatus!
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

    """
    Permanently deletes the caller's account. Their profile is scrubbed and
    rendered as "Deleted User" everywhere it's referenced (sidebar rows,
    message bubbles, reply previews). Existing message history is preserved
    for the other participant, but nobody can message this account again,
    and it can never log back in.
    """
    deleteAccount: MessagePayload!


    # ── Message ────────────────────────────────────────────────────────────────────
    """
    Send a message. Pass replyToId to quote an earlier message in this
    same conversation — WhatsApp-style reply.
    """
    sendMessage(receiverId: ID! content: String type: MessageType = text mediaKey: String mediaDuration: Int replyToId: ID): Message!
    markConversationRead(withUserId: ID!): Boolean!

    """
    Unsend (soft-delete) a message you sent. Wipes the content server-side
    and marks it deleted — like Instagram's "Unsend".
    """
    unsendMessage(messageId: ID!): Message!


    """
    Notify the other participant that you started/stopped typing in a
    conversation — Instagram/WhatsApp-style live typing indicator.
    """
    setTyping(receiverId: ID!, isTyping: Boolean!): Boolean!

    """
    Add, change, or remove your emoji reaction on a message —
    WhatsApp/Instagram-style. Tapping the same emoji you already reacted
    with removes it; tapping a different emoji swaps your reaction.
    Returns the updated message with its full reactions list.
    """
    toggleReaction(messageId: ID!, emoji: String!): Message!
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

    """
    Emitted whenever a message is unsent, so the other participant's
    client can immediately swap the bubble for the "unsent" placeholder.
    """
    messageUnsent: Message!

    """
    Emitted when someone starts/stops typing to you, so your client can
    show the animated "..." indicator in real time.
    """
    typingStatus: TypingStatus!

    """
    Emitted whenever any user goes online or offline, so open chats and
    the sidebar can update presence dots / "last seen" text live.
    """
    userStatusChanged: UserStatus!


    """
    Emitted when a voice message that was playing from a temporary local
    stream finishes uploading to S3, so the client can swap its audio
    source to the permanent URL without a refresh.
    """
    messageEdited: Message!

    """
    Emitted whenever a message's reactions change (someone reacted,
    changed, or removed their reaction), so both participants' clients
    can update the reaction pills live.
    """
    messageReactionUpdated: Message!
  }
`;