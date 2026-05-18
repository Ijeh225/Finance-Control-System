import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { requireAuth } from "../lib/requireAuth";

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

  if (!user.isActive) {
    res.status(403).json({ error: "Your account has been deactivated. Contact the MD." });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  // Regenerate session ID after login to prevent session fixation attacks.
  const userPayload = {
    id: user.id,
    name: user.name,
    role: user.role as "md" | "treasury" | "payment_assistant",
    email: user.email ?? "",
  };

  req.session.regenerate((err) => {
    if (err) {
      res.status(500).json({ error: "Session error" });
      return;
    }
    req.session.userId = userPayload.id;
    req.session.userRole = userPayload.role;
    req.session.userName = userPayload.name;
    req.session.userEmail = userPayload.email;
    req.session.userPhone = user.phone ?? null;
    req.session.save((saveErr) => {
      if (saveErr) {
        res.status(500).json({ error: "Session save error" });
        return;
      }
      res.json({ user: { ...userPayload, phone: user.phone ?? null } });
    });
  });
});

router.post("/auth/change-password", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;

  const { currentPassword, newPassword } = req.body as {
    currentPassword?: string;
    newPassword?: string;
  };

  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: "currentPassword and newPassword are required" }); return;
  }
  if (newPassword.length < 8) {
    res.status(400).json({ error: "New password must be at least 8 characters" }); return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user || !user.passwordHash) {
    res.status(404).json({ error: "User not found" }); return;
  }

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) {
    res.status(400).json({ error: "Current password is incorrect" }); return;
  }

  const samePassword = await bcrypt.compare(newPassword, user.passwordHash);
  if (samePassword) {
    res.status(400).json({ error: "New password must be different from your current password" }); return;
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db.update(usersTable).set({ passwordHash }).where(eq(usersTable.id, userId));

  res.json({ success: true });
});

router.patch("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const actor = req.user!;
  const { name, email, phone } = req.body as {
    name?: string;
    email?: string;
    phone?: string;
  };

  const updates: Record<string, unknown> = {};
  if (name !== undefined) {
    const trimmed = name.trim();
    if (!trimmed) { res.status(400).json({ error: "Name cannot be empty" }); return; }
    updates["name"] = trimmed;
  }
  if (email !== undefined) {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) { res.status(400).json({ error: "Email cannot be empty" }); return; }
    const [existing] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, trimmed));
    if (existing && existing.id !== actor.id) {
      res.status(409).json({ error: "That email address is already in use" }); return;
    }
    updates["email"] = trimmed;
  }
  if (phone !== undefined) updates["phone"] = phone.trim() || null;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No fields to update" }); return;
  }

  const [updated] = await db
    .update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, actor.id))
    .returning({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      phone: usersTable.phone,
      role: usersTable.role,
    });

  if (!updated) { res.status(404).json({ error: "User not found" }); return; }

  req.session.userName = updated.name;
  req.session.userEmail = updated.email ?? actor.email;
  req.session.userPhone = updated.phone ?? null;
  req.session.save((err) => {
    if (err) req.log.warn({ err }, "Failed to save session after profile update");
  });

  res.json(updated);
});

router.post("/auth/logout", (req, res): void => {
  req.session.destroy(() => {
    res.clearCookie("fincommand.sid");
    res.json({ ok: true });
  });
});

router.get("/auth/me", (req, res): void => {
  const { userId, userName, userRole, userEmail, userPhone } = req.session ?? {};
  if (!userId || !userName || !userRole || !userEmail) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  res.json({ id: userId, name: userName, role: userRole, email: userEmail, phone: userPhone ?? null });
});

export default router;
