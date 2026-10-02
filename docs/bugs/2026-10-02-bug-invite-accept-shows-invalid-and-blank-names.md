# Invite acceptance showed "Invitation invalid"; blank names; logged-out invite lost

## Symptom
- Invitee accepted an invitation (the sender got "accepted your invitation") but the
  invitee saw "Invitation invalid" / "Unauthorized".
- Notifications read " accepted your invitation…" with a "?" avatar; the project
  Add Member dropdown rendered blank rows.
- A logged-out visitor opening `/invite/<token>` was sent to `/login` and the token
  was forgotten.
- First-time users joined (email invite, invite link) without ever being asked a name.

## Where
- `app/(app)/invite/[token]/page.tsx`, `acceptInvite()` in `app/actions/workspace.ts`
- `app/post-auth/page.tsx`, `components/space/space-members-manager.tsx`

## Root cause
- The invite page never asked the server for the invite's state on load; every
  failure used the one title "Invitation invalid", and a missing session surfaced as
  the raw string "Unauthorized". An invite already accepted by the same user (refresh,
  reopened link, auto-activation at sign-in) was not recognised as success.
- Signup stores `user.name` as `""` (column is NOT NULL). `name ?? email` does not fall
  through on an empty string, so titles/dropdown rows were blank.
- Nothing checked for a name before `/post-auth` auto-accepted invites; the first
  check read the session, which Better Auth's cookie cache keeps stale for 60 s.
- The invite token was not stored anywhere across the login redirect.
