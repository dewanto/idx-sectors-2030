<dyad-security-finding title="Information leakage in admin migration error messages" level="medium">
**What**: The admin migration route (`/api/admin/migrate`) returns detailed error messages to the client when an exception occurs during migration. These messages may contain sensitive information such as database connection details or internal system errors.

**Risk**: An attacker who obtains the migration token (e.g., through leakage or guessing) could trigger errors to leak internal information, potentially aiding further attacks. For example, database connection errors might reveal parts of the DATABASE_URL or connection credentials.

**Potential Solutions**:
1. Return generic error messages in production (e.g., "Migration failed") while logging detailed errors server-side.
2. Ensure the migration token is strong and stored securely (e.g., as a secret in the deployment environment).
3. Remove the migration route entirely after the migration is complete, as instructed in the route's documentation.

**Relevant Files**: `src/app/api/admin/migrate/route.ts`
</dyad-security-finding>