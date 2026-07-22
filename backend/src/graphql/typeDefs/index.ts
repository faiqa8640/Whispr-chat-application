export const typeDefs = /* GraphQL SCHEMAS -> LANGUAGE USE HERE IS GraphQL Schema Language (SDL).*/ `

  # ─── Scalars / Enums ─────────────────────────────────────────────────────────
  
  # scalar---------------- 
  # graphql already knows  string , int , bool , flaot , id
  # but the graphql doestnot know the date => we create our own scalar 
  # scalar  DateTime => now the graphql understand the dates 
  # and we use it like => createdAt : DateTime not createdAt : string 
  #-----------------------

  scalar DateTime

  # ENUMS----------------------

  enum AuthProvider {
    local
    google
  }

  enum MessageType {
    text
    image
    voice
  }

  # -------------------------

  # ─── Types ───────────────────────────────────────────────────────────────────
  
  # TYPE USER-------------
  # 1)type User => means that there exist an object  called user 
  # 2)id:ID! => means every user have an id whose datatype is ID 
  # !=> required and it cant be null 
  # 3)name:String! => every user must have name and is  required 
  # 4) avatar:string => no ! it means that it is optional 
  # ***hence ! => means required and  if not ! => means optional 
  # type user => this tells exactly what the  frontned receives
  # graphql returns => {name , email}
  #---------------------------------------
  
  # DIFF BTW # VS """ --------------------------
  #  # is used for the comments => they are only for the develpers , ignored by graphql 
  # """ => are the description (documentation)=> this become the part of the graphql schema
  # it apears in the graphql  playground , appolostudel and graphql etc
  # it helps frontend developers understand  what a type or feild does 
  # documenentation is available to everyone using the graphql api 
  # ----------------------------------

  type User {
    id: ID!
    name: String!
    email: String!
    provider: AuthProvider!
    avatar: String
    isVerified: Boolean!
    isOnline: Boolean!
    lastSeen: DateTime
    isDeleted: Boolean!
    createdAt: DateTime!
    updatedAt: DateTime!
  }


  # AUTHPAYLOAD-----------------
  # when the user successfully login => backend returns this 
  # return the user and message  
  #----------------------------

  type AuthPayload {
    user: User!
    message: String!
  }


  # MESSAGEPAYLOAD ------------
  # it is used for the signup , forgort password , logout etc 
  # it returns the  success status and the message 
  #----------------------------

  type MessagePayload {
    success: Boolean!
    message: String!
  }


  # REPLYPREVIEW--------------
  #  replypreview is used when replying to the person msg 
  # like user not show the compelete message it only show the preview -> small msg kind of
  # so we use it for this purpose 
  # as we dont need to return the complete so therefore we use a smaller type 
  # things it return :
  # message id , sender (who send the original msg) , receiver , content (the original message text)
  # type: MessageType!=> this tell the user which kind of message is replied to 
  # mediaurl and deleted 
  #-----------------------------

  type ReplyPreview {
    id: ID!
    sender: User!
    content: String!
    type: MessageType!
    mediaUrl: String
    deleted: Boolean!
  }

  # REACTION --------------------
  # it is used to react to the message 
  # it return the array of the emoji (reactions)
  # the user => the user who reacted it 
  #------------------------------

  type Reaction {
    emoji: String!
    user: User!
  }

  # MESSAGE-------------------------
  # this is the messag type and define the one chat bubble 
  #--------------------------------

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
    edited: Boolean!
    createdAt: DateTime!
    replyTo: ReplyPreview
    #------------------------------
    # [Reaction] => means an array of reaction
    # ! => this value cant be null 
    # Reaction! => every reaction object cant be null and must exist/ Every item inside the array must be a valid Reaction. 
    # [Reaction!]! => it means that every reaction object inside the array must exits
    # and the array must exist also 
    #------------------------------
    reactions: [Reaction!]!
  }

  # conversation------------------
  #partner -> the other person we have convo with
  # last message of the convo
  # and the unreadcount of the message
  #-----------------------------

  type Conversation {
    partner: User!
    lastMessage: Message
    unreadCount: Int!
  }


  # MESSAGEREADPAYLOAD------------------
  # is used when the  read message this is the response send  back to the  frontend to make the convo read
  # readerid => is the person who read the msg 
  # conversationwith :id ! => is the person whoses messages were read
  #-----------------------------------

  type MessagesReadPayload {
    readerId: ID!
    conversationWith: ID!
  }


  # TYPINGSTATUS ------------------- 
  # use to show the typing mark
  # userid => is the person who is typing
  # receiverid => the  receiver of the message
  # istyping => a bool flag when is true when the user is typing and is fasle when the user is not typing 
  #----------------------------------

  type TypingStatus {
    userId: ID!
    receiverId: ID!
    isTyping: Boolean!
  }

  # USERSTATUS ---------------------
  # tell where the user is online offline  and show the last screen
  # the userid is is the id of the person how is currently usering your app 
  # isonlie => is the user online => required
  # last seen if ofline then required otherwisee not => there for no !
  #--------------------------------

  type UserStatus {
    userId: ID!
    isOnline: Boolean!
    lastSeen: DateTime
    isDeleted: Boolean!
  }


  

  # ─── Query ───────────────────────────────────────────────────────────────────
  # these are queries that are used to read/fetch  the data 
  type Query { 

    #-me----------------------
    # Returns the currently authenticated user.
    # no ! => so that the user can return the null if no if no body is logined
    #------------------------- 
    me: User 

    # findUserByEmail------------
    # it return user by email and if the user is not found then return null and 
    # the email should be string and cant be null
    #----------------------------
    findUserByEmail(email: String!): User

    # conversations ------------  
    # conversation mean one row of side bar 
    # hence backend returns the conversation (many convo)
    # [conversation!]! means that the convo aray should exit and and the each convo object shouldnit be null
    #----------------------------
    conversations: [Conversation!]!

    # messages ------------
    # return the messages of the chat with someone 
    # withUserId => this is id that whom we have the convo with(or the partner id)
    # limit => it the limit that in a convo this number of messages are allowed
    # [Message!]! => always return the array of valid message object
    #----------------------------
    messages(withUserId: ID!, limit: Int): [Message!]!

    # userStatus ------------
    # the frontend ask that the userid (some use) => it is online 
    # and it return the user status ... either online or offline 
    #----------------------------
    userStatus(userId: ID!): UserStatus!
  }

  # ─── Mutations ───────────────────────────────────────────────────────────────
  # mutation => is used whenever you want to change something 
  type Mutation {
    # ── Local auth ──────────────────────────────────────────────────────────────

    #signup--------------------
    # Register a new user. Creates account (isVerified=false) and sends OTP email.
    # take the name , email , password and return the messsagepayload(success + message)
    #---------------------------
    signup(name: String!, email: String!, password: String!): MessagePayload!

    #verifyOtp----------------------
    # Verify email with the 6-digit OTP sent after signup.
    # Returns the authenticated user + sets httpOnly cookie.
    # take the email and otp and return the authpayload (user + message)
    #--------------------------------
    verifyOtp(email: String!, otp: String!): AuthPayload!


    #resendOtp----------------------
    # Resend the OTP verification code.
    # take the email as and input  and return the message payload (success + message)
    #--------------------------------
    resendOtp(email: String!): MessagePayload!

    #login----------------------
    # Login with email + password.
    # Returns the authenticated user + sets httpOnly cookie.
    # Requires isVerified=true.
    # return the authticated authpayload(user + message)
    #--------------------------------
    login(email: String!, password: String!): AuthPayload!

    #logout----------------------
    # clears the httpOnly cookie.
    # Returns the messagepayload(success+ msg)
    #--------------------------------
    logout: MessagePayload!

    # ── Google OAuth ─────────────────────────────────────────────────────────────
    #googleAuth----------------------
    # idToken => when the user press continue with google 
    # the google check the credentailas the emails and password => and check that such user exist
    # if user exist then the user return the tokenid(large string)
    # the frontend doestnot know the user password  google send the tokenid to the frontend
    # and then the frontend send it to backend
    # backend verify the token by using the oauth library and extract the user info and returns it
    # Returns the authpayload(user+ message)
    #--------------------------------
    googleAuth(idToken: String!): AuthPayload!

    # ── Forgot / Reset Password ───────────────────────────────────────────────────
    #forgotPassword----------------------
    # get the email as an input okay 
    # and find that user in db and generate a  reset token and store it in the db 
    # and also store resetTokenExpires => expires after 15 mintues 
    # create a reset link and email it to the user 
    # Returns the messagepayload(message(resent email send)+ success )
    #--------------------------------
    forgotPassword(email: String!): MessagePayload!


    #resetpassword----------------------
    # Reset the password using the token from the reset link.
    # frontend extract the token from the link and send the new password also
    # and it verify the token in db => and set the new password 
    # Returns the messagepayload(message(password reset successfully)+ success )
    #--------------------------------
    resetPassword(token: String!, newPassword: String!): MessagePayload!

    # ── Profile ────────────────────────────────────────────────────────────────────
    # updateprofile----------------------
    # Update the logged-in user's profile.
    # get the name and avatar and return the user 
    # name and email are optional as the user can only chnage the name or the email or both also 
    #  there is no userid that is send to the backend as the user  is already logined
    # so inside the resolver we already have the context so backend find the user by it 
    # update the name or avatar in the db and return the user (the updated one )
    #--------------------------------
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
    Edit the text content of a message you sent — WhatsApp/Instagram-
    style. Only works for text messages that haven't been unsent. Marks
    the message edited: true so clients can show an "(edited)" label,
    and pushes the update to both participants live via the same
    messageEdited subscription used for voice-message S3 migration.
    """
    editMessage(messageId: ID!, content: String!): Message!


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
    Emitted when a message's mutable fields change after it was first
    sent — currently covers two cases: (1) a voice message that was
    playing from a temporary local stream finishes uploading to S3, so
    the client can swap its audio source to the permanent URL, and
    (2) a text message gets edited (WhatsApp/Instagram-style), so both
    participants' open chats can patch the bubble content + "(edited)"
    label in place, live, without a refresh.
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

//--------------------
// COMMENTS 
//--------------------

// this file is  called graphql schema 
// this file tell graphql=> what data exists , what operations user can perform and
// what those operations return 
// this file only contain the rules 



// flow :
// frontend => graphql query => typedefs (checks rules ) => if allowes then  go to the resolver
// if not allowed then give the error 
// typedefs are just the rules they dont communicate with the db but the resolver does 

// we use the SDL => SCHEME DEFINATION LANGUAGE => TO DEFINE THE TYEPDEFS
// sdl => is the graphql  own language 

// we define the graphql types => graphql types is almost like the typescript interface
// and keep that in you mind that this is how the response it being send back yto frontend
// typesdefs => kind of set of rules that define the operations and tell that how the rsponse 
// is being send back to the frontend 



