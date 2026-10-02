# Solution: invite acceptance, blank names, logged-out invite

## Changes
- `getInviteState(token)` (read-only) + typed error codes (`auth_required`, `invalid`,
  `expired`, `used`, `wrong_user`, `rate_limited`) in `app/actions/workspace.ts`. The
  invite page resolves state on load, redirects to the workspace when the current user
  already accepted, and shows a distinct title per error. Authorization is unchanged.
- Name fallbacks use `name?.trim() || email` (notification titles, project member list).
- New `/complete-profile` page (reuses `saveUserName`, `user.name`). Gate runs in
  `/post-auth`, `/join/[token]` and the `/invite/[token]` layout, reading the name from
  the DB (`userHasDisplayName`) rather than the cached session.
- Logged-out `/invite/<token>`: the layout sends the visitor to `/api/invite/<token>`,
  which stores the token in an httpOnly, `sameSite=lax` cookie and goes to `/login`.
  `/post-auth` (after the name step) redirects via `/api/invite/consume` back to
  `/invite/<token>`. Only a bare `[A-Za-z0-9_-]{1,128}` token is stored; the path is
  always rebuilt, so there is no open redirect.
- Invite-link joins (`joinViaLink`) now notify workspace owners/admins.

## Why it works
Acceptance is idempotent per user, the name is verified from the source of truth, and
the token survives login without being consumed before authentication and name setup.
No schema change / no migration.
