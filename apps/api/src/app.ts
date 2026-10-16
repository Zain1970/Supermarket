import cookieParser from "cookie-parser";
import express from "express";
import { authRouter } from "./auth/routes.js";
import { storeRouter } from "./stores/routes.js";

export const app = express();

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

app.get("/health", (_request, response) => {
  response.status(200).json({
    status: "ok",
    service: "supermarket-api",
    stage: "foundation"
  });
});

app.use("/auth", authRouter);
app.use("/stores", storeRouter);

app.use((_request, response) => {
  response.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: "المسار المطلوب غير موجود."
    }
  });
});

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  // Keep internal exception details out of API responses.
  console.error("Unhandled API error", error);
  response.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "حدث خطأ غير متوقع. حاول مرة أخرى لاحقًا."
    }
  });
});
