import mongoose from "mongoose";
import Test from "../models/Test.js";
import Submission from "../models/Submission.js";
import {
  acquireTestLifecycleWriteLock,
  acquireQuestionWriteLocks,
  createAttemptSnapshot,
  gradeAttemptAnswers,
} from "../services/resourceProtection.js";

const serializeSubmissionWithSnapshots = (submission) => {
  const result = submission.toObject();
  const snapshotsByQuestion = new Map(
    (result.questionSnapshots || []).map(question => [String(question.question), question])
  );
  result.answers = result.answers.map(answer => {
    const questionId = answer.question?._id || answer.question;
    const snapshot = answer.questionSnapshot || snapshotsByQuestion.get(String(questionId));
    const { question: snapshotQuestionId, ...snapshotFields } = snapshot || {};
    return {
      ...answer,
      question: snapshot
        ? { _id: questionId || snapshotQuestionId, ...snapshotFields }
        : answer.question,
    };
  });
  const test = result.test?.toObject?.() || result.test;
  if (test || result.testSnapshot) {
    result.test = { ...(test || {}), ...(result.testSnapshot || {}) };
  }
  result.passPercentage = result.testSnapshot?.passPercentage ?? result.test?.passPercentage;
  return result;
};

export const getStudentDashboard = async (req, res) => {
  try {
    const studentId = new mongoose.Types.ObjectId(req.user._id);

    // Get tests assigned to this student
    const tests = await Test.find({
      assignedStudents: studentId,
      status: { $in: ["published", "closed"] }
    })
      .select(
        "title description subject questions totalMarks passPercentage dueDate status"
      )
      .populate("subject", "name")
      .lean();

    const testIds = tests.map(test => test._id);

    // Get submitted attempts
    const submissions = await Submission.find({
      student: studentId,
      test: { $in: testIds },
      submittedAt: { $ne: null }
    })
      .populate("test", "title totalMarks passPercentage dueDate")
      .sort({ submittedAt: -1 })
      .lean();
    // A test is completed if student has at least one submitted attempt
    const completedTestIds = new Set(
      submissions.map(sub => sub.test?._id?.toString())
    );

    const assigned = tests.length;

    const completed = completedTestIds.size;

    const pending = tests.filter(
      test => !completedTestIds.has(test._id.toString())
    ).length;

    // Calculate passed / failed
    const passed = submissions.filter(sub => {
      if (!sub.test) return false;

      const totalMarks = sub.test.totalMarks || 0;
      const passPercentage = sub.test.passPercentage ?? 50;

      if (totalMarks <= 0) return false;

      const percentage = (sub.score / totalMarks) * 100;

      return percentage >= passPercentage;
    }).length;

    const failed = submissions.filter(sub => {
      if (!sub.test) return false;

      const totalMarks = sub.test.totalMarks || 0;
      const passPercentage = sub.test.passPercentage ?? 50;

      if (totalMarks <= 0) return false;

      const percentage = (sub.score / totalMarks) * 100;

      return percentage < passPercentage;
    }).length;

    // Average score percentage
    let averageScore = 0;

    if (submissions.length > 0) {
      const totalPercentage = submissions.reduce((sum, sub) => {
        const totalMarks = sub.test?.totalMarks || 0;

        if (totalMarks <= 0) return sum;

        return sum + (sub.score / totalMarks) * 100;
      }, 0);

      averageScore = Math.round(totalPercentage / submissions.length);
    }

    // Total time spent
    const totalTimeInSeconds = submissions.reduce(
      (sum, sub) => sum + (sub.timeTakenInSeconds || 0),
      0
    );

    // Recent submissions
    const recentSubmissions = submissions.slice(0, 5).map(sub => {
      const totalMarks = sub.test?.totalMarks || 0;

      const percentage =
        totalMarks > 0
          ? Math.round((sub.score / totalMarks) * 100)
          : 0;

      const passPercentage = sub.test?.passPercentage ?? 50;

      return {
        _id: sub._id,
        testId: sub.test?._id,
        title: sub.test?.title,
        score: sub.score,
        totalMarks,
        percentage,
        passed: percentage >= passPercentage,
        correct: sub.correct,
        wrong: sub.wrong,
        timeTakenInSeconds: sub.timeTakenInSeconds,
        submittedAt: sub.submittedAt
      };
    });

    res.json({
      stats: {
        assigned,
        completed,
        pending,
        passed,
        failed,
        averageScore,
        totalTimeInSeconds
      },
      recentSubmissions
    });

  } catch (error) {
    console.error("getStudentDashboard:", error);

    res.status(500).json({
      message: "Failed to load student dashboard"
    });
  }
};

export const getAssignedTests = async (req, res) => {
  try {
    const tests = await Test.find({
        assignedStudents: req.user._id,
        status: { $nin: ["draft", "drafted"] },
        questions: { $exists: true, $not: { $size: 0 } }
    })
    .select("-__v")
    .populate([
        {
            path: "teacher",
            select: "name email"
        },
        {
            path: "subject",
            select: "subjectName"
        },
        {
            path: "questions",
        }
    ]);

    // Attach latest submission (if any) per test for the requesting student
    const enhanced = await Promise.all(tests.map(async (test) => {
      let isPublished = false;
      let testStatus = null;
      const [attemptCount, activeAttempt] = await Promise.all([
        Submission.countDocuments({
          test: test._id,
          student: req.user._id
        }),
        Submission.exists({
          test: test._id,
          student: req.user._id,
          submittedAt: null,
        }),
      ]);
      const { allowRetake, maxAttempts } = test.attemptRules;
      const attemptsLeft = Math.max(maxAttempts - attemptCount,0);
      if (test.startTime && new Date() < test.startTime) {
        // upcoming — visible but cannot start
        testStatus = "upcoming";
      } else {
          if ((test.dueDate && new Date() >= test.dueDate) || (test.status && test.status === "closed")) {
            // expired — visible but cannot start
            testStatus = "closed";
          } else {
            isPublished = true;
            testStatus = "published";
          }
      }
      const testAccess = {
          attemptCount,
          attemptsLeft,
          maxAttempts,
          canStart: Boolean(activeAttempt) || (isPublished && attemptCount < 1),
          canAttempt: Boolean(activeAttempt) || (isPublished && attemptsLeft > 0),
          canRetake: isPublished && allowRetake && attemptsLeft > 0 && attemptCount > 0,
          canViewResult: attemptCount > 0
      };
      return {
        ...test.toObject(),
        testStatus,
        testAccess
      }
    }));

    res.json(enhanced);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getTestQuestions = async (req, res) => {
  try {
    const { testId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(testId)) return res.status(400).json({ message: "Invalid test id" });

    const test = await Test.findById(testId).populate([{
      path: 'questions',
      select: 'questionText options' // hide correct answers
    }, { path: 'subject', select: 'subjectName' }]);
    if (!test) return res.status(404).json({ message: "Test not found" });
    // ensure student is assigned
    if (!test.assignedStudents.map(String).includes(String(req.user._id))) return res.status(403).json({ message: "Not assigned this test" });

    // Let students resume attempts started before the test was automatically closed.
    const now = new Date();
    const activeAttempt = await Submission.exists({
      test: testId,
      student: req.user._id,
      submittedAt: null,
    });
    if (!activeAttempt) {
      if (test.status && test.status !== 'published') return res.status(403).json({ message: 'Test not available' });
      if (test.startTime && new Date(test.startTime) > now) return res.status(403).json({ message: 'Test not started yet' });
      if (test.dueDate && new Date(test.dueDate) <= now) return res.status(403).json({ message: 'Test is closed' });
    }
    res.json({ test, questions: test.questions });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getCreateAttemptID = async (req, res) => {
  let session;
  let responseStatus = 500;
  try {
    const { testId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(testId)) return res.status(400).json({ message: "Invalid test id" });

    session = await mongoose.startSession();
    let submissionId;
    await session.withTransaction(async () => {
      await acquireTestLifecycleWriteLock(testId, session);
      const test = await Test.findById(testId).populate("questions").session(session);
      if (!test) {
        responseStatus = 404;
        throw new Error("Test not found");
      }

      if (!test.assignedStudents.map(String).includes(String(req.user._id))) {
        responseStatus = 403;
        throw new Error("Not assigned this test");
      }

      const existing = await Submission.findOne({
        test: testId,
        student: req.user._id,
        submittedAt: null,
      }).session(session);
      if (existing) {
        if (!existing.questionSnapshots?.length) {
          existing.questionSnapshots = createAttemptSnapshot(test, test.questions).questionSnapshots;
        }
        if (!existing.testSnapshot) {
          existing.testSnapshot = createAttemptSnapshot(test, []).testSnapshot;
        }
        await existing.save({ session });
        submissionId = existing._id;
        return;
      }

      const now = new Date();
      if (test.status !== "published") {
        responseStatus = 403;
        throw new Error("Test not available");
      }
      if (test.startTime && new Date(test.startTime) > now) {
        responseStatus = 403;
        throw new Error("Test not started yet");
      }
      if (test.dueDate && new Date(test.dueDate) <= now) {
        responseStatus = 403;
        throw new Error("Test is closed");
      }

      await acquireQuestionWriteLocks(test.questions.map(question => question._id), session);
      const submission = new Submission({
        test: testId,
        student: req.user._id,
        startedAt: now,
        ...createAttemptSnapshot(test, test.questions),
      });
      await submission.save({ session });
      submissionId = submission._id;
    });

    return res.json({ submissionId });
  } catch (err) {
    if (responseStatus === 500 && err.statusCode) responseStatus = err.statusCode;
    return res.status(responseStatus).json({ message: err.message });
  } finally {
    if (session) await session.endSession();
  }
};

export const submitTest = async (req, res) => {
  try {
    const { testId } = req.params;
    const { answers, submissionId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(testId)) return res.status(400).json({ message: "Invalid test id" });
    const test = await Test.findById(testId).populate("questions");
    if (!test) return res.status(404).json({ message: "Test not found" });
    if (!test.assignedStudents.map(String).includes(String(req.user._id))) return res.status(403).json({ message: "Not assigned this test" });
    if (!Array.isArray(answers)) return res.status(400).json({ message: "Answers must be provided as a list" });

    if (!mongoose.Types.ObjectId.isValid(submissionId)) return res.status(400).json({ message: "Invalid submission id" });
    const submission = await Submission.findOne({ _id: submissionId, test: testId, student: req.user._id });
    if (!submission) return res.status(404).json({ message: "Submission not found" });
    if (submission.submittedAt) return res.status(409).json({ message: "This attempt has already been submitted" });

    const now = new Date();
    if (!submission.startedAt) return res.status(409).json({ message: "This attempt has no start time" });
    if (test.status && test.status !== 'published' && !submission.questionSnapshots?.length) {
      return res.status(403).json({ message: 'Test not available' });
    }
    if (!submission.questionSnapshots?.length) {
      if (test.startTime && new Date(test.startTime) > now) return res.status(403).json({ message: 'Test not started yet' });
      if (test.dueDate && new Date(test.dueDate) <= now) return res.status(403).json({ message: 'Test is closed' });
    }

    const allowedQuestionIds = new Set(test.questions.map(question => String(question._id)));
    if (answers.some(answer =>
      !answer ||
      !mongoose.Types.ObjectId.isValid(answer.question) ||
      !["a", "b", "c", "d"].includes(answer.selected) ||
      !allowedQuestionIds.has(String(answer.question))
    )) {
      return res.status(400).json({ message: "One or more answers are invalid for this test" });
    }

    const questionSnapshots = submission.questionSnapshots?.length
      ? submission.questionSnapshots
      : createAttemptSnapshot(test, test.questions).questionSnapshots;
    const {
      answerSnapshots,
      score,
      correct,
      wrong,
    } = gradeAttemptAnswers(answers, questionSnapshots);
    if (answerSnapshots.some(answer => !answer)) {
      return res.status(400).json({ message: "One or more questions are not part of this attempt" });
    }

    submission.questionSnapshots = questionSnapshots;
    submission.testSnapshot = submission.testSnapshot || createAttemptSnapshot(test, []).testSnapshot;
    submission.answers = answerSnapshots;
    submission.correct = correct;
    submission.wrong = wrong;
    submission.score = score;
    submission.timeTakenInSeconds = Math.floor((new Date() - submission.startedAt) / 1000);
    submission.submittedAt = new Date();
    await submission.save();

    res.json({ message: "Submitted", submittedId: submission._id });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const viewResult = async (req, res) => {
  try {
    const { testId, submittedID } = req.params;
    if (!mongoose.Types.ObjectId.isValid(testId)) return res.status(400).json({ message: "Invalid test id" });
    if (!mongoose.Types.ObjectId.isValid(submittedID)) return res.status(400).json({ message: "Invalid submission id" });
    const submission = await Submission
                      .findOne({
                        _id: submittedID,
                        test: testId,
                        student: req.user._id,
                        submittedAt: { $ne: null },
                      })
                      .populate("test", "title totalMarks passPercentage durationMinutes")
                      .populate("answers.question");
    if (!submission) return res.status(404).json({ message: "Result not found" });
    res.json(serializeSubmissionWithSnapshots(submission));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getSubmissions = async (req, res) => {
  try {
    const { testId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(testId)) return res.status(400).json({ message: "Invalid test id" });
    const submissions = await Submission.find({
      student: req.user._id,
      test: testId,
      submittedAt: { $ne: null },
    })
      .populate({
          path: 'test',
          select: 'title description subject totalMarks passPercentage',
        })
      .populate({
          path: 'answers.question',
          select: 'questionText options correctOption'
        })
      .sort({ submittedAt: -1 });
    const result = submissions.map(submission => {
      const snapshot = submission.testSnapshot || {};
      const testData = submission.test?.toObject?.() || submission.test || {};
      const passPercentage = snapshot.passPercentage ?? testData.passPercentage ?? 50;
      const totalMarks = snapshot.totalMarks ?? testData.totalMarks ?? 0;
      const passed = totalMarks > 0 ? Math.round((submission.score / totalMarks) * 100) >= passPercentage : false;
      const row = serializeSubmissionWithSnapshots(submission);
      row.test = { ...testData, ...snapshot };
      return {
        ...row,
        result: passed ? 'Pass' : 'Fail',
      }
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
