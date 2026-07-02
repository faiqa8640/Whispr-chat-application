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
