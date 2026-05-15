import type { Request, Response, NextFunction } from "express";

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const { userId, userName, userRole, userEmail } = req.session ?? {};
  if (!userId || !userName || !userRole || !userEmail) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  req.user = { id: userId, name: userName, role: userRole, email: userEmail };
  next();
}
