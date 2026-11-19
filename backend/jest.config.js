export default {
    testEnvironment: "node",
    testMatch: ["**/*.jest.test.js"],
    transform: {},
    testTimeout: 60000,
    collectCoverageFrom: [
        "src/services/resourceProtection.js",
        "src/controllers/studentController.js",
        "src/controllers/teacherController.js",
        "src/controllers/teacherReportsController.js",
        "!**/*.test.js",
    ],
    coverageReporters: ["text", "lcov"],
};
