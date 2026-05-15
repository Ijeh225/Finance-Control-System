import "express-session";

declare module "express-session" {
  interface SessionData {
    userId: string;
    userRole: "md" | "treasury" | "payment_assistant";
  }
}
