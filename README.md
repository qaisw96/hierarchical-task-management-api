# Hierarchical Task Management API

A backend for managing work across a hierarchy of **Organization → Departments → Projects → Tasks**, with role-based access control and batched notifications.

Built with Node.js, Express, TypeScript and PostgreSQL.

## What it does

- Models the full hierarchy and enforces **role-based permissions** on every endpoint.
- Authenticates with **JWT**.
- Ships a **seeder** that can generate up to ~1M tasks, with a `SEED_SCALE` flag to scale down for local testing.
- **Batches notifications**: instead of one message per task update, it groups them per project (e.g. `"5 tasks updated in Project X"`).

## Roles

| Role | Access |
|------|--------|
| **Admin** | Full access to everything (create/read/update/delete). |
| **Manager** | View/edit their own department and all its projects and tasks. |
| **Employee** | View/edit only the tasks explicitly assigned to them. |

Access is enforced in the SQL query itself (the role's scope is composed into the `WHERE` clause), not filtered in memory — so it stays fast even with a million tasks.

## Requirements

- Node.js 20+
- PostgreSQL 14+

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Create the database
createdb taskdb

# 3. Configure environment
cp .env.example .env
# then edit .env and set DATABASE_URL + JWT_SECRET (see below)

# 4. Create the tables
npm run migrate

# 5. Generate sample data (small scale for local use)
SEED_SCALE=0.05 npm run seed

# 6. Run the server
npm run dev
```

The API is now on `http://localhost:3000`. Check it's up:

```bash
curl http://localhost:3000/health
# {"status":"ok"}
```

### Environment variables

```
DATABASE_URL=postgresql://user:pass@localhost:5432/taskdb
JWT_SECRET=change-me
JWT_EXPIRES_IN=1h
PORT=3000
SEED_SCALE=0.1
NOTIFICATION_WINDOW_MS=60000
```

`.env` is gitignored; `.env.example` is committed as a template.

## Sample users

All three are created by the seeder. Password for all: **`Password123!`**

| Role | Email | Notes |
|------|-------|-------|
| Admin | `admin@example.com` | Full access |
| Manager | `manager@example.com` | Manages Department 1 |
| Employee | `employee@example.com` | Has tasks assigned in Department 1 |

## Using the API

Log in to get a token, then send it as a `Bearer` header on every other request.

```bash
# Log in
curl -s -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"manager@example.com","password":"Password123!"}'
# { "token": "eyJhbGciOi..." }

# Use the token
TOKEN="paste-token-here"
curl -s http://localhost:3000/tasks -H "Authorization: Bearer $TOKEN"
```

### Endpoints

| Method | Path | Who can call it | Description |
|--------|------|-----------------|-------------|
| POST | `/auth/login` | public | Log in, returns a JWT |
| GET | `/health` | public | Liveness check |
| GET | `/organizations` | admin | List the organization |
| PATCH | `/organizations/:id` | admin | Rename the organization |
| GET | `/departments` | admin, manager | List departments in scope |
| POST | `/departments` | admin | Create a department |
| PATCH | `/departments/:id` | admin, manager | Rename a department |
| DELETE | `/departments/:id` | admin | Delete a department (cascades) |
| GET | `/projects` | admin, manager | List projects in scope |
| POST | `/projects` | admin | Create a project |
| PATCH | `/projects/:id` | admin, manager | Rename a project |
| DELETE | `/projects/:id` | admin | Delete a project (cascades) |
| GET | `/tasks` | all | List tasks in scope (paginated, filterable) |
| GET | `/tasks/:id` | all | Get one task |
| POST | `/tasks` | admin, manager | Create a task |
| PATCH | `/tasks/:id` | all | Update a task (triggers a notification) |
| DELETE | `/tasks/:id` | admin | Delete a task |
| GET | `/notifications` | all | List your notifications |

Notes:
- **Scope** is applied on top of the role check. A manager listing `/tasks` sees only their department's tasks; an employee sees only tasks assigned to them.
- Asking for a resource outside your scope returns **404** (not 403) so we don't reveal that it exists.
- Trying an action your role can't perform returns **403**.

### Pagination

List endpoints accept `?page=` and `?limit=` (default `limit=50`, max `200`):

```json
{
  "data": [ ... ],
  "pagination": { "page": 1, "limit": 50, "total": 102659, "totalEstimated": true, "totalPages": 2054 }
}
```

`/tasks` also supports `?projectId=` and `?status=` (`todo` | `in_progress` | `done`).

`totalEstimated` is `true` when the count is an estimate — for an unfiltered admin listing over ~1M rows we use PostgreSQL's row estimate instead of a slow exact `COUNT(*)`.

### Example requests

```bash
# Create a task (admin or manager)
curl -s -X POST http://localhost:3000/tasks \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"projectId": 1, "title": "Write the report", "assigneeId": 5}'

# Update a task (this is what triggers a notification)
curl -s -X PATCH http://localhost:3000/tasks/1 \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"status": "done"}'
```

## Notification batching

Sending one notification per task update is noisy. Instead, updates are grouped per project.

How it works:

1. When a task is updated (`PATCH /tasks/:id`), the request just records a small "update event" and returns immediately — no waiting.
2. A flush job runs on an interval (`NOTIFICATION_WINDOW_MS`, default 60s). It collects the pending events, groups them by project, and writes one notification per recipient into the `notifications` table.
3. Recipients are the admins plus the manager of that project's department.

You can also run the flush manually instead of waiting for the timer:

```bash
npm run flush:notifications
```

### Example output

After updating 5 tasks in one project and flushing:

```
[notifications] flush — 1 group(s), 2 notification(s)
  -> user 1: "5 task(s) updated in Project 1-1"
  -> user 2: "5 task(s) updated in Project 1-1"
```

And the rows stored in the `notifications` table:

| user_id | project_id | message | task_count |
|---------|-----------|---------|-----------|
| 1 (admin) | 1 | 5 task(s) updated in Project 1-1 | 5 |
| 2 (manager) | 1 | 5 task(s) updated in Project 1-1 | 5 |

## Seeder

The seeder generates realistic data: one organization, ~100 departments, 50–80 projects each, and 100–200 tasks per project (roughly 1M tasks at full scale). Tasks are assigned to employees within their department, with about 20% left unassigned.

`SEED_SCALE` scales the number of departments (and therefore the total size) so you can pick a dataset that fits your machine:

```bash
SEED_SCALE=0.01 npm run seed   # ~1 department,  ~10k tasks  (fast)
SEED_SCALE=0.1  npm run seed   # ~10 departments, ~100k tasks
SEED_SCALE=1    npm run seed   # ~100 departments, ~1M tasks  (full scale)
```

The seed is deterministic (same data every run) and idempotent (it clears existing data first). Full scale loads via PostgreSQL `COPY`, so ~1M tasks seed in well under a minute.

## Database schema

Seven tables, defined in [`src/db/schema.sql`](src/db/schema.sql):

- `organizations` → `departments` → `projects` → `tasks` (the hierarchy, linked by foreign keys with `ON DELETE CASCADE`)
- `users` — email, bcrypt password hash, role, and department (for managers)
- `task_update_events` — the staging table for pending notifications
- `notifications` — the batched notifications

Every foreign key used for filtering is indexed. The most important one is `idx_tasks_assignee`, which keeps an employee's task lookup fast at a million rows.

## Scripts

| Command | What it does |
|---------|-------------|
| `npm run dev` | Run the server with live reload |
| `npm run migrate` | Create the database tables |
| `npm run seed` | Generate sample data (honors `SEED_SCALE`) |
| `npm run flush:notifications` | Flush pending notifications now |
| `npm test` | Run the integration test suite |
| `npm run typecheck` | Type-check without emitting |
| `npm run build` / `npm start` | Compile to `dist/` and run |

## Tests

A small integration suite (Vitest + Supertest) covers the role-based access rules — the heart of the system. Each test logs in as a role and checks the access matrix: who can see and edit which tasks, and who correctly gets `401` / `403` / `404`.

```bash
npm test
```

## Design decisions

A few things the task left open, and how I resolved them:

- **404 for out-of-scope resources**, not 403 — returning 403 would confirm a resource exists to someone who shouldn't see it.
- **No public registration.** Roles are privileged — an open signup could self-assign admin — so users are provisioned by the seeder instead of a signup flow. The brief doesn't require creating users through the API; an admin-only user-management endpoint is noted as a next step.
- **Task assignees must be employees**, validated on create.
- **Write access to structural entities (org/department/project) is admin-only**; managers edit within their department; employees only touch their assigned tasks.
- **`SEED_SCALE` scales departments** (keeping projects/tasks per parent in their real ranges), which keeps every department realistically sized even at small scale.

## Possible next steps

Things I'd add with more time, in rough priority order:

- More test coverage (the current suite focuses on the permission rules).
- A dedicated queue/worker (e.g. BullMQ or RabbitMQ) for notifications instead of an in-process timer.
- Admin user-management endpoints and a `GET /me` profile route.