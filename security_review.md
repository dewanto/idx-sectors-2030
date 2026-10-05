# Security Review Summary

## Findings

<dyad-security-finding title="Information leakage in admin migration error messages" level="medium">
**What**: The admin migration route (`/api/admin/migrate`) returns detailed error messages to the client when an exception occurs during migration. These messages may contain sensitive information such as database connection details or internal system errors.

**Risk**: An attacker who obtains the migration token (e.g., through leakage or guessing) could trigger errors to leak internal information, potentially aiding further attacks. For example, database connection errors might reveal parts of the DATABASE_URL or connection credentials.

**Potential Solutions**:
1. Return generic error messages in production (e.g., "Migration failed") while logging detailed errors server-side.
2. Ensure the migration token is strong and stored securely (e.g., as a secret in the deployment environment).
3. Remove the migration route entirely after the migration is complete, as instructed in the route's documentation.

**Relevant Files**: `src/app/api/admin/migrate/route.ts`
</dyad-security-finding>

## Additional Notes

- No client-side exposed secrets were found. The `SECTORS_API_KEY` is used only in server-side scripts (`src/lib/sectors.ts` and related sync/smoke scripts) and is not imported by any client-side code.
- The `DATABASE_URL` and related database connection strings are used only on the server.
- The app does not implement authentication, as all data is intended to be public.
- Row Level Security (RLS) is enabled on tables via the migration script, but no specific policies are created. If connected to Supabase, the app should use the `service_role` connection string to bypass RLS, or appropriate policies should be added for the role in use.
- No SQL injection, XSS, or IDOR vulnerabilities were identified in the inspected API routes.

## Recommendations

1. **Remove the admin migration route** after the migration is complete, as noted in the route's documentation.
2. **Use a strong, randomly generated migration token** and store it securely (e.g., as a secret in your deployment platform).
3. **Consider adding generic error handling** in the migration route to avoid leaking internal details in error responses.
4. **Verify the database connection role** used in production: if using Supabase, ensure the `DATABASE_URL` uses the `service_role` (which bypasses RLS) or add appropriate RLS policies for the role in use.

</dyad-security-finding>