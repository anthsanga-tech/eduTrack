import User from "../models/User.js";
import Subject from "../models/Subject.js";
import Test from "../models/Test.js";
import Submission from "../models/Submission.js";
import mongoose from "mongoose";

const validRoles = ["admin", "teacher", "student"];
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const validReportStatuses = ["drafted", "draft", "available", "upcoming", "closed"];

const getEffectiveTestStatus = (test, now = new Date()) => {
  if (test.status === "draft" || test.status === "drafted") return "drafted";
  if (test.status === "closed" || (test.dueDate && now >= new Date(test.dueDate))) return "closed";
  if (test.startTime && now < new Date(test.startTime)) return "upcoming";
  return test.status === "published" ? "available" : test.status;
};

const getReportFilters = (query) => {
  const filters = {};
  if (query.subject && query.subject !== "all") {
    if (!mongoose.isValidObjectId(query.subject)) throw new Error("Invalid subject ID");
    filters.subject = new mongoose.Types.ObjectId(query.subject);
  }
  if (query.teacher && query.teacher !== "all") {
    if (!mongoose.isValidObjectId(query.teacher)) throw new Error("Invalid teacher ID");
    filters.teacher = new mongoose.Types.ObjectId(query.teacher);
  }

  let dateRange;
  if (query.dateFrom || query.dateTo) {
    dateRange = {};
    if (query.dateFrom) {
      const dateFrom = new Date(query.dateFrom);
      if (Number.isNaN(dateFrom.getTime())) throw new Error("Invalid start date");
      dateRange.$gte = dateFrom;
    }
    if (query.dateTo) {
      const dateTo = new Date(query.dateTo);
      if (Number.isNaN(dateTo.getTime())) throw new Error("Invalid end date");
      dateTo.setUTCDate(dateTo.getUTCDate() + 1);
      dateRange.$lt = dateTo;
    }
    if (dateRange.$gte && dateRange.$lt && dateRange.$gte >= dateRange.$lt) {
      throw new Error("End date must be on or after start date");
    }
  }

  if (query.status && query.status !== "all" && !validReportStatuses.includes(query.status)) {
    throw new Error("Invalid test status");
  }

  return { filters, dateRange, status: query.status || "all" };
};

const monthKey = (year, month) => `${year}-${String(month + 1).padStart(2, "0")}`;

const getMonthlyTrend = async (model, dateField, startDate, match = {}) => {
  const grouped = await model.aggregate([
    { $match: { ...match, [dateField]: { $gte: startDate } } },
    {
      $group: {
        _id: {
          year: { $year: `$${dateField}` },
          month: { $month: `$${dateField}` },
        },
        count: { $sum: 1 },
      },
    },
  ]);

  const counts = new Map(grouped.map(row => [monthKey(row._id.year, row._id.month - 1), row.count]));
  const currentMonth = new Date();
  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 5 + index, 1);
    const key = monthKey(date.getFullYear(), date.getMonth());
    return {
      month: date.toLocaleString("en", { month: "short", year: "numeric" }),
      count: counts.get(key) || 0,
    };
  });
};

const validateUserDetails = ({ name, email, role, password }, requirePassword = false) => {
  if (typeof name !== "string" || !name.trim() || name.trim().length > 100) {
    return "Name is required and must be 100 characters or fewer";
  }
  if (
    typeof email !== "string" ||
    email.trim().length > 254 ||
    !emailPattern.test(email.trim())
  ) {
    return "A valid email address is required";
  }
  if (!validRoles.includes(role)) {
    return "A valid role is required";
  }
  if (
    (requirePassword || password !== undefined) &&
    (typeof password !== "string" ||
      password.length < 8 ||
      Buffer.byteLength(password, "utf8") > 72)
  ) {
    return "Password must be 8 to 72 bytes long";
  }
  return null;
};

const isLastAdmin = async (user) => {
  if (user.role !== "admin") return false;
  return (await User.countDocuments({ role: "admin" })) <= 1;
};

export const getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select("-password");
    res.json(users);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

export const getAdminAnalytics = async (req, res) => {
  try {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);

    const [
      students,
      teachers,
      admins,
      tests,
      submissions,
      subjects,
      newUsersTrend,
      testsTrend,
      submissionsTrend,
      testSummaries,
      subjectSubmissionStats,
      subjectCompletionStats,
      subjectNames,
      oversightTests,
      submissionCounts,
    ] = await Promise.all([
      User.countDocuments({ role: "student" }),
      User.countDocuments({ role: "teacher" }),
      User.countDocuments({ role: "admin" }),
      Test.countDocuments(),
      Submission.countDocuments({ submittedAt: { $ne: null } }),
      Subject.countDocuments(),
      getMonthlyTrend(User, "createdAt", sixMonthsAgo),
      getMonthlyTrend(Test, "createdAt", sixMonthsAgo),
      getMonthlyTrend(Submission, "submittedAt", sixMonthsAgo, { submittedAt: { $ne: null } }),
      Test.aggregate([
        {
          $group: {
            _id: "$subject",
            tests: { $sum: 1 },
            questions: { $sum: { $size: { $ifNull: ["$questions", []] } } },
            assignedStudents: { $sum: { $size: { $ifNull: ["$assignedStudents", []] } } },
          },
        },
      ]),
      Submission.aggregate([
        { $match: { submittedAt: { $ne: null } } },
        { $lookup: { from: "tests", localField: "test", foreignField: "_id", as: "test" } },
        { $unwind: "$test" },
        {
          $group: {
            _id: "$test.subject",
            submissions: { $sum: 1 },
            averagePercentage: {
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
      Submission.aggregate([
        { $match: { submittedAt: { $ne: null } } },
        { $lookup: { from: "tests", localField: "test", foreignField: "_id", as: "test" } },
        { $unwind: "$test" },
        { $group: { _id: { subject: "$test.subject", test: "$test._id", student: "$student" } } },
        { $group: { _id: "$_id.subject", completedStudents: { $sum: 1 } } },
      ]),
      Subject.find().select("_id subjectName").lean(),
      Test.find()
        .select("title status subject teacher questions createdAt startTime dueDate")
        .populate("subject", "subjectName")
        .populate("teacher", "name email")
        .lean(),
      Submission.aggregate([
        { $match: { submittedAt: { $ne: null } } },
        { $group: { _id: "$test", count: { $sum: 1 } } },
      ]),
    ]);

    const testSummaryBySubject = new Map(testSummaries.map(row => [String(row._id), row]));
    const submissionStatsBySubject = new Map(subjectSubmissionStats.map(row => [String(row._id), row]));
    const completionBySubject = new Map(subjectCompletionStats.map(row => [String(row._id), row.completedStudents]));
    const subjectPerformance = subjectNames.map(subject => {
      const key = String(subject._id);
      const testSummary = testSummaryBySubject.get(key) || {};
      const submissionStats = submissionStatsBySubject.get(key) || {};
      const assignedCount = testSummary.assignedStudents || 0;
      const completedCount = completionBySubject.get(key) || 0;
      return {
        _id: subject._id,
        subjectName: subject.subjectName,
        tests: testSummary.tests || 0,
        questions: testSummary.questions || 0,
        submissions: submissionStats.submissions || 0,
        averageScore: submissionStats.averagePercentage === null || submissionStats.averagePercentage === undefined
          ? null
          : Math.round(submissionStats.averagePercentage * 10) / 10,
        completionRate: assignedCount ? Math.round((completedCount / assignedCount) * 1000) / 10 : null,
      };
    });

    const submissionCountByTest = new Map(submissionCounts.map(row => [String(row._id), row.count]));
    const now = new Date();
    const testOversight = oversightTests.map(test => ({
      _id: test._id,
      title: test.title,
      status: test.status,
      availability: getEffectiveTestStatus(test, now),
      subject: test.subject?.subjectName || "Unknown subject",
      teacher: test.teacher?.name || "Unknown teacher",
      questionCount: test.questions?.length || 0,
      submissionCount: submissionCountByTest.get(String(test._id)) || 0,
      createdAt: test.createdAt,
      startTime: test.startTime,
      dueDate: test.dueDate,
    }));

    return res.json({
      totals: { students, teachers, admins, tests, submissions, subjects },
      trends: {
        users: newUsersTrend,
        tests: testsTrend,
        submissions: submissionsTrend,
      },
      subjectPerformance,
      testOversight,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

export const getAdminReport = async (req, res) => {
  try {
    let reportFilters;
    try {
      reportFilters = getReportFilters(req.query);
    } catch (err) {
      return res.status(400).json({ message: err.message });
    }
    const { filters, dateRange, status } = reportFilters;
    const reportType = req.query.type || "test-activity";
    const now = new Date();

    if (reportType === "test-activity") {
      const query = { ...filters, ...(dateRange ? { createdAt: dateRange } : {}) };
      const tests = await Test.find(query)
        .populate("subject", "subjectName")
        .populate("teacher", "name email")
        .lean();
      const counts = await Submission.aggregate([
        { $match: { submittedAt: { $ne: null, ...(dateRange || {}) } } },
        { $group: { _id: "$test", count: { $sum: 1 } } },
      ]);
      const countByTest = new Map(counts.map(row => [String(row._id), row.count]));
      const rows = tests.map(test => ({
        title: test.title,
        subject: test.subject?.subjectName || "",
        teacher: test.teacher?.name || "",
        status: getEffectiveTestStatus(test, now),
        questionCount: test.questions?.length || 0,
        assignedStudents: test.assignedStudents?.length || 0,
        submissionCount: countByTest.get(String(test._id)) || 0,
        createdAt: test.createdAt,
      })).filter(row => status === "all" || row.status === status);
      return res.json({ type: reportType, rows });
    }

    if (reportType === "student-outcomes") {
      const submissions = await Submission.find({
        submittedAt: { $ne: null, ...(dateRange || {}) },
      })
        .populate("student", "name email")
        .populate({
          path: "test",
          select: "title subject teacher status startTime dueDate totalMarks passPercentage",
          populate: [
            { path: "subject", select: "subjectName" },
            { path: "teacher", select: "name email" },
          ],
        })
        .lean();
      const rows = submissions.filter(submission => {
        const test = submission.test;
        if (!test) return false;
        if (filters.subject && String(test.subject?._id) !== String(filters.subject)) return false;
        if (filters.teacher && String(test.teacher?._id) !== String(filters.teacher)) return false;
        return status === "all" || getEffectiveTestStatus(test, now) === status;
      }).map(submission => {
        const test = submission.test;
        const percentage = test.totalMarks > 0 ? (submission.score / test.totalMarks) * 100 : null;
        return {
          student: submission.student?.name || "",
          email: submission.student?.email || "",
          test: test.title,
          subject: test.subject?.subjectName || "",
          teacher: test.teacher?.name || "",
          score: submission.score,
          totalMarks: test.totalMarks,
          percentage: percentage === null ? "" : Math.round(percentage * 10) / 10,
          passed: percentage === null ? "" : percentage >= (test.passPercentage ?? 50) ? "Yes" : "No",
          submittedAt: submission.submittedAt,
        };
      });
      return res.json({ type: reportType, rows });
    }

    if (reportType === "platform-usage") {
      const candidateTests = await Test.find(filters).select("_id status startTime dueDate createdAt").lean();
      const matchingTests = candidateTests.filter(test => status === "all" || getEffectiveTestStatus(test, now) === status);
      const matchingTestIds = matchingTests.map(test => test._id);
      const [usersByMonth, testsByMonth, submissionsByMonth] = await Promise.all([
        User.aggregate([
          { $match: dateRange ? { createdAt: dateRange } : {} },
          { $group: { _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" }, role: "$role" }, count: { $sum: 1 } } },
        ]),
        Test.aggregate([
          { $match: { _id: { $in: matchingTestIds }, ...(dateRange ? { createdAt: dateRange } : {}) } },
          { $group: { _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } }, count: { $sum: 1 } } },
        ]),
        Submission.aggregate([
          { $match: { submittedAt: { $ne: null, ...(dateRange || {}) }, test: { $in: matchingTestIds } } },
          { $group: { _id: { year: { $year: "$submittedAt" }, month: { $month: "$submittedAt" } }, count: { $sum: 1 } } },
        ]),
      ]);
      const rowsByMonth = new Map();
      const getRow = (year, month) => {
        const key = monthKey(year, month - 1);
        if (!rowsByMonth.has(key)) rowsByMonth.set(key, { month: key, newStudents: 0, newTeachers: 0, newAdmins: 0, testsCreated: 0, submissions: 0 });
        return rowsByMonth.get(key);
      };
      usersByMonth.forEach(row => {
        const target = getRow(row._id.year, row._id.month);
        const roleField = { student: "newStudents", teacher: "newTeachers", admin: "newAdmins" }[row._id.role];
        if (roleField) target[roleField] = row.count;
      });
      testsByMonth.forEach(row => { getRow(row._id.year, row._id.month).testsCreated = row.count; });
      submissionsByMonth.forEach(row => { getRow(row._id.year, row._id.month).submissions = row.count; });
      const rows = Array.from(rowsByMonth.values()).sort((a, b) => a.month.localeCompare(b.month));
      return res.json({ type: reportType, rows });
    }

    return res.status(400).json({ message: "Invalid report type" });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

export const createUser = async (req, res) => {
  try {
    const { name, email, password, role } = req.body || {};
    const validationError = validateUserDetails({ name, email, password, role }, true);
    if (validationError) return res.status(400).json({ message: validationError });

    const normalizedEmail = email.trim().toLowerCase();
    const exists = await User.findOne({
      email: { $regex: `^${normalizedEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
    });
    if (exists) return res.status(409).json({ message: "An account with this email already exists" });

    const user = await User.create({ name: name.trim(), email: normalizedEmail, password, role });
    res.status(201).json({ _id: user._id, name: user.name, email: user.email, role: user.role });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: "An account with this email already exists" });
    return res.status(500).json({ message: err.message });
  }
};

export const updateUser = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: "Invalid user ID" });
  }

  try {
    const { name, email, password, role } = req.body || {};
    const validationError = validateUserDetails({ name, email, password, role });
    if (validationError) return res.status(400).json({ message: validationError });

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user._id.equals(req.user._id) && role !== "admin") {
      return res.status(400).json({ message: "You cannot remove your own administrator role" });
    }
    if (user.role === "admin" && role !== "admin" && await isLastAdmin(user)) {
      return res.status(400).json({ message: "The last administrator cannot be demoted" });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const emailExists = await User.findOne({
      _id: { $ne: user._id },
      email: { $regex: `^${normalizedEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
    });
    if (emailExists) {
      return res.status(409).json({ message: "An account with this email already exists" });
    }

    const securityChanged = user.email.toLowerCase() !== normalizedEmail ||
      user.role !== role ||
      password !== undefined;
    user.name = name.trim();
    user.email = normalizedEmail;
    user.role = role;
    if (password !== undefined) user.password = password;
    if (securityChanged) {
      user.tokenVersion += 1;
      user.passwordResetToken = undefined;
      user.passwordResetExpires = undefined;
    }
    await user.save();

    return res.json({ _id: user._id, name: user.name, email: user.email, role: user.role });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: "An account with this email already exists" });
    return res.status(500).json({ message: err.message });
  }
};

export const deleteUser = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: "Invalid user ID" });
  }

  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user._id.equals(req.user._id)) {
      return res.status(400).json({ message: "You cannot delete your own account" });
    }
    if (await isLastAdmin(user)) {
      return res.status(400).json({ message: "The last administrator cannot be deleted" });
    }

    await User.deleteOne({ _id: user._id });
    return res.json({ message: "User deleted successfully" });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

export const getSubjects = async (req, res) => {
  try {
    const subjects = await Subject.aggregate([
      {
        $lookup: {
          from: "tests",
          let: { subjectId: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$subject", "$$subjectId"] } } },
            { $count: "count" },
          ],
          as: "testUsage",
        },
      },
      {
        $lookup: {
          from: "questions",
          let: { subjectId: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$subject", "$$subjectId"] } } },
            { $count: "count" },
          ],
          as: "questionUsage",
        },
      },
      {
        $project: {
          subjectName: 1,
          createdBy: 1,
          createdAt: 1,
          testsCount: { $ifNull: [{ $arrayElemAt: ["$testUsage.count", 0] }, 0] },
          questionsCount: { $ifNull: [{ $arrayElemAt: ["$questionUsage.count", 0] }, 0] },
        },
      },
    ]);
    res.json(subjects);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

export const createSubject = async (req, res) => {
  try {
    const { subjectName } = req.body;
    const subject = await Subject.create({ subjectName, createdBy: req.user._id });
    res.status(201).json(subject);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

export const updateSubject = async (req, res) => {
  try {
    const { subjectName } = req.body;
    const subject = await Subject.findByIdAndUpdate(req.params.id, { subjectName }, { new: true });
    if (!subject) return res.status(404).json({ message: "Subject not found" });
    res.status(200).json(subject);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

export const deleteSubject = async (req, res) => {
  try {
    const subject = await Subject.findByIdAndDelete(req.params.id);
    if (!subject) return res.status(404).json({ message: "Subject not found" });
    res.status(200).json({ message: "Subject deleted" });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};
