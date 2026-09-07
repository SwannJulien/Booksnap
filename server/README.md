# booksnap-backend

## First administrator account

Creating an account requires being an administrator, so a fresh installation has no way
in: there is nobody to create the first account. Emailed invitations and Microsoft SSO
both come later. The backend therefore creates one administrator at startup, from
environment variables.

### Procedure

1. Fill in, in **`server/.env`**:

   ```
   BOOKSNAP_BOOTSTRAP_ADMIN_EMAIL=firstname.lastname@school.example
   BOOKSNAP_BOOTSTRAP_ADMIN_PASSWORD=<at least 12 characters>
   BOOKSNAP_BOOTSTRAP_ADMIN_FIRST_NAME=Firstname
   BOOKSNAP_BOOTSTRAP_ADMIN_LAST_NAME=Lastname
   ```

   The two names are optional; the email and the password are not.

   **There are two `.env` files, and only one of them is read here.** `spring-dotenv`
   loads the `.env` in the process working directory, which for the IDE run configuration
   is `server/`. The `.env` at the repository root belongs to `docker compose`, which
   substitutes it into `docker-compose.yml`. The two are otherwise identical apart from
   `DB_HOST` (`localhost` for the IDE, `db` for compose). Put the bootstrap password in
   `server/.env` and leave the root copy empty, so the same secret is not sitting in two
   files. Both are covered by `.gitignore` — worth re-checking before typing a password
   into either.

2. Start the backend from the IDE. The log carries one of:

   ```
   Admin bootstrap: admin account <email> created
   Admin bootstrap: existing account <email> promoted from user to admin
   ```

   followed by a reminder to change the password. The password itself is never logged.

3. Sign in with that email and password.

4. **Change the password from the account page** (*My account* → *Change password*, or
   `POST /api/v1/auth/password`), then **empty the four variables** and restart. Until you
   do, the password is sitting in a file on disk — and is known to whoever set it up.

   Changing it there also signs the account out of every other browser it was open in,
   which is the point: the bootstrap password was never meant to be a personal one.

### What it will and will not do

- It runs **only while no account holds the `admin` role**. As soon as one does — active
  or not — it does nothing, whatever the variables still say. This is what stops a
  restart from resetting the administrator's password back to the one in `.env`.
- If the email already belongs to an account, that account is **promoted**, never
  duplicated. It keeps its name, its history and its loans. If it was deactivated, it is
  reactivated, because a disabled admin cannot sign in.
- If that account **already has a password**, the password is left alone and only the
  role changes. Sign in with the existing one.
- Names are only used when creating a new account; promoting one never overwrites the
  name already on file.

### When it refuses

- **Password under 12 characters** (an unset password included, when the email is set):
  startup **fails** with an explicit message. An administrator with a guessable password
  on an application reachable from the school is worse than an application that will not
  start.
- **Nothing configured and no administrator in the database**: startup succeeds and logs
  a warning. Nobody can administer the application until the variables are filled in.

This is not `seed.sql`. Development fixtures are loaded separately with
`scripts/load-dev-fixtures.sh`; this bootstrap is meant to run in production, against a
database holding real people.

## Emergency switch: `SECURITY_LOCKDOWN_ENABLED`

Since US-009 every endpoint requires a session and the right role, the permission matrix
living in one block in `SecurityConfig`. Setting `SECURITY_LOCKDOWN_ENABLED=false` throws
that matrix away and makes the whole API public again — the user directory included — and
logs a warning saying so at every startup.

It exists for one situation: a release that locks the school out of its own library, where
the alternative is rolling back everything. It is a way to keep the library open for an
afternoon, not a setting; put it back to `true` the same day. The default is `true` and
`application.properties` must stay that way — the switch is driven from the environment or
not at all.

If it is ever needed, the reason is worth writing down: the failures it covers (no sign-in
screen deployed alongside the API, an administrator account nobody can use) are all
preventable, and the switch existing should not be what makes them cheap.
