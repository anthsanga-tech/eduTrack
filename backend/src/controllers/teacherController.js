import Test from "../models/Test.js";
import Question from "../models/Question.js";
import User from "../models/User.js";
import Subject from "../models/Subject.js";
import mongoose from "mongoose";
import Submission from "../models/Submission.js";

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
            status: status || 'draft',
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

        return res.json(test);
    } catch (err) {
        return res.status(500).json({ message: "Server error" });
    }
};

// PUT /api/teacher/tests/:id @update test
export const updateTest = async (req, res) => {
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

        const test = await Test.findOne({
            _id: req.params.testId,
            teacher: req.user._id
        });

        if (!test) {
            return res.status(404).json({ message: "Test not found" });
        }

        test.title = title;
        test.description = description;
        test.dueDate = dueDate;
        test.durationMinutes = durationMinutes;
        test.subject = subject;
        test.assignedStudents = assignedStudents;
        if (difficulty !== undefined) {
            test.difficulty = difficulty;
            test.difficultyTags = difficulty === "mixed" ? difficultyTags : [];
        }

        // persist new fields
        test.status = status || test.status;
        test.startTime = startTime ? new Date(startTime) : test.startTime;
        test.attemptRules = {
          allowRetake: !!attemptRules.allowRetake,
          maxAttempts: Number(attemptRules.maxAttempts) || (test.attemptRules?.maxAttempts || 1)
        };

        await test.save();

        return res.json({ success: true, test });
    } catch (err) {
        return res.status(500).json({ message: "Update failed" });
    }
};

export const addQuestionToTest = async (req, res) => {
  let session;
  try {
    session = await mongoose.startSession();
    const { testId } = req.params;
    const { questionId } = req.body;
    const rtn = await session.withTransaction(async () => {
      const question = await Question.findById(questionId).session(session);
      if (!question) {
        throw Object.assign(new Error("Question not found"), { statusCode: 404 });
      }
      const test = await Test.findById(testId).session(session);
      if (!test) {
        throw Object.assign(new Error("Test not found"), { statusCode: 404 });
      }
      const allowedDifficulties = test.difficulty === "mixed"
        ? ["easy", "medium", "hard"]
        : [test.difficulty];
      if (!allowedDifficulties.includes(question.difficulty)) {
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
        { _id: testId },
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
    try {
        const session = await mongoose.startSession();
        const { testId, questionId } = req.params;
        await session.withTransaction(async () => {
            const question = await Question.findById(questionId).session(session);
            if (!question) {
                throw new Error("Question not found");
            }
            const testExists = await Test.findOne({
                _id: testId,
                questions: questionId
            }).session(session);

            // if question not part of test, skip
            if (!testExists) {
                return;
            }
            await Test.updateOne(
                { _id: testId },
                {
                    $pull: { questions: questionId },
                    $inc: { totalMarks: -question.mark }
                },
                { session }
            );
        });
        res.json({ message: "Removed Successfully" });
    } catch (error) {
        res.status(500).json({ message: "Remove failed" + error.message });
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
        const test = await Test.findById(testId).populate("subject");
        if (!test) {
            return res.status(404).json({ message: "Test not found" });
        }
        const questions = await Question.find({
            subject: test.subject._id,
            ...(test.difficulty === "mixed" ? {} : { difficulty: test.difficulty }),
            $or: [
                { createdBy: req.user._id },
                { allowedTeachers: req.user._id }
            ]
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
        const test = await Test.findById(testId).populate("questions");
        if (!test) {
            return res.status(404).json({ message: "Test not found" });
        }
        res.json({
            testName: test.title,
            questions: test.questions
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
    try {
        const { testId } = req.params;
        const { studentIds } = req.body; // array of student IDs

        const test = await Test.findById(testId);
        if (!test) return res.status(404).json({ message: "Test not found" });

        // Only teacher who created test can assign
        if (test.teacher.toString() !== req.user._id.toString()) {
            return res
                .status(403)
                .json({ message: "Not authorized to assign this test" });
        }

        test.assignedStudents = [
            ...new Set([...test.assignedStudents, ...studentIds]),
        ];
        await test.save();

        res.json({ message: "Test assigned successfully", test });
    } catch (error) {
        return res.status(500).json({ message: error.message });
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
          const totalSubmissions = await Submission.countDocuments({ test: t._id });
          const distinctStudents = (await Submission.distinct('student', { test: t._id })).length;
          return {
            ...t.toObject(),
            totalSubmissions,
            distinctStudentsSubmitted: distinctStudents
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
    try {
        const { testId } = req.params;
        const deletedTest = await Test.findByIdAndDelete(testId);
        if (!deletedTest) {
            return res.status(404).json({ success: false, message: "Test not found" });
        }
        res.status(200).json({ success: true, deletedTest });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
}

// get questions by teacher
export const getQuestionsByTeacher = async (req, res) => {
    try {
        const questions = await Question.find({
            $or: [
                { createdBy: req.user._id },
                { allowedTeachers: req.user._id }
            ]
        }).populate("subject", "subjectName");
        res.json(questions);
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
        const question = await Question.findById(questionId);
        return res.json(question);
    } catch (error) {
        return res.status(500).json({ message: error.message })
    }
}

export const updateQuestion = async (req, res) => {
    let session;
    let questionNotFound = false;
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
            const question = await Question.findById(questionId).session(session);
            if (!question) {
                questionNotFound = true;
                throw new Error("Question not found");
            }
            const oldMark = question.mark;
            question.questionText = questionText;
            question.options = options;
            question.correctOption = correctOption;
            question.mark = mark;
            if (difficulty !== undefined) question.difficulty = difficulty;
            question.allowedTeachers = allowedTeachers;
            await question.save();
            const delta = question.mark - oldMark;
            await Test.updateMany(
                { questions: question._id },
                { $inc: { totalMarks: delta } }
            );
        });
        return res.status(200).json({ success: true });
    } catch (error) {
        if (questionNotFound) {
            return res.status(404).json({ message: "Question not found" });
        }
        return res.status(500).json({ message: error.message })
    } finally {
        if (session) await session.endSession();
    }
}

export const deleteQuestion = async (req, res) => {
    try {
        const { questionId } = req.params;
        const deletedQuestion = await Question.findByIdAndDelete(questionId);
        if (!deletedQuestion) {
            return res.status(404).json({ success: false, message: "Question not found" });
        }
        res.status(200).json({ success: true, deletedQuestion });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
}
