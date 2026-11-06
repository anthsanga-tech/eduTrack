import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js";
import {
    getAllUsers,
    getAdminAnalytics,
    getAdminReport,
    createUser,
    updateUser,
    deleteUser,
    getSubjects,
    createSubject,
    updateSubject,
    deleteSubject,
} from "../controllers/adminController.js";
import { lockTest, unlockTest } from "../controllers/resourceLockController.js";

const router = express.Router();

router.use(protect, requireRole("admin"));

router.get("/analytics", getAdminAnalytics);
router.get("/reports", getAdminReport);
router.patch("/tests/:testId/lock", lockTest);
router.patch("/tests/:testId/unlock", unlockTest);
router.get("/users", getAllUsers);
router.post("/users", createUser);
router.put("/users/:id", updateUser);
router.delete("/users/:id", deleteUser);
router.get("/subjects", getSubjects);
router.post("/subjects", createSubject);
router.put("/subjects/:id", updateSubject);
router.delete("/subjects/:id", deleteSubject);

export default router;
