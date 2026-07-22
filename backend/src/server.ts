// COMMENTS______________________________
// this file is the main file that runs when the app start
// FUNCTION:
// ->Starting your Express server
// -> Connecting to MongoDB
// -> Creating the GraphQL API
// -> Creating the WebSocket server
// ->Authenticating users connecting through WebSocket
// -> Marking users online/offline



import http from "http";// we use http coz express only  use http requests
import { WebSocketServer } from "ws";// this pakage create a websocket server
import { useServer } from "graphql-ws/use/ws";//graphql take the websocket and  understand the graphql subscription
import { createApp, schema } from "./app";
import { connectDB } from "./config/db";
import { ENV } from "./config/env";
import { verifyToken } from "./utils/token";// this verify the token
import User from "./models/User";
import { markUserOnline, markUserOffline } from "./utils/onlineStatus";

// ─── Small helper: extract one cookie value from a raw Cookie header ─────────
// basically the browser sends all cookies together in one large string 
// but you backend only want one cookie
// so this function find the cookie using name and return  its value and if it cant find return undefined
// this function expect the a variable = cookieheader => it contain multiple cookies or null values
// name: string is the cookie that you want 
// this return  either undefine or  the cookie
function getCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined; // if the browser send nothing then it is null  (no cookies)
  const match = cookieHeader
  // the header contain the string of cookies i.e 
  // cookieHeader ="theme=dark; language=en; delina_token=abc123; fontSize=18"
    .split(";")// this cut the string into pieaces
    // after it cookies become ["theme=dark"," language=en"," delina_token=abc123"," fontSize=18"]
    
    // map  is like a loop to the every single item
    .map((c) => c.trim())// trrim remove the spaces 
    .find((c) => c.startsWith(`${name}=`));// it check all component untill the one match 
    // we are finding  the cookie who start with that name 

    // match is saying that do we find something 
    // if yes  => then match.slide(name.length+1)
    // match.slice(name.length+1) => get the  len of the name and  then add one to it 
    //why adding 1? coz of the  eq sign => so lets say 
    // delina_token= => len = 13 so 13+1 = 14 
    // as we only want abc123 so we slice it after the equal sign 
    // decodeURIComponent => make the cookie readable  again 
    // coz the sometime the browser contain special characters so it cant be stored directly
    // i.e faiqa mustafa => so browser convert it faiqa%20mustafa=> %20 is the space 
    // so decodeuricomponent convert it again back into the readable form 
  return match ? decodeURIComponent(match.slice(name.length + 1)) : undefined;
}


// _____________MAIN FUN(THE STARTING POINT OF APP)______________________
// main fun=> is the starting point  of my entire backend
// FUNCTION IT PERFORM:
// -> connect to the db 
// ->create the express app 
// -> start the http server 
// -> start the websoket server 
// -> wait for the user to connect 

// so basically you can say system  start => main runs => everything  gets ready
// the function is asyn coz it handle the asyn operateion like connection to db etc so we use await


async function main() {
  await connectDB();//your backend first connect to db 
  const app = await createApp();// now we create the express application 
  // inside this createapp function alot of things are happening 
  // express(), cookieparser(), cors(), appolo server , graphql routes , middleware and return  app
  // after this line the app become something like  express application 

  // okay so listen the things is express only know http requests=> so http server isnot need
  // but the websockets need actual http server underneath therefore
  // we wrap express inside an http server 
  const httpServer = http.createServer(app);
  // so after it the server is cableable of handleing both 
  // normal http requests and websocket upgrade 


  // now we create the websocket server
  const wsServer = new WebSocketServer({
    server: httpServer, // we use the same http server 
    // so you can say instead of creating the another port both http and websockt  use
    // one port  localhost=5000
    path: "/graphql",// this means that only connection comming to 
    //ws://localhost:5000/graphql are accepted 
    // /graphql is accepted
  });

  useServer(// this connect the graphql with the web socket server
    // without your websocket server would only know some connection arrives
    // but it will not understand the subscription 
    // so this teaches the websocket server how  to understand graphql subscription
    {
      schema,// this is the graphql schema=> inside it all you have queries , mutation ,subscriptions
      // whichout this graphql wont know which operation will exist

      // ---context------

      //this operation runs everytime a graphql operationn happens over the websocket
      // ctx=> graphql-ws library create it and it contain the information about the websocket 
      // it contain the request , socket, connection , extra and many other things 
      // ctx.extra=> inside the ctx there is another object that is ctx.extra 
      // this is like a notebook and you can store anything here 
      // like intionally it is empty but later we store the user =>ctx.extra.user = user;
      // so that the user stays attach to the websocket connection 
      // context contain the information about the current user 
      // and in subscription we pass the context so the context comes from this function 
      context: async (ctx: any) => {
        return { user: ctx.extra?.user ?? null };
        // we are simply reading the user from the extra 
        // ctx.extra?. => ?. (this is saying that if extra exist read the user otherwise dont crash )
        // like if not exist so it will through the undefine  instead of throughing the error and 
        // if we dont use it then it will crash and through the error 
        // ??says that if the left side is null or undefined then return nulll
      },
      //=>CONCLUSION: this means give every subscription this context => user 




      // --- onconnect ------
      // => this function only runs once when the websocket connection is established 
      onConnect: async (ctx: any) => {
        // ctx -> contain extra -> contain request -> contain header -> contain cookie
        // delina_token is the name of the cookie 
        // "theme=dark; language=en; delina_token=ABC123"
        // the token will store the abc123 => the value of the cookie  
        const token = getCookie(ctx.extra?.request?.headers?.cookie, "delina_token");
        let user = null;//intionally we dont know who connected therefor the user is null
        if (token) {// check that if the browser send the token 
          // if the token exist then we verify it else we ignore 
          try {
            const decoded = verifyToken(token);// so we verify the token => after that the server knows that who own this token
            user = await User.findById(decoded.id);// so we find the user by the id and store it inside the user
            if (user?.isDeleted) {// check the condition that if the user is deleted then return null
              user = null;
            }
          } catch {
          }
        }
        ctx.extra.user = user;//ctx.extra is like a locker assigned to this websocket connection
        // sowe store the user in this so that whenever the graphql needs this user 
        // it simply reads ctx.extra.user  => hence so we dont need to verify the jwt token again 

        if (user) {//means that if the user exist and authentication succedded
          await markUserOnline(user._id.toString());//we mark the user as online and isonline=true 
          // as the user have established the websocket connection 
        }
      },
      // conclusion => verify the user , and store the user in ctx.extra and mark the user online 


      // --- onDisconnect ------
      // => this fuction runs whenever the websocket connection is disconnected 
      // and the connection is disconnected when:
      // .close the browser , . refresh, .internet lost, .laptop shutdown, .phone discount

      onDisconnect: async (ctx: any) => {

        const user = ctx.extra?.user;//this get the user from the ctx.extra 
        if (user) {// if the user exist and is not nulll 
          await markUserOffline(user._id.toString());// then mark the user as offline => isonline=false and set the lastseen
        }
      },
    },
    wsServer
  );

  // above we create the server but it was not runnibg kind of sleeping 
  // httpserver.lisren => the server become active /running and starts waiting for the requests
  // env.port => it contain the port number 
  // this means that start the server on the port 5000
  httpServer.listen(ENV.PORT, () => {// we use the callback function 
   // we use the callback => to run this code after something finishes  t
  // so after the server starts we  execute this function
  // we just log this  
  // the mutataion and query goes to the http://localhost:5000/graphql=>coz uses http prtocol
    console.log(`GraphQL ready at http://localhost:${ENV.PORT}/graphql`);
    // now for websockt => it uses a different protocol => ws://
    console.log(`WebSocket ready at ws://localhost:${ENV.PORT}/graphql`);
  });
}

main().catch((err) => {// if there is any error then display it and 
  console.error("Fatal startup error:", err);
  process.exit(1);// stop the app 
});
