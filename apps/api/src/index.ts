import { app } from "./app.js";

const port = Number(process.env.PORT ?? 4000);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}

const server = app.listen(port, () => {
  console.log(`Supermarket API listening on port ${port}`);
});

const shutdown = (signal: string) => {
  console.log(`Received ${signal}; closing HTTP server.`);
  server.close((error) => {
    if (error) {
      console.error("Error while closing HTTP server.", error);
      process.exitCode = 1;
    }
  });
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
