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
- Use Results & Reports to review completed attempts, pass rates, test performance, student progress, answer snapshots, and filtered CSV exports

### Students

- View assigned tests and assessment progress
- Complete timed tests and submit answers
- View scores, pass/fail results, and result breakdowns
- Retake tests when allowed by the test rules

### Platform

- JWT-based sign-in with role-based access checks in the frontend and backend
- Password reset by email through Resend, or through a development-only console mode
- Automatic closure of published tests after their due date

## Test Lifecycle and Protection

Test lifecycle status, manual locking, and examination usage are independent concepts. Lifecycle status controls publication; manual locking is an owner-controlled restriction for drafted tests; examination attempts and records preserve historical integrity.

### Test lifecycle

Tests follow this one-way lifecycle:

```text
DRAFTED
   |
   | Publish (if unlocked and valid)
   v
PUBLISHED
   |
   | Close (authorized action)
   v
CLOSED
```

- **Drafted:** The owning teacher can prepare and edit the test, questions, assignments, and settings, subject to manual lock and record restrictions.
- **Published:** The test is available to assigned students according to its schedule. Its content is immutable even if no student has attempted it.
- **Closed:** The test is read-only and unavailable for new attempts. Closed is terminal for ordinary test management.

Legacy records with status `draft` are treated as drafted by the backend and test-list UI, so eligible unlocked tests remain manageable during migration. In the test list, these tests can be viewed, edited, and managed; delete and manual-lock actions are available only when allowed by lock and attempt protections. The UI normalizes legacy status and falls back to lifecycle-derived capabilities only for legacy `draft` data, while the backend remains authoritative for every write. The resource-protection migration changes stored `draft` values to `drafted`.

### Teacher test-list workflow

The test list shows lifecycle badges and record information, but does not provide **Publish**, **Close**, or any other lifecycle-status transition control. It provides View/Manage questions, Edit test, Delete, and drafted-test Lock/Unlock actions according to the test's backend capabilities. For a test that cannot be edited, its list-page **View** action opens a read-only question summary; an editable test's **Manage questions** action opens the question library and builder. The read-only view does not show search/filter, add, or remove controls.

Publishing and closing remain backend lifecycle operations, not list-page actions. The Create Test status selector starts tests as Draft; Published and Closed are unavailable until their lifecycle prerequisites are met. In the Edit Test form, an eligible drafted test can be saved and published through the dedicated publish endpoint. Published tests remain immutable, but the edit route provides a status-only view that can close a published test when no attempt is active. Closed tests cannot be reopened. The forms never submit a direct status change through the ordinary create/edit endpoints; the backend lifecycle checks remain authoritative.

### Manual locking

Manual locking is available only for drafted tests. Locking prevents modification and publishing but does not change lifecycle status. Unlocking restores drafted-test editing for its owner. Published and closed tests cannot be manually locked or unlocked.

```text
Drafted + Unlocked = Editable
Drafted + Locked   = Read-only
Published          = Immutable
Closed             = Read-only
```

### Examination usage protection

Started attempts and examination records are determined from the `Submission` relationship, not from the manual lock field. Attempt records prevent test changes or deletion; a published test is immutable regardless of usage. Test and question snapshots captured when an attempt starts preserve the content and scoring values used for historical results. Existing attempts and results are retained.

Closing is a lifecycle operation, not an unlock or manual lock. An authorized teacher can close a published test when no attempt is currently active. Explicit closure is rejected while an attempt is in progress, with an explanatory API response. Historical attempts alone do not prevent closure. Closure prevents new attempts; existing attempt resume and submission behavior continues to follow the student attempt rules. The due-date job may also close published tests automatically.

### Backend test action and permission matrix

The table describes backend capabilities for the owning teacher, not controls currently shown on the test list. Administrators may lock or unlock drafted tests through the dedicated admin endpoints; other lifecycle actions remain owner-only. Publishing additionally requires a valid test; deleting is allowed only for a drafted, unlocked test without examination records. There is no ordinary reopen operation.

| Action | Drafted, unlocked | Drafted, locked | Published | Closed |
| --- | --- | --- | --- | --- |
| View | Yes | Yes | Yes | Yes |
| Edit | Yes, absent records | No | No | No |
| Lock | Yes (owner/admin) | No | No | No |
| Unlock | No | Yes (owner/admin) | No | No |
| Publish | If valid | No | No | No |
| Close | No | No | Yes, if no active attempt | No |
| Delete | If no records | No | No | No |

| Test-list control | When available |
| --- | --- |
| View | Always, when the test can be viewed; opens the read-only question summary for non-editable tests |
| Manage questions | Drafted, unlocked, editable test with no attempt records |
| Edit test | Same conditions as Manage questions |
| Lock / Unlock | Drafted tests only, when permitted by backend capabilities |
| Delete | Drafted, unlocked tests without examination records |
| Publish / Close | Not presented on the test list |

### Important business rules

1. A locked drafted test must be unlocked before publishing.
2. Published tests cannot be edited or manually locked/unlocked.
3. Closed tests cannot be edited, published, locked, unlocked, or deleted.
4. Published tests can be closed through the dedicated lifecycle action.
5. Closing prevents new examination attempts.
6. Historical examination attempts and results remain accessible and are never cascade-deleted by test deletion.
7. Test lifecycle status, manual locking, and examination usage are separate concepts.

### Developer notes

- Lifecycle capabilities and protection reasons are centralized in `backend/src/services/resourceProtection.js`.
- API ownership, lifecycle, locking, and attempt checks are enforced in `backend/src/controllers/teacherController.js` and `backend/src/controllers/resourceLockController.js`. Student attempt creation is coordinated in `backend/src/controllers/studentController.js`.
- Attempt usage is derived from `Submission` records (`submittedAt: null` identifies an active attempt). Test lifecycle transitions and attempt creation use transactions and a shared test write lock.
- `PATCH /api/teacher/tests/:testId/publish` publishes a valid drafted test. `PATCH /api/teacher/tests/:testId/close` closes a published test. The legacy `PATCH /api/teacher/tests/:testId/archive` route remains an alias for close.
- `PATCH /api/admin/tests/:testId/lock` and `/unlock` allow administrators to manage manual locks on drafted tests; they do not change lifecycle status or bypass attempt protection.
- Backend capability fields are returned with the teacher's test list and detail responses. The teacher UI renders lifecycle badges and actions in `frontend/teacher-frontend/src/components/TestList.jsx`, with status normalization in `frontend/teacher-frontend/src/utils/testLifecycle.js`.
- The teacher routes `/tests/manage/:testId` and `/tests/view/:testId` share `frontend/teacher-frontend/src/pages/ManageQuestions.jsx`; the latter is read-only and omits the question library and its mutation controls.

### Question protection

Question protection has three independent sources: system protection (`isSystemProtected`), the teacher-controlled manual lock (`isLocked`), and usage derived from examination relationships. Teachers cannot change system-protection state. They can manually lock and unlock questions they own unless system or examination-use protection applies.

- A question in a started examination or referenced by an examination attempt/record cannot be edited, deleted, or manually unlocked. Draft examinations and future scheduled examinations do not protect their questions before they start.
- A question still attached to an editable draft can be edited, but must first be removed from that draft before deletion.
- Teachers can edit, delete, lock, or unlock only questions they own. Shared questions can be used by permitted teachers but remain managed by their owner.

When an attempt begins, eduTrack stores snapshots of its test settings and question content. Scoring and result views use those snapshots so later changes cannot rewrite results. Historical references are also considered if a question was removed from an examination after records were created. Questions with examination references cannot be deleted. Legacy attempts created before snapshots were stored can be protected from future changes, but their earlier question content cannot be reconstructed.

After updating the backend, initialize lock metadata and the system-protection default on existing MongoDB records by running from `backend/`:

```bash
npm run migrate:resource-protection
```

The migration adds default unlocked/manual metadata and `isSystemProtected: false` where fields are missing, and changes legacy test status `draft` to `drafted`; it does not delete or rewrite examination data.

## Applications and technology

| Application | Location | Stack |
| --- | --- | --- |
| Backend API | `backend/` | Node.js, Express 5, MongoDB, Mongoose |
| Admin | `frontend/admin-frontend/` | React 19, TypeScript, Vite |
| Teacher | `frontend/teacher-frontend/` | React 19, TypeScript, Vite, Tailwind CSS |
| Student | `frontend/student-frontend/` | React 19, TypeScript, Vite, Tailwind CSS |

The frontends use React Router and Axios. Each application has its own `package.json`; there are no root-level install or run scripts.

### Responsive Design

eduTrack supports small mobile (320–374px), standard mobile (375–430px), large mobile (431–767px), tablet (768–1023px), laptop (1024–1439px), and desktop (1440px and wider). Desktop navigation retains its sidebar; below 1024px, the sidebar becomes an accessible off-canvas drawer with a backdrop. The drawer closes with Escape, when its backdrop is selected, or after choosing a route, and prevents background scrolling while open.

Data tables retain all columns and row actions and scroll horizontally inside their own containers when needed. Forms and report filters adapt to narrower columns, while modal dialogs constrain their height and allow their content to scroll. The student test view keeps its timer and submission controls available, wraps long question and answer text, and moves question navigation into a compact layout on smaller screens. Responsive rules are shared by all three frontends to keep navigation and layout behavior consistent.

### Theme Support

All three eduTrack applications support Light Mode and Dark Mode. Use the sun/moon control in the upper-right corner to switch themes without reloading. The selected theme is saved in `localStorage` and restored on the next visit; when there is no saved selection, the application follows the operating system color preference. Once selected manually, system preference changes do not override the choice.

Each app owns one `ThemeProvider` in its `src/context/ThemeContext.tsx`; the shared persistence helpers are in `frontend/utils/themeStorage.js`, and common colors and dark-mode component rules are maintained in `frontend/utils/theme.css`. Each app's HTML applies the saved or system theme before the app loads to prevent a flash of the wrong theme. To theme a new component, prefer the existing `--color-*` tokens (or app tokens such as `--surface`, `--line`, and `--accent`) for backgrounds, text, borders, and controls; add a focused `[data-theme="dark"]` rule in the shared stylesheet only when a component needs a specific dark-mode treatment. Preserve semantic status colors and ensure keyboard focus remains visible.

## Requirements

- Node.js and npm
- Access to the existing MongoDB Atlas cluster and database

## Local development

### 1. Configure the backend

Create `backend/.env` with the MongoDB credentials and JWT secret:

```env
NODE_ENV=development
PORT=5000
MONGODB_URI=mongodb+srv://your_user:your_password@your_existing_atlas_cluster/your_existing_database?retryWrites=true&w=majority&authSource=admin
JWT_SECRET=replace_with_a_long_random_secret
PASSWORD_RESET_EMAIL_MODE=console
ADMIN_FRONTEND_URL=http://localhost:5173
TEACHER_FRONTEND_URL=http://localhost:5174
STUDENT_FRONTEND_URL=http://localhost:5175
```

Use the existing Atlas cluster and database in `MONGODB_URI`; this configuration does not create or select a replacement database. For backward compatibility, the backend also accepts `MONGO_USER`, `MONGO_PASS`, and `MONGO_DB`, using its previous Atlas hostname when `MONGO_CLUSTER` is not set. Setting `MONGO_CLUSTER` explicitly continues to use an Atlas SRV URI. Do not put credentials in source control. The backend fails at startup if database, JWT, frontend-origin, or production email configuration is incomplete.

Console mode prints password-reset links in the backend terminal and is only accepted when `NODE_ENV=development`. To send real email instead, use `PASSWORD_RESET_EMAIL_MODE=resend` and configure `RESEND_API_KEY` and `PASSWORD_RESET_FROM` with a verified sender. The three frontend URL variables are also the CORS allowlist and must be the exact deployed frontend origins in production.

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

Each frontend uses `http://localhost:5000/api` by default. Copy its `.env.example` to `.env` for local work, or set `VITE_API_URL` in that Vercel project to the deployed Render API URL ending in `/api`. Production builds fail unless this is an HTTPS URL. Vite variables are public build-time values; never put backend secrets in a frontend environment variable.

## Production deployment configuration

Deployment is not performed by this repository setup. Configure the existing Atlas database, one Render backend service, and three separate Vercel projects:

### Render backend service

- Set the service root directory to `backend`.
- Install with `npm install`; start with `npm start`.
- Set `NODE_ENV=production` and `MONGODB_URI` to the connection URI for the **existing** Atlas cluster and database.
- Set a strong `JWT_SECRET`.
- Set `ADMIN_FRONTEND_URL`, `TEACHER_FRONTEND_URL`, and `STUDENT_FRONTEND_URL` to the three exact HTTPS Vercel origins (no path or trailing slash is needed).
- Set `PASSWORD_RESET_EMAIL_MODE=resend`, `RESEND_API_KEY`, and `PASSWORD_RESET_FROM` to a verified Resend sender. Production startup rejects console mode or missing mail configuration.
- Let Render provide `PORT`; the server binds to that assigned port after MongoDB connects.

The CORS allowlist includes the three configured frontend origins. Localhost origins are added outside production; unconfigured preview domains are not implicitly trusted.

### Vercel frontend projects

Create one project per frontend, using its directory as the project root:

- `frontend/admin-frontend`
- `frontend/teacher-frontend`
- `frontend/student-frontend`

For each project, set `VITE_API_URL` to `https://<render-service>.onrender.com/api` (replace with the actual Render service URL) and provide it for every Vercel environment that builds the app. Use each production project’s HTTPS origin for its corresponding Render `*_FRONTEND_URL`. The existing Axios services already use `VITE_API_URL` and retain the localhost fallback for development.

Example variable files are provided at `backend/.env.example` and in each frontend directory. Copy them to local `.env` files as appropriate; real `.env` files remain git-ignored.

## Automated testing

The backend uses Jest for business-rule and API tests, Supertest for HTTP requests, and MongoDB Memory Server for an isolated replica-set database. Integration tests connect only to the generated in-memory MongoDB URI; they do not load `backend/.env`, call the application's database connector, or fall back to a configured development or production database. The first run may download a MongoDB binary.

The three frontends use Vitest, jsdom, and React Testing Library. Each application has a separate test environment and package installation.

### Continuous integration

GitHub Actions runs the backend test suite and, independently, the test, lint, and production build checks for each frontend. The workflow runs on pushes to `main`, pull requests targeting `main`, and manual dispatch. Frontend builds use a non-secret placeholder API URL. View run logs in the repository's **Actions** tab; pull request checks also appear on the pull request.

Install dependencies from each project directory if they are not already installed:

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

Run all backend Jest and existing Node test-runner tests:

```bash
cd backend
npm test
```

Run backend Jest tests with coverage:

```bash
npm run test:coverage
```

Run frontend component and utility tests from each frontend directory:

```bash
npm test
```

Use `npm run test:watch` in a frontend directory for interactive local test development. Tests use synthetic users and database records; do not point test commands at a real MongoDB server.

## API

The backend mounts these route groups:

| Route prefix | Purpose |
| --- | --- |
| `/api/auth` | Registration, login, and password reset |
| `/api/admin` | User, subject, analytics, and report management |
| `/api/teacher` | Question, test, assignment, and submission management |
| `/api/student` | Test attempts, dashboards, submissions, and results |

Protected API operations require an authorized user role; frontend route protection is not the only access check.

### Teacher Results & Reports

The reporting endpoints are mounted under `/api/teacher/reports` and require a valid JWT for a user with the `teacher` role. Every report is scoped to tests whose `teacher` field matches the authenticated user; a teacher ID supplied by a client is not accepted as an ownership filter.

| Endpoint | Purpose |
| --- | --- |
| `GET /api/teacher/reports/overview` | Counts unique students and completed attempts; returns average score, pass rate, pass/fail distribution, per-test averages, highest/lowest tests, and recent submissions |
| `GET /api/teacher/reports/test-results` | Returns paginated completed attempts with optional test, student name/email search, pass/fail, date range, sort field, and sort order filters |
| `GET /api/teacher/reports/student-performance?studentId=<id>` | Returns a student's metrics, per-test summary, and paginated attempt history across only the authenticated teacher's tests |
| `GET /api/teacher/reports/submissions/:submissionId` | Returns one completed submission and snapshot-based question/answer details, only when its test belongs to the authenticated teacher |
| `GET /api/teacher/reports/export` | Streams CSV for the same supported result filters, without applying the on-screen page limit |

`test-results` and `student-performance` accept `page` (default `1`) and `limit` (default `25`, maximum `100`). Result filters are `testId`, `search` (student name or email), `status` (`all`, `pass`, or `fail`), `from`, `to`, `sortBy` (`submittedAt` or `score`), and `sortOrder` (`asc` or `desc`). CSV export honors the filters but intentionally exports all matching rows rather than only the current page.

Only completed submissions are included; in-progress attempts are excluded. Each submission is preserved as an attempt, including legitimate retakes. Attempt numbers are derived per student and test by submission timestamp, with submission `_id` as a stable tie-breaker. Average score is the mean percentage across scored completed attempts. Pass rate is passed scored attempts divided by all scored completed attempts; each attempt uses its saved total-mark and pass-percentage snapshot (falling back to the configured 50% pass threshold only when that snapshot omits it). A submission passes when its unrounded score percentage is greater than or equal to that threshold. Unique student counts use distinct student records, not attempt counts.

Historical question text, choices, correct answers, marks, and test scoring values come from the submission's saved snapshots rather than the current test or question configuration. A completed record without usable scoring snapshots remains visible as unscored; no scoring or manual-grading rules are added by reporting.

## Useful commands

Each frontend provides these scripts when run from its directory:

```bash
npm run dev
npm run build
npm run lint
```

Each frontend defines `npm test` where tests are present. The backend uses Node's test runner through `npm test`; start it with `node server.js`.
