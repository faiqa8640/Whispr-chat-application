import Conversation from "../models/Conversation";

// // findorCreateConversation---------------------------------------
// // this function ensure that there is only one conversation between 2 users 

// //parameters => this function receives the 2 user ids
// // the goal is to find the conversation btw those 2 user if it dont exist 
// // then create the conversation 
export async function findOrCreateConversation(userA: string, userB: string) {
  //first we create the array of particeipents and then we sort them 
  // so that the 2 user should only have 1 conversation object 
  const participants = [userA, userB].sort();

  //findoneandupdate -> this method fine the convo or update it or create one if not exist
  const conversation = await Conversation.findOneAndUpdate(
    // find the convo where the participant are same as  the participants in the array
    { participants: participants }, 
    //$setonInsert => if the converssation exist do nothing 
    // but if it doest not exist is set the participants as these 
    { $setOnInsert: { participants } },
    //new: true => update if found and if not found then  insert it 
    //upsert : true => always return the new document 
    //Return the document after the update/insert.
    { new: true, upsert: true }
  );

  //retutn the conversation 
  return conversation;
}