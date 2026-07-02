import { createApp } from "./app.js";
import { connectDB } from "./config/db.js";
import { ENV } from "./config/env.js";

async function main() {
  await connectDB();
  const app = await createApp();

  app.listen(ENV.PORT, () => {
    console.log(` GraphQL ready at http://localhost:${ENV.PORT}/graphql`);
  });
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
