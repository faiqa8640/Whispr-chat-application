import { authResolvers } from "./authResolvers.js";
import { messageResolvers } from "./messageResolvers.js";

export const resolvers = {
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