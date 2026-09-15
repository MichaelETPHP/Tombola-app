# YeneEta environments and Git workflow

YeneEta uses two long-lived branches:

| Branch | Purpose | Deployment target |
| --- | --- | --- |
| `dev` | Integration and testing | Development environment |
| `production` | Reviewed, releasable code | Production environment |

## Normal change flow

1. Update local `dev`: `git switch dev` then `git pull --ff-only`.
2. Create a short-lived branch: `git switch -c feature/short-description`.
3. Make and test the change, then push the feature branch.
4. Open a pull request into `dev` and wait for the quality checks to pass.
5. Test the merged `dev` deployment.
6. Open a pull request from `dev` into `production`.
7. Merge only after approval and passing checks. Deploy `production`.
8. Tag a confirmed release, for example `v1.1.0`.

Do not commit directly to `production`. Avoid merging `production` back into
`dev` as a routine step; every production change should already have passed
through `dev`. For an urgent production fix, branch from `production`, merge
the fix into `production`, and then merge the same fix into `dev`.

## Environment configuration

The two deployments may use the same database, API URL, and Telegram bot while
the project is being established. Store their values separately in each
deployment's secret/environment settings even when the values are identical.
This makes it possible to separate them later without changing source code.

For local development, copy the tracked templates and fill in private values:

```powershell
Copy-Item .env.example .env
Copy-Item api/.env.example api/.env
Copy-Item admin-app/.env.example admin-app/.env
Copy-Item mobile-app/.env.example mobile-app/.env
```

Set `NODE_ENV=development` for the development deployment and
`NODE_ENV=production` for production. Never commit `.env`, credentials,
database passwords, JWT secrets, payment keys, or Telegram bot tokens.

Because both environments currently share one database and Telegram bot:

- database migrations applied from `dev` immediately affect production data;
- both API deployments must not register competing Telegram webhooks;
- test actions can create or modify live records;
- destructive seed/reset commands must never be run against the shared database.

Use one active Telegram webhook URL at a time. Before testing webhook behavior
on `dev`, manually point the bot webhook to the development API; restore it to
the production API after testing.

## Repository settings on GitHub

After the branches are pushed, set `production` as the default branch and add
branch protection rules for both long-lived branches.

For `production`, require:

- pull requests before merging;
- at least one approval;
- the `Quality / validate` status check;
- resolved conversations;
- deletion of source branches after merge;
- blocked force pushes and deletions.

For `dev`, require pull requests and the `Quality / validate` status check.
Allow squash merging so each feature produces one clear commit.
