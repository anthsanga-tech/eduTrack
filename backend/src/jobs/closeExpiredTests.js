import cron from "node-cron";
import Test from "../models/Test.js";

const closeExpiredTests = async () => {
  try {
    const result = await Test.updateMany(
      {
        status: "published",
        dueDate: { $lte: new Date() }
      },
      {
        $set: {
          status: "closed"
        }
      }
    );

    if (result.modifiedCount > 0) {
      console.log(`Closed ${result.modifiedCount} expired tests`);
    }
  } catch (error) {
    console.error("Failed to close expired tests:", error);
  }
};

export const scheduleExpiredTestCleanup = () => cron.schedule("* * * * *", closeExpiredTests);

export default closeExpiredTests;