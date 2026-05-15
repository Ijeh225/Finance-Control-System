import { Router, type IRouter } from "express";
import healthRouter from "./health";
import dashboardRouter from "./dashboard";
import usersRouter from "./users";
import billsRouter from "./bills";
import vendorsRouter from "./vendors";
import walletsRouter from "./wallets";
import notificationsRouter from "./notifications";
import auditRouter from "./audit";
import reportsRouter from "./reports";

const router: IRouter = Router();

router.use(healthRouter);
router.use(dashboardRouter);
router.use(usersRouter);
router.use(billsRouter);
router.use(vendorsRouter);
router.use(walletsRouter);
router.use(notificationsRouter);
router.use(auditRouter);
router.use(reportsRouter);

export default router;
