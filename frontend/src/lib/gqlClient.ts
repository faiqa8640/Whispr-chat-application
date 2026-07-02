const GQL_ENDPOINT = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/graphql` // STORE URL OF GRAPHQL SERVER
  : "http://localhost:5000/graphql";

// GQL CLIENT IS THE MESSENGER BTW THE REACT FRONTEND AND THE GRAPHQL BACKEND

// GQL IS A REUSABLE FUNCTION THAT WE USE INSTEAD OF WRITING FETCH  AGAIN AND AGAIN
export async function gql<T = unknown>(
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const res = await fetch(GQL_ENDPOINT, { // THIS SEND THE REQUEST
    method: "POST", // GRAPHQL ALWAYS USED THE POST COZ QUERIES AND VARIBALES ARE SEND IN THE REQUEST BODY
    headers: { "Content-Type": "application/json" },
    credentials: "include",          // ← essential for httpOnly cookie auth AS SEND THE TOKEN TO TEH FRONTEDN WITH EVERY REQUEST
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`Network error: ${res.status} ${res.statusText}`);
  }

  const json = await res.json(); 

  // GraphQL errors surface here (not as HTTP errors)
  if (json.errors?.length) {
    throw new Error(json.errors[0].message);
  }

  return json.data as T;
}
