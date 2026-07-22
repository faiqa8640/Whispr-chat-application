import { authResolvers } from "./authResolvers";
import { messageResolvers } from "./messageResolvers";

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
};