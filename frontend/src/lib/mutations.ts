// ─── Auth Mutations ───────────────────────────────────────────────────────────

// MUTATION OF SIGNUP
export const SIGNUP_MUTATION = /* GraphQL */ `
  mutation Signup($name: String!, $email: String!, $password: String!) {
    signup(name: $name, email: $email, password: $password) {
      success
      message
    }
  }
`;

export const VERIFY_OTP_MUTATION = /* GraphQL */ `
  mutation VerifyOtp($email: String!, $otp: String!) {
    verifyOtp(email: $email, otp: $otp) {
      user {
        id
        name
        email
        provider
        avatar
        isVerified
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

export const LOGIN_MUTATION = /* GraphQL */ `
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password) {
      user {
        id
        name
        email
        provider
        avatar
        isVerified
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

export const UPDATE_PROFILE_MUTATION = /* GraphQL */ `
  mutation UpdateProfile($name: String, $avatar: String) {
    updateProfile(name: $name, avatar: $avatar) {
      id
      name
      email
      provider
      avatar
      isVerified
      createdAt
      updatedAt
    }
  }
`;

// ─── Queries ──────────────────────────────────────────────────────────────────

export const ME_QUERY = /* GraphQL */ `
  query Me {
    me {
      id
      name
      email
      provider
      avatar
      isVerified
      createdAt
      updatedAt
    }
  }
`;

// ─── For conversation ──────────────────────────────────────────────────────────────────

export const FIND_USER_BY_EMAIL_QUERY = /* GraphQL */ `
  query FindUserByEmail($email: String!) {
    findUserByEmail(email: $email) { id name email avatar }
  }
`;

export const CONVERSATIONS_QUERY = /* GraphQL */ `
  query Conversations {
    conversations {
      partner { id name email avatar }
      lastMessage { id content createdAt read deleted sender { id } }
      unreadCount
    }
  }
`;

export const MESSAGES_QUERY = /* GraphQL */ `
  query Messages($withUserId: ID!, $limit: Int) {
    messages(withUserId: $withUserId, limit: $limit) {
      id content createdAt read deleted
      sender { id name avatar }
      receiver { id name avatar }
      replyTo { id content deleted sender { id name avatar } }
    }
  }
`;

export const SEND_MESSAGE_MUTATION = /* GraphQL */ `
  mutation SendMessage($receiverId: ID!, $content: String!, $replyToId: ID) {
    sendMessage(receiverId: $receiverId, content: $content, replyToId: $replyToId) {
      id content createdAt read deleted
      sender { id name avatar }
      receiver { id name avatar }
      replyTo { id content deleted sender { id name avatar } }
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

export const MESSAGE_RECEIVED_SUBSCRIPTION = /* GraphQL */ `
  subscription MessageReceived {
    messageReceived {
      id content createdAt read deleted
      sender { id name avatar }
      receiver { id name avatar }
      replyTo { id content deleted sender { id name avatar } }
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
      id content createdAt read deleted
      sender { id name avatar }
      receiver { id name avatar }
    }
  }
`;