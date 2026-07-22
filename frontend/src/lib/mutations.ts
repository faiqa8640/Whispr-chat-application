// ─── Auth Mutations ───────────────────────────────────────────────────────────

// MUTATION OF SIGNUP
export const SIGNUP_MUTATION = /* GraphQL 
=> uses the backteacks as it create a template string 
signup()=> this calls the resolver */ `
  mutation Signup($name: String!, $email: String!, $password: String!) {
    signup(name: $name, email: $email, password: $password) {
      success
      message
    }
  }
`;

export const VERIFY_OTP_MUTATION = /* GraphQL  
=> it calls the verifyotp resolver 
=> after verfication => you need a login user so we get the login use and mes
=> return authpayload */ `
  mutation VerifyOtp($email: String!, $otp: String!) {
    verifyOtp(email: $email, otp: $otp) {
      user {
        id
        name
        email
        provider
        avatar
        isVerified
        isOnline
        lastSeen
        createdAt
        updatedAt
      }
      message
    }
  }
`;

export const RESEND_OTP_MUTATION = /* GraphQL */ `
  mutation ResendOtp($email: String!) {
    resendOtp(email: $email) {
      success
      message
    }
  }
`;

export const LOGIN_MUTATION = /* GraphQL 
=> return authpayload=> user+ msg*/ `
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password) {
      user {
        id
        name
        email
        provider
        avatar
        isVerified
        isOnline
        lastSeen
        createdAt
        updatedAt
      }
      message
    }
  }
`;

export const LOGOUT_MUTATION = /* GraphQL */ `
  mutation Logout {
    logout {
      success
      message
    }
  }
`;

export const GOOGLE_AUTH_MUTATION = /* GraphQL */ `
  mutation GoogleAuth($idToken: String!) {
    googleAuth(idToken: $idToken) {
      user {
        id
        name
        email
        provider
        avatar
        isVerified
        isOnline
        lastSeen
        createdAt
        updatedAt
      }
      message
    }
  }
`;

export const FORGOT_PASSWORD_MUTATION = /* GraphQL */ `
  mutation ForgotPassword($email: String!) {
    forgotPassword(email: $email) {
      success
      message
    }
  }
`;

export const RESET_PASSWORD_MUTATION = /* GraphQL */ `
  mutation ResetPassword($token: String!, $newPassword: String!) {
    resetPassword(token: $token, newPassword: $newPassword) {
      success
      message
    }
  }
`;

export const UPDATE_PROFILE_MUTATION = /* GraphQL 
=> return the use id,name etc */ `
  mutation UpdateProfile($name: String, $avatar: String) {
    updateProfile(name: $name, avatar: $avatar) {
      id
      name
      email
      provider
      avatar
      isVerified
      isOnline
      lastSeen
      createdAt
      updatedAt
    }
  }
`;

export const DELETE_ACCOUNT_MUTATION = /* GraphQL */ `
  mutation DeleteAccount {
    deleteAccount {
      success
      message
    }
  }
`;

// ─── Queries ──────────────────────────────────────────────────────────────────

export const ME_QUERY = /* GraphQL 
=> backend sends the logined user */ `
  query Me {
    me {
      id
      name
      email
      provider
      avatar
      isVerified
      isOnline
      lastSeen
      createdAt
      updatedAt
    }
  }
`;

// ─── For conversation ──────────────────────────────────────────────────────────────────

export const FIND_USER_BY_EMAIL_QUERY = /* GraphQL 
=> run the finduserbyemail resolver */ `
  query FindUserByEmail($email: String!) {
    findUserByEmail(email: $email) { id name email avatar }
  }
`;

export const CONVERSATIONS_QUERY = /* GraphQL */ `
  query Conversations {
    conversations {
      id
      partner: otherParticipant { id name email avatar isOnline lastSeen isDeleted }
      lastMessage { id content type createdAt read deleted sender { id } }
      unreadCount
    }
  }
`;

export const MESSAGES_QUERY = /* GraphQL */ `
  query Messages($conversationId: ID!, $limit: Int) {
    messages(conversationId: $conversationId, limit: $limit) {
      id content type mediaUrl mediaDuration createdAt read deleted edited
      sender { id name avatar isOnline lastSeen isDeleted}
      receiver { id name avatar isOnline lastSeen isDeleted}
      replyTo { id content type mediaUrl deleted sender { id name avatar } }
      reactions { emoji user { id name } }
    }
  }
`;


export const START_CONVERSATION_MUTATION = /* GraphQL */ `
  mutation StartConversation($otherUserId: ID!) {
    startConversation(otherUserId: $otherUserId)
  }
`;


// One-time fetch used when a conversation is opened — after this, live
// updates arrive via USER_STATUS_CHANGED_SUBSCRIPTION.
export const USER_STATUS_QUERY = /* GraphQL */ `
  query UserStatus($userId: ID!) {
    userStatus(userId: $userId) {
      userId
      isOnline
      lastSeen
      isDeleted
    }
  }
`;


export const SEND_MESSAGE_MUTATION = /* GraphQL */ `
  mutation SendMessage(
    $receiverId: ID!
    $content: String
    $type: MessageType
    $mediaKey: String
    $mediaDuration: Int
    $replyToId: ID
  ) {
    sendMessage(
      receiverId: $receiverId
      content: $content
      type: $type
      mediaKey: $mediaKey
      mediaDuration: $mediaDuration
      replyToId: $replyToId
    ) {
      id content type mediaUrl mediaDuration createdAt read deleted edited
      sender { id name avatar isOnline lastSeen isDeleted}
      receiver { id name avatar isOnline lastSeen isDeleted}
      replyTo { id content type mediaUrl deleted sender { id name avatar } }
      reactions { emoji user { id name } }
    }
  }
`;

export const MARK_CONVERSATION_READ_MUTATION = /* GraphQL */ `
  mutation MarkConversationRead($withUserId: ID!) {
    markConversationRead(withUserId: $withUserId)
  }
`;

// Unsend (soft-delete) a message you sent.
export const UNSEND_MESSAGE_MUTATION = /* GraphQL */ `
  mutation UnsendMessage($messageId: ID!) {
    unsendMessage(messageId: $messageId) {
      id content createdAt read deleted
      sender { id name avatar }
      receiver { id name avatar }
    }
  }
`;

// Edits the text content of a message you sent — WhatsApp/Instagram-
// style. Returns the full updated message so the caller can patch local
// state immediately without waiting on the messageEdited subscription
// round trip (that subscription still keeps the *other* participant's
// view, and any of our own other open tabs, in sync).
export const EDIT_MESSAGE_MUTATION = /* GraphQL */ `
  mutation EditMessage($messageId: ID!, $content: String!) {
    editMessage(messageId: $messageId, content: $content) {
      id content type mediaUrl mediaDuration createdAt read deleted edited
      sender { id name avatar }
      receiver { id name avatar }
      replyTo { id content type mediaUrl deleted sender { id name avatar } }
      reactions { emoji user { id name } }
    }
  }
`;

export const SET_TYPING_MUTATION = /* GraphQL */ `
  mutation SetTyping($receiverId: ID!, $isTyping: Boolean!) {
    setTyping(receiverId: $receiverId, isTyping: $isTyping)
  }
`;



export const MESSAGE_RECEIVED_SUBSCRIPTION = /* GraphQL */ `
  subscription MessageReceived {
    messageReceived {
      id content type mediaUrl mediaDuration createdAt read deleted edited
      sender { id name avatar isOnline lastSeen }
      receiver { id name avatar isOnline lastSeen }
      replyTo { id content type mediaUrl deleted sender { id name avatar } }
      reactions { emoji user { id name } }
    }
  }
`;

// Fires when someone marks their conversation with you as read — this is
// what actually lets your sent-message ticks turn gold for real, instead
// of the old (buggy) guess of "you just sent something so mark it read".
export const MESSAGES_READ_SUBSCRIPTION = /* GraphQL */ `
  subscription MessagesRead {
    messagesRead {
      readerId
      conversationWith
    }
  }
`;

// Fires whenever any user (that this client happens to know about — a
// sidebar contact or the person in the open chat) updates their profile,
// so avatars/names can update live like WhatsApp instead of requiring a
// manual refresh.
export const USER_UPDATED_SUBSCRIPTION = /* GraphQL */ `
  subscription UserUpdated {
    userUpdated {
      id
      name
      email
      provider
      avatar
      isVerified
      isOnline
      lastSeen
      isDeleted
      createdAt
      updatedAt
    }
  }
`;

// Fires whenever a message is unsent — lets the other participant's
// client swap the bubble for the "This message was unsent" placeholder
// in real time, Instagram-style.
export const MESSAGE_UNSENT_SUBSCRIPTION = /* GraphQL */ `
  subscription MessageUnsent {
    messageUnsent {
      id content type mediaUrl mediaDuration createdAt read deleted
      sender { id name avatar }
      receiver { id name avatar }
    }
  }
`;


// Fires when the person you're chatting with starts/stops typing —
// Instagram/WhatsApp-style live "..." indicator.
export const TYPING_STATUS_SUBSCRIPTION = /* GraphQL */ `
  subscription TypingStatus {
    typingStatus {
      userId
      receiverId
      isTyping
    }
  }
`;

// ─── Presence (online/offline + last seen) ────────────────────────────────────


// Fires whenever any user goes online or offline. Broadcast to every
// authenticated client — consumers filter by userId themselves, same
// pattern as USER_UPDATED_SUBSCRIPTION.
export const USER_STATUS_CHANGED_SUBSCRIPTION = /* GraphQL */ `
  subscription UserStatusChanged {
    userStatusChanged {
      userId
      isOnline
      lastSeen
    }
  }
`;


// ─── Message edit subscription ────────────────────────────────────
// Fires (1) when a voice message that was streaming from a temporary
// local URL finishes migrating to S3 — lets the client swap the <audio>
// source to the permanent link live — and (2) whenever a text message's
// content is edited (WhatsApp/Instagram-style), so both participants'
// clients can patch the bubble content + "(edited)" label live, without
// a refresh.

export const MESSAGE_EDITED_SUBSCRIPTION = /* GraphQL */ `
  subscription MessageEdited {
    messageEdited {
      id content type mediaUrl mediaDuration createdAt read deleted edited
      sender { id name avatar isOnline lastSeen isDeleted}
      receiver { id name avatar isOnline lastSeen isDeleted}
      replyTo { id content type mediaUrl deleted sender { id name avatar } }
      reactions { emoji user { id name } }
    }
  }
`;


// ─── Reactions (emoji reactions on messages, WhatsApp/Instagram-style) ─────────

// Adds, swaps, or removes (toggle-off) the caller's reaction on a message.
// Returns the full updated message so the caller can patch its own state
// immediately without waiting on the subscription round trip.
export const TOGGLE_REACTION_MUTATION = /* GraphQL */ `
  mutation ToggleReaction($messageId: ID!, $emoji: String!) {
    toggleReaction(messageId: $messageId, emoji: $emoji) {
      id content type mediaUrl mediaDuration createdAt read deleted
      sender { id name avatar }
      receiver { id name avatar }
      reactions { emoji user { id name } }
    }
  }
`;

// Fires whenever a message's reactions change (added/changed/removed),
// delivered to both participants — same pattern as MESSAGE_UNSENT /
// MESSAGE_EDITED — so both sides' reaction pills stay in sync live.
export const MESSAGE_REACTION_UPDATED_SUBSCRIPTION = /* GraphQL */ `
  subscription MessageReactionUpdated {
    messageReactionUpdated {
      id
      sender { id name avatar }
      receiver { id name avatar }
      reactions { emoji user { id name } }
    }
  }
`;