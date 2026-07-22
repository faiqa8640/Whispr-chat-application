import Conversation from "../models/Conversation";

// findorCreateConversation---------------------------------------
// this function ensure that there is only one conversation between 2 users 

//parameters => this function receives the 2 user ids
// the goal is to find the conversation btw those 2 user if it dont exist 
// then create the conversation 

export async function findOrCreateConversation(userA: string, userB: string) {
    //first we create the array of particeipents and then we sort them 
    // so that the 2 user should only have 1 conversation object 
  const participents = [userA, userB].sort();
  //now we check that does the conversation already exist? using conversation.findone
  // $all => it means that the array must contain all of these values 
//   suppose mongodb contain {"participents":["Ali", "Ahmed"]}
// so we search participents: {$all: ["Ali","Ahmed"]}
//so mongodb ask do ali exist ? => yes continue => do ahmed exist => continuw
// if not exist => skip that document
// $size: 2 => check is  for the conversation that we need to find the conversation that contain 2 particpents
// so conclusion => find the convo that have above participents and  the convo should only have 2 users
  let convo = await Conversation.findOne({ participents: { $all: participents, $size: 2 } });

  // if the conversation dont exist => then we create the conversation documents having that participents
  if (!convo) convo = await Conversation.create({ participents });
  // if we find that conversation so we return it 
  return convo;
}

//flow :
// Function starts => Receive user IDs => Sort them => Search database=>
//Conversation exists? => if yes return the convo , if dont exist =>  create the convo