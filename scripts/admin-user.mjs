import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";
import process from "node:process";
import postgres from "postgres";

const scrypt = promisify(scryptCallback);
const [usernameInput, ...nameParts] = process.argv.slice(2);
const username = usernameInput?.trim().toLowerCase();
const displayName = nameParts.join(" ").trim();
const password = process.env.TIPSY_ADMIN_PASSWORD;

if (!username || !/^[a-z0-9._-]{3,64}$/.test(username) || !displayName || !password || password.length < 12) {
  process.stderr.write("Usage: set TIPSY_ADMIN_PASSWORD to a password of at least 12 characters, then run: npm run admin:create -- <username> <display name>\n");
  process.exit(1);
}

const salt = randomBytes(16).toString("hex");
const derived = await scrypt(password, salt, 64);
const passwordHash = `scrypt$${salt}$${Buffer.from(derived).toString("hex")}`;
const databaseUrl = process.env.DATABASE_URL ?? "postgresql://tipsy:tipsy_local_password@localhost:5432/tipsy";
const sql = postgres(databaseUrl, { max: 1, onnotice: () => undefined });

await sql.begin(async (tx) => {
  const [user] = await tx`
    INSERT INTO users (username, display_name, role, status)
    VALUES (${username}, ${displayName}, 'ADMIN', 'ACTIVE')
    ON CONFLICT (username) DO UPDATE SET display_name = EXCLUDED.display_name, role = 'ADMIN', status = 'ACTIVE', updated_at = now()
    RETURNING id
  `;
  await tx`
    INSERT INTO admin_credentials (user_id, password_hash)
    VALUES (${user.id}, ${passwordHash})
    ON CONFLICT (user_id) DO UPDATE SET password_hash = EXCLUDED.password_hash, failed_attempts = 0, locked_until = NULL, password_changed_at = now(), updated_at = now()
  `;
  await tx`UPDATE admin_sessions SET revoked_at = now() WHERE user_id = ${user.id} AND revoked_at IS NULL`;
});

await sql.end();
process.stdout.write(`Admin account ready: ${username}\n`);
