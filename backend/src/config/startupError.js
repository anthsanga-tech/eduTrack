export const createStartupError = message => {
    const error = new Error(message);
    error.safeStartupMessage = message;
    return error;
};
