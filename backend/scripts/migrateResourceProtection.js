import dotenv from "dotenv";
import mongoose from "mongoose";
import connectDB from "../src/config/db.js";
import Question from "../src/models/Question.js";
import Test from "../src/models/Test.js";

dotenv.config();

const initializeLockFields = async () => {
    try {
        await connectDB();
        const [testLocks, questionLocks, systemProtection, draftStatuses, testOwners, testTimestamps, questionOwners, questionTimestamps] = await Promise.all([
            Test.updateMany(
                { isLocked: { $exists: false } },
                { $set: { isLocked: false, lockedBy: null, lockedAt: null } }
            ),
            Question.updateMany(
                { isLocked: { $exists: false } },
                { $set: { isLocked: false, lockedBy: null, lockedAt: null } }
            ),
            Question.updateMany(
                { isSystemProtected: { $exists: false } },
                { $set: { isSystemProtected: false } }
            ),
            Test.updateMany(
                { status: "draft" },
                { $set: { status: "drafted" } }
            ),
            Test.updateMany(
                { lockedBy: { $exists: false } },
                { $set: { lockedBy: null } }
            ),
            Test.updateMany(
                { lockedAt: { $exists: false } },
                { $set: { lockedAt: null } }
            ),
            Question.updateMany(
                { lockedBy: { $exists: false } },
                { $set: { lockedBy: null } }
            ),
            Question.updateMany(
                { lockedAt: { $exists: false } },
                { $set: { lockedAt: null } }
            ),
        ]);
        console.info(
            `Initialized test lock metadata for ${testLocks.modifiedCount + testOwners.modifiedCount + testTimestamps.modifiedCount} fields, migrated ${draftStatuses.modifiedCount} tests to drafted status, initialized question lock metadata for ${questionLocks.modifiedCount + questionOwners.modifiedCount + questionTimestamps.modifiedCount} fields, and initialized ${systemProtection.modifiedCount} system-protection fields`
        );
    } catch (error) {
        console.error("Resource-protection migration failed:", error);
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
    }
};

initializeLockFields();
