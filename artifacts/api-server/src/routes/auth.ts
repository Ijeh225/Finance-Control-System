import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";

const router: IRouter = Router();

router.post("/auth/login", async (req, res): Promise<void> => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res.status(400).json({ error: "email and password are required" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase().trim()))
    .limit(1);

  if (!user || !user.passwordHash) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  req.session.userId = user.id;
  req.session.userRole = user.role;
  req.session.userName = user.name;
  req.session.userEmail = user.email ?? "";

  res.json({
    user: {
      id: user.id,
      name: user.name,
      role: user.role,
      email: user.email,
    },
  });
});

router.post("/auth/logout", (req, res): void => {
  req.session.destroy(() => {
    res.clearCookie("fincommand.sid");
    res.json({ ok: true });
  });
});

router.get("/auth/me", (req, res): void => {
  const { userId, userName, userRole, userEmail } = req.session ?? {};
  if (!userId || !userName || !userRole || !userEmail) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  res.json({ id: userId, name: userName, role: userRole, email: userEmail });
});

export default router;
