import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js";
import {
    getTeachers,
    createTest,
    updateTest,
    getSubjects,
    assignTest,
    getMyTests,
    getTeacherAnalytics,
    getTestById,
    getMyTestsBySubject,
    deleteTest,
    archiveTest,
    closeTest,
    publishTest,
    getAllStudents,
    getQuestionsByTest,
    getQuestionsByTeacher,
    getAccessibleQuestions,
    createQuestion,
    getQuestionById,
    updateQuestion,
    deleteQuestion,
    addQuestionToTest,
    removeQuestionFromTest,
} from "../controllers/teacherController.js";
import {
    lockQuestion,
    lockTest,
    unlockQuestion,
    unlockTest,
} from "../controllers/resourceLockController.js";
import {
    exportTestResults,
    getReportsOverview,
    getStudentPerformance,
    getSubmissionDetails,
    getTestResults,
} from "../controllers/teacherReportsController.js";

const router = express.Router();
router.use(protect, requireRole("teacher"));

//Teacher
router.get("/users", getTeachers);

//Subject
router.get("/subjects", getSubjects);

//Student
router.get("/tests/students", getAllStudents);

//Test
router.post("/tests", createTest);
router.get("/analytics", getTeacherAnalytics);
router.get("/reports/overview", getReportsOverview);
router.get("/reports/test-results", getTestResults);
router.get("/reports/student-performance", getStudentPerformance);
router.get("/reports/submissions/:submissionId", getSubmissionDetails);
router.get("/reports/export", exportTestResults);
router.get("/tests", getMyTests);
router.get("/tests/:testId", getTestById);
router.get("/subjects/:subjectId/tests", getMyTestsBySubject);
router.patch("/tests/:testId/lock", lockTest);
router.patch("/tests/:testId/unlock", unlockTest);
router.patch("/tests/:testId/publish", publishTest);
router.patch("/tests/:testId/close", closeTest);
router.patch("/tests/:testId/archive", archiveTest);
router.delete("/tests/:testId", deleteTest);
router.post("/tests/:testId/assign", assignTest); // Assign test to specific students
router.put("/tests/:testId", updateTest);

//Question
router.post("/questions", createQuestion);
router.post("/tests/:testId/questions/add", addQuestionToTest);
router.delete("/tests/:testId/questions/:questionId/remove", removeQuestionFromTest); //update test by removing question
router.get("/tests/:testId/accessibleQuestions", getAccessibleQuestions); // get all accessible questions by teacher and quiz type
router.get("/tests/:testId/questions", getQuestionsByTest);
router.get("/questions", getQuestionsByTeacher);
router.get("/questions/:questionId", getQuestionById);
router.put("/questions/:questionId", updateQuestion);
router.patch("/questions/:questionId/lock", lockQuestion);
router.patch("/questions/:questionId/unlock", unlockQuestion);
router.delete("/questions/:questionId", deleteQuestion);
export default router;
