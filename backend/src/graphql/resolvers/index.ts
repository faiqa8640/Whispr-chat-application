import { authResolvers } from "./authResolvers";
import { messageResolvers } from "./messageResolvers";
import { resolveMediaUrl } from "../../utils/mediaUrl";

export const resolvers = {// create one big object of resolvers 
  Query: {
    ...authResolvers.Query,
    ...messageResolvers.Query,
  },
  Mutation: {
    ...authResolvers.Mutation,
    ...messageResolvers.Mutation,
  },
  Subscription: {
    ...messageResolvers.Subscription,
  },

  Message: {
    //fieldResolver => it reserves on field like mediaurl => not the entire message 
    //call this function whenever someone ask for the media url
    //  the thing is that the format message ... contain just the resource object
    // like if the frontend want the  medialurl just to display the image => it dont provide directly
    // so basically as we need generate this field => so we use the feild resolver
    // basically the parent conatin the object of formated messsage that dont contain any field or mediaurl
    // so  form the parent object we only get the deleted and resource as a parameter

    
    // complete flow :
    //query mongodb => populate refernences => all the format message
    // return the formated object => graphql resolve the field(like mediaurl)
    // and then the response is send back to the frontend 
    mediaUrl: async (parent: { deleted: boolean; resource: any }) => {
      // if message is delete => in that case null
      if (parent.deleted) return null;
      // else return mediaurl and take the resource object 
      //if the resource status is pending return the local url 
      // else return me the signed url 
      return resolveMediaUrl(parent.resource);
    },
  },
  
};