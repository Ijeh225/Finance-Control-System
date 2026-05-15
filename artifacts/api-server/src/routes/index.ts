import { Router, type IRouter } from "express";
import { requireAuth } from "../lib/requireAuth";
import healthRouter from "./health";
import authRouter from "./auth";
import dashboardRouter from "./dashboard";
import usersRouter from "./users";
import billsRouter from "./bills";
import vendorsRouter from "./vendors";
import walletsRouter from "./wallets";
import notificationsRouter from "./notifications";
import auditRouter from "./audit";
import reportsRouter from "./reports";
import storageRouter from "./storage";
import attachmentsRouter from "./attachments";
import exportsRouter from "./exports";

const router: IRouter = Router();

// Public routes — no auth required
router.use(healthRouter);
router.use(authRouter);
router.use(storageRouter);

// All routes below require a valid session
router.use(requireAuth);
router.use(dashboardRouter);
router.use(usersRouter);
router.use(billsRouter);
router.use(vendorsRouter);
router.use(walletsRouter);
router.use(notificationsRouter);
router.use(auditRouter);
router.use(reportsRouter);
router.use(attachmentsRouter);
router.use(exportsRouter);

export default router;
