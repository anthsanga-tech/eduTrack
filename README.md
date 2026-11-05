# eduTrack

eduTrack is a web-based assessment platform with separate applications for administrators, teachers, and students. Teachers create and assign tests, students complete timed attempts and review results, and administrators manage users and subjects.

## Features

### Administrators

- Create, update, and manage user accounts and roles
- Manage subjects
- View platform analytics and reports

### Teachers

- Create and manage questions, including difficulty levels
- Create and edit tests; organize questions by difficulty
- Set test duration, availability, passing percentage, and retake limits
- Assign tests to students
- Review student submissions and results
- View dashboard analytics for assignments, submissions, completion, and average scores

### Students

- View assigned tests and assessment progress
- Complete timed tests and submit answers
- View scores, pass/fail results, and result breakdowns
- Retake tests when allowed by the test rules

### Platform

- JWT-based sign-in with role-based access checks in the frontend and backend
- Password reset by email through Resend, or through a development-only console mode
- Automatic closure of published tests after their due date

## Applications and technology

| Application | Location | Stack |
| --- | --- | --- |
| Backend API | `backend/` | Node.js, Express 5, MongoDB, Mongoose |
| Admin | `frontend/admin-frontend/` | React 19, TypeScript, Vite |
| Teacher | `frontend/teacher-frontend/` | React 19, TypeScript, Vite, Tailwind CSS |
| Student | `frontend/student-frontend/` | React 19, TypeScript, Vite, Tailwind CSS |

The frontends use React Router and Axios. Each application has its own `package.json`; there are no root-level install or run scripts.

## Requirements

- Node.js and npm
- Access to the MongoDB Atlas cluster configured by the backend, or an update to the connection configuration for another MongoDB deployment

## Local development

### 1. Configure the backend

Create `backend/.env` with the MongoDB credentials and JWT secret:

```env
PORT=5000
MONGO_USER=your_mongodb_username
MONGO_PASS=your_mongodb_password
MONGO_DB=your_database_name
JWT_SECRET=replace_with_a_long_random_secret
NODE_ENV=development
PASSWORD_RESET_EMAIL_MODE=console
ADMIN_FRONTEND_URL=http://localhost:5173
TEACHER_FRONTEND_URL=http://localhost:5174
STUDENT_FRONTEND_URL=http://localhost:5175
```

The backend reads `MONGO_USER`, `MONGO_PASS`, and `MONGO_DB` to build its MongoDB connection string in `backend/src/config/db.js`. The current cluster host and connection options are defined there.

Console mode prints password-reset links in the backend terminal and is only accepted when `NODE_ENV=development`. To send real email instead, use `PASSWORD_RESET_EMAIL_MODE=resend` and configure `RESEND_API_KEY` and `PASSWORD_RESET_FROM` with a verified sender. Configure the three frontend URL variables for the URLs where each app is served. Never use console mode in production because reset links are written to logs.

### 2. Install dependencies

Run these commands from the repository root:

```bash
cd backend
npm install

cd ../frontend/admin-frontend
npm install

cd ../teacher-frontend
npm install

cd ../student-frontend
npm install
```

### 3. Start the backend

In a terminal:

```bash
cd backend
node server.js
```

The API listens on port `5000` by default, or on the port set by `PORT`.

### 4. Start the frontends

Start each frontend in a separate terminal. Fixed ports keep the URLs aligned with the password-reset configuration above:

```bash
cd frontend/admin-frontend
npm run dev -- --port 5173
```

```bash
cd frontend/teacher-frontend
npm run dev -- --port 5174
```

```bash
cd frontend/student-frontend
npm run dev -- --port 5175
```

Each frontend uses `http://localhost:5000/api` by default. To use a different API URL, set `VITE_API_URL` in that frontend's environment.

## API

The backend mounts these route groups:

| Route prefix | Purpose |
| --- | --- |
| `/api/auth` | Registration, login, and password reset |
| `/api/admin` | User, subject, analytics, and report management |
| `/api/teacher` | Question, test, assignment, and submission management |
| `/api/student` | Test attempts, dashboards, submissions, and results |

Protected API operations require an authorized user role; frontend route protection is not the only access check.

## Useful commands

Each frontend provides these scripts when run from its directory:

```bash
npm run dev
npm run build
npm run lint
```

The student frontend also defines `npm test`. The backend currently does not define a test or development script; start it with `node server.js`.
