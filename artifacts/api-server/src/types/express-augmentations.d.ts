import "express-session";

declare module "express-session" {
  interface SessionData {
    userId?: string;
    userRole?: string;
    userName?: string;
    userEmail?: string;
  }
}

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        name: string;
        role: string;
        email: string;
      };
    }
  }
}
