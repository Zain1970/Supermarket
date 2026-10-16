import type { AuthenticatedPrincipal } from "../security/access-control.js";

declare global {
  namespace Express {
    interface Request {
      principal?: AuthenticatedPrincipal;
      sessionTokenHash?: string;
    }
  }
}

export {};
