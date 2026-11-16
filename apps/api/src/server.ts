import { buildApp } from "./app.js";

const app = buildApp();
const port = Number(process.env.PORT ?? 3000);

try {
  // 0.0.0.0 accepts connections from outside this machine too,
  // which a phone on the same network will need later.
  await app.listen({ port, host: "0.0.0.0" });
  console.log(`API listening on port ${port}`);
} catch (error) {
  console.error(error);
  process.exit(1);
}
