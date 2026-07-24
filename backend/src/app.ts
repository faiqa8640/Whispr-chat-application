// THIS FILE => CREATE THE EXPRESS APLLICATION 

import express from "express";// express is a framework use to create the web server 
// without express you need to create the req , responce , cookies etc object yourself
// but now the express us this 
import cors from "cors";// this is used for cross original resouce sharing
import cookieParser from "cookie-parser";
// when the request comes to the  express  the cookie comes like a string 
//without cookieparser express only see the one long string containing all the cookies 
// express automatically convert it  into the req.cookies => in json and well stucture => so become much easier
import { ApolloServer } from "@apollo/server";// this is the graphql server => and it is like a brain of the graphql
// basically appolo receive the mutation , query etc and decide that which resolver to run 

// => expressmiddleware => ***(vip)
// basically the express understand the  express request and appolo understand the graphql 
//so both speak differenet languages 
// so expressmiddleware => act as a translator 
// so the flow is express -> middleware => appolo resolver 
import { expressMiddleware } from "@apollo/server/express4";

// => makeExecutableSchema => 
// basically graphql have type definations + resolvers 
// but the apollor need only one  object  called as schema  
//=> so this combine the both 
import { makeExecutableSchema } from "@graphql-tools/schema";

// typedefs => this define that what operation exist 
import { typeDefs } from "./graphql/typeDefs/index";

// this describe that how these operation should works 
import { resolvers } from "./graphql/resolvers/index";

// buildcontext =>  it verifies the jwt and  load the users 
import { buildContext } from "./middleware/authContext";
import { ENV } from "./config/env";
import uploadRouter from "./routes/upload";
import mediaProxyRouter from "./routes/mediaProxy";
import voiceMessageRouter from "./routes/voiceMessage"; 


// we create the schema by makeExecutableSchema => that takes the typedefs and resolvers and refernce the schema
// and appolo uses this schema 
export const schema = makeExecutableSchema({ typeDefs, resolvers });


// ---createApp-----
//=> this function builds your express application and this is used in the server.ts  
export async function createApp() {
  const app = express(); //this create an empty express application 


  // ----middleware-----
  // app.use => use this middleware for every request 
  // origin= http://localhost:5173=> this means that only this url is alloweded 
  // credentails = true => without it the cookies  are not send 
  // so browser remove cookies and backend never receives delina_token cookie so teh authentication fails 
  // with it the  browser sends the cookies and   the login workds 
  app.use(cors({ origin: ENV.CLIENT_URL, credentials: true }));

  // every request => cookie header =>cookie parser =>req.cookies 
  // now after it anywhere in the express application you can do  
  //req.cookies.delina_token => instead of manually parsing the cookies 
  app.use(cookieParser());

  // if the frontend send the json => without this middleware the express cant  understand the json 
  // =>Whenever you receive JSON text, it  convert it into a JavaScript object."
  //after adding this => req.body  is allowd and it become very easy
  // limit: 3mb =>  we prevent someone from the sending the request  of more then 3mb 
  // otherwise the app will crash 
  app.use(express.json({ limit: "3mb" }));


  // -----appolo server----
  // => now we create the graphql server => the appolo engine 

  const apollo = new ApolloServer({
    schema,//schema = it contain the information aboyut all the query, mutation and subscription exist
    // so if the appolo server ask => related to this so then the schema ans all these questions

    // this functions runs whenever an error happens 
    formatError: (formattedError) => {
      // the appolo normally  return an object that cotain many information  i.e path, msg, location , stacktrace etc
      // so if the error occur we dont want to return everything => as there is a chance of  leak of info by hacker
      // so if the env = development = only you are running the app them return the complete info => no problem
      // but if the env = production = only the error msg => and skip the remaining information 
      if (ENV.NODE_ENV === "production") return { message: formattedError.message };
      return formattedError;
    },
  });

  await apollo.start();//this starts the apollo engine 
  // when we start it => it loads schema , resolvers, plugins ,graphql engine 
  // after this the apollo is ready 


  // every request first reaches the express 
  // app.use => help us to decide that where we should send this request 
  // app.use => it means that whenever the request come => use this middleware 
  app.use(
    "/graphql",// route or path 
    // now we are placing the translator 
    // as the express understand the https request and 
    // appolo understand the graphql 
    // so they cant talk to each other directly 
    // so therefore we place the translator to talk to each other 
    expressMiddleware(apollo, {
      // context => each graphql request need the context  and 
      //  the express make the req, res object after receiving the object 
      // req=> contain the information about the request 
      // res => it contain the information about the responce  => so it is used to send the data back 
      context: async ({ req, res }) => buildContext({ req, res }),
      // after it we run the buildcontext => that is the authentication middleware
      // so the context => return the req, res and user  and  apollo give this object  to every resolver 
      // 
    })
  );

  // middlewares 
  app.use("/api", uploadRouter);
  app.use("/api", mediaProxyRouter);
  app.use("/api", voiceMessageRouter); 

  return app;
}