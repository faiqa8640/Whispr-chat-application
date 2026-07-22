
//This decides where the GraphQL server is running.
const GQL_ENDPOINT = import.meta.env.VITE_API_URL// if local host exist 
  ? `${import.meta.env.VITE_API_URL}/graphql` // STORE URL OF GRAPHQL SERVER
  : "http://localhost:5000/graphql";

// GQL CLIENT IS THE MESSENGER BTW THE REACT FRONTEND AND THE GRAPHQL BACKEND

// GQL IS A REUSABLE FUNCTION THAT WE USE INSTEAD OF WRITING FETCH  AGAIN AND AGAIN
export async function gql<T = unknown>(
  query: string,// graphql query 
  variables?: Record<string, unknown> //variables for the  graphql 
): Promise<T> {
  const res = await fetch(GQL_ENDPOINT, { // THIS SEND THE http REQUEST
    method: "POST", // GRAPHQL ALWAYS USED THE POST COZ QUERIES , mutataions AND VARIBALES ARE SEND IN THE REQUEST BODY
    headers: { "Content-Type": "application/json" },// this tells that the content type is json 
    // and i am sending json now 
    credentials: "include", // if this is present => the browser automatically attach the cookies 
    // if not the cookies will not be attach with every request automatically 
    body: JSON.stringify({ query, variables }), // the server expect the json wo we convert the body to json 
  });

  if (!res.ok) {// if res nor okay then display the error 
    throw new Error(`Network error: ${res.status} ${res.statusText}`);
  }

  const json = await res.json(); // the response body is still raw text 
  // we we convert the object into the javascript object 

  // GraphQL errors surface here (not as HTTP errors)
  if (json.errors?.length) {//  if it reachers teh graphql server successfully
    // but the error occur inside message => it handle that 
    throw new Error(json.errors[0].message); // so handel that errors
  }

  return json.data as T;
}
