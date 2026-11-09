import Test from "../models/Test.js";
import Question from "../models/Question.js";
import User from "../models/User.js";
import Subject from "../models/Subject.js";
import mongoose from "mongoose";
import Submission from "../models/Submission.js";
import {
    acquireQuestionWriteLocks,
    acquireTestLifecycleWriteLock,
    canCloseTest,
    canDeleteTest,
    canEditTest,
    canPublishTest,
    getTestLifecycleState,
    getQuestionDeleteProtectionReason,
    getQuestionAttemptState,
    getQuestionProtectionReason,
    getQuestionProtectionState,
    getQuestionProtectionStates,
    getTestPublicationValidationError,
    getTestAttemptState,
    getTestProtectionReason,
    normalizeTestStatus,
    normalizeDifficulty,
    getDifficultyQuery,
    isQuestionDifficultyCompatible,
    isOwnedBy,
} from "../services/resourceProtection.js";

// get all teachers to give permissions to specific teachers
export const getTeachers = async (req, res) => {
    try {
        const users = await User.find({ role: "teacher", _id: { $ne: req.user._id } });
        res.json(users);
    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
}

// @desc Create a new test
export const createTest = async (req, res) => {
    try {
        const {
          title,
          description,
          dueDate,
          durationMinutes,
          subject,
          assignedStudents,
          status,
          startTime,
          difficulty = "medium",
          difficultyTags = [],
          attemptRules = {}
        } = req.body;

        if (!["easy", "medium", "hard", "mixed"].includes(difficulty)) {
            return res.status(400).json({ success: false, message: "Difficulty must be easy, medium, hard, or mixed" });
        }
        if (difficulty === "mixed" && (
            !Array.isArray(difficultyTags) ||
            difficultyTags.length < 2 ||
            new Set(difficultyTags).size !== difficultyTags.length ||
            difficultyTags.some(tag => !["easy", "medium", "hard"].includes(tag))
        )) {
            return res.status(400).json({ success: false, message: "Mixed difficulty requires at least two unique difficulty tags" });
        }
        if (status !== undefined && normalizeTestStatus(status) !== "drafted") {
            return res.status(400).json({
                success: false,
                message: "Tests are created as drafted. Use the publish action to make a test available to students.",
            });
        }

        const test = await Test.create({
            title,
            description,
            difficulty,
            difficultyTags: difficulty === "mixed" ? difficultyTags : [],
            dueDate,
            durationMinutes,
            subject,
            teacher: req.user._id,
            assignedStudents,
            status: "drafted",
            startTime: startTime ? new Date(startTime) : null,
            attemptRules: {
              allowRetake: !!attemptRules.allowRetake,
              maxAttempts: Number(attemptRules.maxAttempts) || 1,
            }
        });
        return res.status(201).json({ success: true, message: "Test created successfully", test });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// GET /api/teacher/tests/:id @get Test By TestId
export const getTestById = async (req, res) => {
    try {
        const { testId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(testId)) {
            return res.status(400).json({ message: "Invalid test ID" });
        }

        const test = await Test.findOne({ _id: testId, teacher: req.user._id })
            .populate("assignedStudents", "name")
            .populate("subject", "subjectName");

        if (!test) {
            return res.status(404).json({ message: "Test not found" });
        }

        const attempts = await getTestAttemptState(test._id);
        return res.json({
            ...test.toObject(),
            ...getTestLifecycleState(test, attempts, req.user._id),
            totalSubmissions: await Submission.countDocuments({ test: test._id }),
        });
    } catch (err) {
        return res.status(500).json({ message: "Server error" });
    }
};

// PUT /api/teacher/tests/:id @update test
export const updateTest = async (req, res) => {
    let session;
    let responseStatus = 500;
    try {
        const {
          title,
          description,
          dueDate,
          durationMinutes,
          subject,
          assignedStudents,
          startTime,
          difficulty,
          difficultyTags,
          attemptRules = {}
        } = req.body;

        if (difficulty !== undefined && !["easy", "medium", "hard", "mixed"].includes(difficulty)) {
            return res.status(400).json({ message: "Difficulty must be easy, medium, hard, or mixed" });
        }
        if (difficulty === "mixed" && (
            !Array.isArray(difficultyTags) ||
            difficultyTags.length < 2 ||
            new Set(difficultyTags).size !== difficultyTags.length ||
            difficultyTags.some(tag => !["easy", "medium", "hard"].includes(tag))
        )) {
            return res.status(400).json({ message: "Mixed difficulty requires at least two unique difficulty tags" });
        }
        if (Object.hasOwn(req.body, "status")) {
            return res.status(400).json({
                message: "Test lifecycle status cannot be changed through the edit endpoint. Use publish or close.",
            });
        }
        if (!mongoose.Types.ObjectId.isValid(req.params.testId)) {
            return res.status(400).json({ message: "Invalid test ID" });
        }

        session = await mongoose.startSession();
        let updatedTest;
        await session.withTransaction(async () => {
            await acquireTestLifecycleWriteLock(req.params.testId, session);
            const test = await Test.findOne({
                _id: req.params.testId,
                teacher: req.user._id
            }).session(session);
            if (!test) {
                responseStatus = 404;
                throw new Error("Test not found");
            }

            const protectionReason = getTestProtectionReason(
                test,
                await getTestAttemptState(test._id, session),
                "update"
            );
            if (protectionReason) {
                responseStatus = 409;
                throw new Error(protectionReason);
            }

            if (title !== undefined) test.title = title;
            if (description !== undefined) test.description = description;
            if (dueDate !== undefined) test.dueDate = dueDate || null;
            if (durationMinutes !== undefined) test.durationMinutes = durationMinutes;
            if (subject !== undefined) test.subject = subject;
            if (assignedStudents !== undefined) test.assignedStudents = assignedStudents;
            if (difficulty !== undefined) {
                test.difficulty = difficulty;
                test.difficultyTags = difficulty === "mixed" ? difficultyTags : [];
            }

            if (startTime !== undefined) test.startTime = startTime ? new Date(startTime) : null;
            if (Object.keys(attemptRules).length > 0) {
                test.attemptRules = {
                    allowRetake: !!attemptRules.allowRetake,
                    maxAttempts: Number(attemptRules.maxAttempts) || (test.attemptRules?.maxAttempts || 1),
                };
            }

            await test.save({ session });
            updatedTest = test;
        });
        return res.json({ success: true, test: updatedTest });
    } catch (err) {
        if (responseStatus === 500 && err.statusCode) responseStatus = err.statusCode;
        if (responseStatus === 500) console.error("updateTest:", err);
        return res.status(responseStatus).json({
            message: responseStatus === 500 ? "Unable to update test" : err.message,
        });
    } finally {
        if (session) await session.endSession();
    }
};

export const addQuestionToTest = async (req, res) => {
  let session;
  try {
    session = await mongoose.startSession();
    const { testId } = req.params;
    const { questionId } = req.body;
    const rtn = await session.withTransaction(async () => {
      if (!mongoose.Types.ObjectId.isValid(testId) || !mongoose.Types.ObjectId.isValid(questionId)) {
        throw Object.assign(new Error("Invalid test or question ID"), { statusCode: 400 });
      }
      const question = await Question.findOne({
        _id: questionId,
        $or: [{ createdBy: req.user._id }, { allowedTeachers: req.user._id }],
      }).session(session);
      if (!question) {
        throw Object.assign(new Error("Question not found"), { statusCode: 404 });
      }
      await acquireQuestionWriteLocks([question._id], session);
      const test = await Test.findOne({ _id: testId, teacher: req.user._id }).session(session);
      if (!test) {
        throw Object.assign(new Error("Test not found"), { statusCode: 404 });
      }
      const protectionReason = getTestProtectionReason(
        test,
        await getTestAttemptState(test._id, session),
        "update"
      );
      if (protectionReason) {
        throw Object.assign(new Error(protectionReason), { statusCode: 409 });
      }
      if (!isQuestionDifficultyCompatible(test.difficulty, question.difficulty)) {
        throw Object.assign(new Error("Question difficulty does not match the test"), { statusCode: 400 });
      }
      // already added?
      const testExists = await Test.findOne({
        _id: testId,
        questions: questionId
      }).session(session);

      if (testExists) {
        return 0;
      }
      // add question to test
      const result = await Test.updateOne(
        {
          _id: testId,
          teacher: req.user._id,
          status: { $in: ["drafted", "draft"] },
          isLocked: { $ne: true },
        },
        {
          $addToSet: {
            questions: questionId
          },
          $inc: {
            totalMarks: question.mark
          }
        },
        { session }
      );
      if (result.modifiedCount > 0) {
        return 1;
      }
      throw Object.assign(new Error("Test could not be changed"), { statusCode: 409 });
    });
    res.json({
      message: rtn === 1 ? "Added Successfully" : "Already Added"
    });
  } catch (error) {
        res.status(error.statusCode || 500).json({
        message: error.message
        });
  } finally {
        session.endSession();
  }
};

export const removeQuestionFromTest = async (req, res) => {
    let session;
    try {
        session = await mongoose.startSession();
        const { testId, questionId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(testId) || !mongoose.Types.ObjectId.isValid(questionId)) {
            return res.status(400).json({ message: "Invalid test or question ID" });
        }
        await session.withTransaction(async () => {
            const question = await Question.findOne({
                _id: questionId,
                $or: [{ createdBy: req.user._id }, { allowedTeachers: req.user._id }],
            }).session(session);
            if (!question) {
                throw Object.assign(new Error("Question not found"), { statusCode: 404 });
            }
            await acquireQuestionWriteLocks([question._id], session);
            const testExists = await Test.findOne({
                _id: testId,
                teacher: req.user._id,
                questions: questionId
            }).session(session);

            // if question not part of test, skip
            if (!testExists) {
                const ownedTest = await Test.exists({ _id: testId, teacher: req.user._id }).session(session);
                if (!ownedTest) throw Object.assign(new Error("Test not found"), { statusCode: 404 });
                return;
            }
            const protectionReason = getTestProtectionReason(
                testExists,
                await getTestAttemptState(testId, session),
                "update"
            );
            if (protectionReason) throw Object.assign(new Error(protectionReason), { statusCode: 409 });
            const result = await Test.updateOne(
                {
                    _id: testId,
                    teacher: req.user._id,
                    status: { $in: ["drafted", "draft"] },
                    isLocked: { $ne: true },
                },
                {
                    $pull: { questions: questionId },
                    $inc: { totalMarks: -question.mark }
                },
                { session }
            );
            if (!result.modifiedCount) {
                throw Object.assign(new Error("Test could not be changed"), { statusCode: 409 });
            }
        });
        res.json({ message: "Removed Successfully" });
    } catch (error) {
        console.error("removeQuestionFromTest:", error);
        res.status(error.statusCode || 500).json({
            message: error.statusCode ? error.message : "Unable to remove the question from this test",
        });
    }
    finally {
        if (session) await session.endSession();
    }
}

export const getSubjects = async (req, res) => {
    try {
        const subjects = await Subject.find().select("_id subjectName");
        res.json(subjects);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
}

// get all students to assign to test
export const getAllStudents = async (req, res) => {
    try {
        const students = await User.find({ role: 'student' });
        res.json(students);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
}

export const getAccessibleQuestions = async (req, res) => {
    try {
        const { testId } = req.params;
        const test = await Test.findOne({ _id: testId, teacher: req.user._id }).populate("subject");
        if (!test) {
            return res.status(404).json({ message: "Test not found" });
        }
        const difficultyValues = normalizeDifficulty(test.difficulty) === "mixed"
            ? null
            : getDifficultyQuery(test.difficulty);
        const questions = await Question.find({
            subject: test.subject._id,
            ...(normalizeDifficulty(test.difficulty) === "mixed" || !difficultyValues
                ? {}
                : { difficulty: difficultyValues }),
            $or: [{ createdBy: req.user._id }, { allowedTeachers: req.user._id }],
        }).populate("subject", "subjectName");
        res.json(questions);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
}

// get questions by testId
export const getQuestionsByTest = async (req, res) => {
    try {
        const { testId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(testId)) {
            return res.status(400).json({ message: "Invalid test ID" });
        }
        const test = await Test.findOne({ _id: testId, teacher: req.user._id }).populate("questions");
        if (!test) {
            return res.status(404).json({ message: "Test not found" });
        }
        const protectionReason = getTestProtectionReason(
            test,
            await getTestAttemptState(test._id),
            "update"
        );
        res.json({
            testName: test.title,
            questions: test.questions,
            isLocked: test.isLocked,
            protectionReason,
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
}

// @desc Add question to a test
export const createQuestion = async (req, res) => {
    try {
        const { subject: subjectId, questionText, options, correctOption, mark, difficulty = "medium", allowedTeachers = [] } = req.body;

        if (!["easy", "medium", "hard"].includes(difficulty)) {
            return res.status(400).json({ message: "Difficulty must be easy, medium, or hard" });
        }

        const subjectExists = await Subject.findById(subjectId);

        if (!subjectExists) {
            return res.status(400).json("Subject not found!!");
        }

        const question = await Question.create({
            subject: subjectId,
            questionText,
            options,
            correctOption,
            mark,
            difficulty,
            createdBy: req.user._id,
            allowedTeachers,
        });

        res.status(201).json(question);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

// @desc Assign test to students
export const assignTest = async (req, res) => {
    let session;
    let responseStatus = 500;
    try {
        const { testId } = req.params;
        const { studentIds } = req.body; // array of student IDs

        if (!mongoose.Types.ObjectId.isValid(testId)) {
            return res.status(400).json({ message: "Invalid test ID" });
        }
        if (!Array.isArray(studentIds)) {
            return res.status(400).json({ message: "Student IDs must be provided as a list" });
        }
        session = await mongoose.startSession();
        let updatedTest;
        await session.withTransaction(async () => {
            await acquireTestLifecycleWriteLock(testId, session);
            const test = await Test.findOne({ _id: testId, teacher: req.user._id }).session(session);
            if (!test) {
                responseStatus = 404;
                throw new Error("Test not found");
            }
            const attempts = await getTestAttemptState(test._id, session);
            if (!canEditTest(test, attempts, req.user._id)) {
                responseStatus = 409;
                throw new Error(getTestProtectionReason(test, attempts, "update"));
            }
            test.assignedStudents = [
                ...new Set([...test.assignedStudents.map(String), ...studentIds.map(String)]),
            ];
            await test.save({ session });
            updatedTest = test;
        });

        return res.json({ message: "Test assigned successfully", test: updatedTest });
    } catch (error) {
        if (responseStatus === 500 && error.statusCode) responseStatus = error.statusCode;
        if (responseStatus === 500) console.error("assignTest:", error);
        return res.status(responseStatus).json({ message: error.message });
    } finally {
        if (session) await session.endSession();
    }
};

// @desc Get all tests by teacher
export const getMyTests = async (req, res) => {
    try {
        const tests = await Test.find({ teacher: req.user._id }).populate(
            "assignedStudents",
            "name email"
        );

        // enrich with submission stats
        const enhanced = await Promise.all(tests.map(async (t) => {
          const [totalSubmissions, distinctStudents, attemptState] = await Promise.all([
            Submission.countDocuments({ test: t._id }),
            Submission.distinct("student", { test: t._id }),
            getTestAttemptState(t._id),
          ]);
          return {
            ...t.toObject(),
            totalSubmissions,
            distinctStudentsSubmitted: distinctStudents.length,
            ...getTestLifecycleState(t, attemptState, req.user._id),
            protectionReason: getTestProtectionReason(t, attemptState, "update"),
          };
        }));

        res.json(enhanced);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

export const getTeacherAnalytics = async (req, res) => {
    try {
        const [tests, submissionStats] = await Promise.all([
            Test.find({ teacher: req.user._id })
                .select("title status assignedStudents totalMarks createdAt")
                .sort({ createdAt: -1 })
                .lean(),
            Submission.aggregate([
                { $match: { submittedAt: { $ne: null } } },
                {
                    $lookup: {
                        from: "tests",
                        localField: "test",
                        foreignField: "_id",
                        as: "test",
                    },
                },
                { $unwind: "$test" },
                { $match: { "test.teacher": req.user._id } },
                {
                    $group: {
                        _id: "$test._id",
                        attempts: { $sum: 1 },
                        students: {
                            $addToSet: {
                                $cond: [
                                    { $in: ["$student", { $ifNull: ["$test.assignedStudents", []] }] },
                                    "$student",
                                    null,
                                ],
                            },
                        },
                        averageScore: {
                            $avg: {
                                $cond: [
                                    { $gt: ["$test.totalMarks", 0] },
                                    { $multiply: [{ $divide: ["$score", "$test.totalMarks"] }, 100] },
                                    null,
                                ],
                            },
                        },
                    },
                },
            ]),
        ]);

        const statsByTest = new Map(
            submissionStats.map((stats) => [
                String(stats._id),
                {
                    attempts: stats.attempts,
                    completedStudents: stats.students.filter(Boolean).length,
                    averageScore: stats.averageScore,
                },
            ])
        );
        const assignedStudents = tests.reduce(
            (total, test) => total + (test.assignedStudents?.length || 0),
            0
        );
        const completedAssignments = tests.reduce(
            (total, test) => total + (statsByTest.get(String(test._id))?.completedStudents || 0),
            0
        );
        const submittedAttempts = submissionStats.reduce(
            (total, stats) => total + stats.attempts,
            0
        );
        const scoredAttempts = submissionStats.filter(
            (stats) => stats.averageScore !== null && stats.averageScore !== undefined
        );
        const averageScore = scoredAttempts.length
            ? scoredAttempts.reduce(
                (total, stats) => total + stats.averageScore * stats.attempts,
                0
            ) / scoredAttempts.reduce((total, stats) => total + stats.attempts, 0)
            : null;

        res.json({
            stats: {
                totalTests: tests.length,
                publishedTests: tests.filter((test) => test.status === "published").length,
                assignedStudents,
                submittedAttempts,
                averageScore,
                completionRate: assignedStudents
                    ? (completedAssignments / assignedStudents) * 100
                    : 0,
            },
            recentTests: tests.slice(0, 5).map((test) => {
                const testStats = statsByTest.get(String(test._id));
                return {
                    _id: test._id,
                    title: test.title,
                    status: test.status,
                    assignedStudents: test.assignedStudents?.length || 0,
                    submittedStudents: testStats?.completedStudents || 0,
                    submissions: testStats?.attempts || 0,
                    averageScore: testStats?.averageScore ?? null,
                    createdAt: test.createdAt,
                };
            }),
        });
    } catch (error) {
        console.error("getTeacherAnalytics:", error);
        res.status(500).json({ message: "Failed to load teacher analytics" });
    }
};

export const getMyTestsBySubject = async (req, res) => {
    try {
        const { subjectId } = req.params;
        const tests = await Test.find({ teacher: req.user._id, subject: subjectId }).populate(
            "assignedStudents",
            "name email"
        );
        res.json(tests);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
}

// delete test
export const deleteTest = async (req, res) => {
    let session;
    let responseStatus = 500;
    try {
        const { testId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(testId)) {
            return res.status(400).json({ success: false, message: "Invalid test ID" });
        }
        session = await mongoose.startSession();
        let deletedTest;
        await session.withTransaction(async () => {
            await acquireTestLifecycleWriteLock(testId, session);
            const test = await Test.findOne({ _id: testId, teacher: req.user._id }).session(session);
            if (!test) {
                responseStatus = 404;
                throw new Error("Test not found");
            }
            const attempts = await getTestAttemptState(test._id, session);
            if (!canDeleteTest(test, attempts, req.user._id)) {
                responseStatus = 409;
                throw new Error(getTestProtectionReason(test, attempts, "delete"));
            }
            deletedTest = await Test.findOneAndDelete({
                _id: testId,
                teacher: req.user._id,
                status: { $in: ["drafted", "draft"] },
                isLocked: { $ne: true },
            }, { session });
            if (!deletedTest) {
                responseStatus = 409;
                throw new Error("Test protection changed; reload and try again.");
            }
        });
        return res.status(200).json({ success: true, deletedTest });
    } catch (error) {
        if (responseStatus === 500 && error.statusCode) responseStatus = error.statusCode;
        if (responseStatus === 500) console.error("deleteTest:", error);
        return res.status(responseStatus).json({
            success: false,
            message: responseStatus === 500 ? "Unable to delete test" : error.message,
        });
    } finally {
        if (session) await session.endSession();
    }
}

export const publishTest = async (req, res) => {
    let session;
    let responseStatus = 500;
    try {
        const { testId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(testId)) {
            return res.status(400).json({ message: "Invalid test ID" });
        }
        session = await mongoose.startSession();
        let publishedTest;
        await session.withTransaction(async () => {
            await acquireTestLifecycleWriteLock(testId, session);
            const test = await Test.findOne({
                _id: testId,
                teacher: req.user._id,
            }).session(session);
            if (!test) {
                responseStatus = 404;
                throw new Error("Test not found");
            }
            const attempts = await getTestAttemptState(test._id, session);
            if (!canPublishTest(test, attempts, req.user._id)) {
                responseStatus = 409;
                throw new Error(getTestProtectionReason(test, attempts, "publish"));
            }
            const validationError = getTestPublicationValidationError(test);
            if (validationError) {
                responseStatus = 400;
                throw new Error(validationError);
            }

            await acquireQuestionWriteLocks(test.questions, session);
            test.status = "published";
            await test.save({ session });
            publishedTest = test;
        });
        return res.json({
            success: true,
            message: "Test published successfully",
            test: publishedTest,
        });
    } catch (error) {
        if (responseStatus === 500 && error.statusCode) responseStatus = error.statusCode;
        if (responseStatus === 500) console.error("publishTest:", error);
        return res.status(responseStatus).json({
            message: responseStatus === 500 ? "Unable to publish test" : error.message,
        });
    } finally {
        if (session) await session.endSession();
    }
};

export const closeTest = async (req, res) => {
    let session;
    let responseStatus = 500;
    try {
        const { testId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(testId)) {
            return res.status(400).json({ message: "Invalid test ID" });
        }
        session = await mongoose.startSession();
        let closedTest;
        await session.withTransaction(async () => {
            await acquireTestLifecycleWriteLock(testId, session);
            const test = await Test.findOne({
                _id: testId,
                teacher: req.user._id,
            }).session(session);
            if (!test) {
                responseStatus = 404;
                throw new Error("Test not found");
            }
            const attempts = await getTestAttemptState(test._id, session);
            if (!canCloseTest(test, attempts, req.user._id)) {
                responseStatus = 409;
                throw new Error(getTestProtectionReason(test, attempts, "close"));
            }

            test.status = "closed";
            await test.save({ session });
            closedTest = test;
        });
        return res.json({
            success: true,
            message: "Test closed. New attempts are no longer accepted; existing records are preserved.",
            test: closedTest,
        });
    } catch (error) {
        if (responseStatus === 500 && error.statusCode) responseStatus = error.statusCode;
        if (responseStatus === 500) console.error("closeTest:", error);
        return res.status(responseStatus).json({
            message: responseStatus === 500 ? "Unable to close test" : error.message,
        });
    } finally {
        if (session) await session.endSession();
    }
};

export const archiveTest = closeTest;

// get questions by teacher
export const getQuestionsByTeacher = async (req, res) => {
    try {
        const questions = await Question.find({
            $or: [
                { createdBy: req.user._id },
                { allowedTeachers: req.user._id }
            ]
        }).populate("subject", "subjectName");
        const protectionStates = await getQuestionProtectionStates(
            questions.map(question => question._id)
        );
        const examinationIds = [...new Set(
            [...protectionStates.values()].flatMap(state => state.examinationIds || [])
        )];
        const examinations = examinationIds.length
            ? await Test.find({ _id: { $in: examinationIds }, teacher: req.user._id })
                .select("_id title status startTime dueDate")
                .lean()
            : [];
        const examinationsById = new Map(examinations.map(test => [String(test._id), test]));
        const enhanced = questions.map(question => {
            const usage = protectionStates.get(String(question._id)) || {};
            usage.associatedExaminations = (usage.examinationIds || [])
                .map(id => examinationsById.get(String(id)))
                .filter(Boolean);
            return {
                ...question.toObject(),
                isOwner: isOwnedBy(question, "createdBy", req.user._id),
                ...getQuestionProtectionState(question, usage, req.user._id),
            };
        });
        res.json(enhanced);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
}

export const getQuestionById = async (req, res) => {
    try {
        const { questionId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(questionId)) {
            return res.status(400).json({ message: "Invalid question ID" });
        }
        const question = await Question.findOne({
            _id: questionId,
            createdBy: req.user._id,
        });
        if (!question) return res.status(404).json({ message: "Question not found" });
        const usage = await getQuestionAttemptState(question._id);
        const examinations = usage.examinationIds?.length
            ? await Test.find({
                _id: { $in: usage.examinationIds },
                teacher: req.user._id,
            }).select("_id title status startTime dueDate").lean()
            : [];
        usage.associatedExaminations = examinations;
        return res.json({
            ...question.toObject(),
            isOwner: true,
            ...getQuestionProtectionState(question, usage, req.user._id),
        });
    } catch (error) {
        return res.status(500).json({ message: error.message })
    }
}

export const updateQuestion = async (req, res) => {
    let session;
    let responseStatus = 500;
    try {
        const { questionText, options, correctOption, mark, difficulty, allowedTeachers } = req.body;
        const { questionId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(questionId)) {
            return res.status(400).json({ message: "Invalid question ID" });
        }
        if (difficulty !== undefined && !["easy", "medium", "hard"].includes(difficulty)) {
            return res.status(400).json({ message: "Difficulty must be easy, medium, or hard" });
        }
        session = await mongoose.startSession();
        await session.withTransaction(async () => {
            let question = await Question.findOne({
                _id: questionId,
                createdBy: req.user._id,
            }).session(session);
            if (!question) {
                responseStatus = 404;
                throw new Error("Question not found");
            }
            await acquireQuestionWriteLocks([question._id], session);
            question = await Question.findOne({
                _id: questionId,
                createdBy: req.user._id,
            }).session(session);
            if (!question) {
                responseStatus = 404;
                throw new Error("Question not found");
            }
            const usage = await getQuestionAttemptState(question._id, session);
            const protectionReason = getQuestionProtectionReason(question, usage);
            if (protectionReason) {
                responseStatus = 409;
                throw new Error(protectionReason);
            }
            const oldMark = question.mark;
            if (questionText !== undefined) question.questionText = questionText;
            if (options !== undefined) question.options = options;
            if (correctOption !== undefined) question.correctOption = correctOption;
            if (mark !== undefined) question.mark = mark;
            if (difficulty !== undefined) question.difficulty = difficulty;
            if (allowedTeachers !== undefined) question.allowedTeachers = allowedTeachers;
            await question.save();
            const delta = question.mark - oldMark;
            await Test.updateMany(
                { questions: question._id },
                { $inc: { totalMarks: delta } },
                { session }
            );
        });
        return res.status(200).json({ success: true });
    } catch (error) {
        if (responseStatus === 500 && error.statusCode) responseStatus = error.statusCode;
        if (responseStatus === 500) console.error("updateQuestion:", error);
        return res.status(responseStatus).json({
            message: responseStatus === 500 ? "Unable to update question" : error.message,
        });
    } finally {
        if (session) await session.endSession();
    }
}

export const deleteQuestion = async (req, res) => {
    let session;
    let responseStatus = 500;
    try {
        const { questionId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(questionId)) {
            return res.status(400).json({ success: false, message: "Invalid question ID" });
        }
        session = await mongoose.startSession();
        let deletedQuestion = null;
        await session.withTransaction(async () => {
            let question = await Question.findOne({
                _id: questionId,
                createdBy: req.user._id,
            }).session(session);
            if (!question) {
                responseStatus = 404;
                throw new Error("Question not found");
            }
            await acquireQuestionWriteLocks([question._id], session);
            question = await Question.findOne({
                _id: questionId,
                createdBy: req.user._id,
            }).session(session);
            if (!question) {
                responseStatus = 404;
                throw new Error("Question not found");
            }
            const usage = await getQuestionAttemptState(question._id, session);
            const protectionReason = getQuestionDeleteProtectionReason(question, usage);
            if (protectionReason) {
                responseStatus = 409;
                throw new Error(protectionReason);
            }
            const result = await Question.deleteOne({
                _id: questionId,
                createdBy: req.user._id,
                isLocked: { $ne: true },
                isSystemProtected: { $ne: true },
            }, { session });
            if (!result.deletedCount) {
                responseStatus = 409;
                throw new Error("Question protection changed; reload and try again.");
            }
            deletedQuestion = question.toObject();
        });
        return res.status(200).json({ success: true, deletedQuestion });
    } catch (error) {
        if (responseStatus === 500 && error.statusCode) responseStatus = error.statusCode;
        if (responseStatus === 500) console.error("deleteQuestion:", error);
        return res.status(responseStatus).json({
            success: false,
            message: responseStatus === 500 ? "Unable to delete question" : error.message,
        });
    } finally {
        if (session) await session.endSession();
    }
}
