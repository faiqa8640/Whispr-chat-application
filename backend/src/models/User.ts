//this file is teh blueprint of every user in database 
import mongoose, { Document, Model, Schema } from "mongoose";
// mongoose => is a library  that help the node.js to talk to the mongodb 
// schema => it is like a blue print 
// document => mongodb store the data as document 
// model => is used to perform the operations 
import bcrypt from "bcryptjs";
// bcrypt is used for the passwords 
// is a libaray that is used to hash the password 


//interface is just like a form => it dont store the data => it just tell that what a user should have 
// in simple words it means => every user object should look like this 
// interface IUser => i am creating a blueprint called iuser
// extend document => every record inside the mongodb is called document 
// and mongoose already have the document interface it contain things like:
// _id, save(), deleteone(), toObject() etc 
//so without extend  we wont be able to use these properties 
// hence Take everything from Document and also add my own fields.
export interface IUser extends Document {
  name: string;
  email: string;
  password?: string;//  password optional 

  role: "user" | "admin";
  provider: "local" | "google";

  googleId?: string;//optional
  avatar?: string;//optional

  isVerified: boolean;

  otpCode?: string;//optional
  otpExpires?: Date;//optional

  resetToken?: string;//optional
  resetTokenExpires?: Date;//optional

  lastSeen?: Date;//optional

  isDeleted: boolean;
  deletedAt?: Date;//optional

  createdAt: Date;
  updatedAt: Date;

 //every user object have a function called  matchpassword 
 // why promise => coz bcrupt works ascynchronously 
  matchPassword(enteredPassword: string): Promise<boolean>;
}

// interface => it is only for the tyepscript 
// schema => is used by the mongoose => it control how data is store in the db 

const UserSchema = new Schema<IUser>(
  {//1)object => describe the feild of the user 
    name:     { type: String, required: true, trim: true },
    email:    { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, minlength: 6, select: false },
    // select=> means that when returning the mongodb document  dont add this feild unless someone
   // expilicity ask for it  

    role:     { type: String, enum: ["user", "admin"], default: "user" },
    provider: { type: String, enum: ["local", "google"], default: "local" },

    googleId: { type: String, unique: true, sparse: true },
    // sparse means => ignore the documents that dont have this feild
    avatar:   { type: String },

    isVerified: { type: Boolean, default: false },

    otpCode:    { type: String, select: false },
    otpExpires: { type: Date,   select: false },

    resetToken:        { type: String, select: false },
    resetTokenExpires: { type: Date,   select: false },

    lastSeen: { type: Date },

    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
  },
  { timestamps: true }//2)object => this is not the feild but it is an option 
  // or setting for the entire schema
  // due to timestamps mongodb automatically added the 2 fields
  // 1)createdat and 2) updatedat 
  // these 2 fields keep the track that when the user is created and updated  
);


// this function is the pre-hook or pre middleware 
//  this function runs before saying the user to the mongodb 
// userschema => we are adding the  middleware to the user schema
// .pre=> runs it before something 
// "save" => this tells when  to run 
// => means run it before save 
// we use the asyn coz  we have the operation in it that is time taking 
UserSchema.pre<IUser>("save", async function () {

  // this => is the current user being saved / current user document
  // this.ismodified("password")=> this asked that did the password is modified or changed
  // !this.ismodified("password") => means that password was not modified
  // !this.password => the password dont exist => means undefined 
  // we added this condition for the user who login with the google they dont have password
  // 
  if (!this.isModified("password") || !this.password) return;

  // bcrypt is used for the hashing of the password
  // bycrypt is the library  it knows :
  // 1)how to generate the salt 
  // 2)hash password
  // 3)compare the password 
  // bcrypt first create the random number => salt
  // and then it combine with the password => salt + password 
  //  even if the 2 users have the same password but there hash would be different 
  // due to the salt
  // 10=> it is the cost factor or work factor 
  // higher the number => the hashing takes  more time which maked password harder to guess by the attacker 
  // salt => generate a random value or number 
  // gensalt=> create a random salt
  // await coz it take time 
  // 10 is the cost factor or work factor 
  // this is kind of difficulty level 
  // cost 5 => very fast => less secure 
  // cost 10 => balanced => common choice
  // cost 15 => very slow => very secure
  // ** the higher the number => the longer the bycrypt spends on creating the hash
  // hence this make the password guessing much harder
  const salt = await bcrypt.genSalt(10);
  // this hash the password and save it in the place of the password 
  this.password = await bcrypt.hash(this.password, salt);// we hash the password
});


// this function is used when the user login for matching the password
// the user schema has can also store the properaties (the fields ) + methods 
// so this is the method 
// UserSchema.methods.matchPassword => i am adding a new function to every user
// 

UserSchema.methods.matchPassword = async function (
  enteredPassword: string// contain the enter password
): Promise<boolean> {// return true or false
  if (!this.password) return false; // if user password dont exist then return=> incase of google login

  // bycrypt  done the hashing internally  for the incomming password
  // bycrypyt => read the salt num or cost factor from the stored hash 
  // and then it hashes the incoming password in the same way as we  hash the already present password 
  return bcrypt.compare(enteredPassword, this.password);// and then compare the password 
};


// ----creating the model-------
// model => a model is created from the schema 
// model is what that comunicate with the mongodb 
// so with model => you can perform the database operations
// they can create ,delete,update , delete users 
// const user => this create a  variable=> that is the model
// model<iuser> -> this is the typescript => it tells the typescript 
// that  the  user is the mongoose model  and every interface inside it follows the 
//iuser interface 
// mongoose.model<IUser>("User", UserSchema)=> this is the mongoose function 
// it create a model 
// this line means that take the user schema and convert it into the valueable model 
// "User" => model name 


//so basically  mongoose take the userschema  and create a user model
// and connect to its user collection
// return the model and store it inside the variable user
const User: Model<IUser> = mongoose.model<IUser>("User", UserSchema);
// conclusion :
//Create a Mongoose model called User using the UserSchema, and 
// let TypeScript know that every document follows the IUser interface.
export default User;