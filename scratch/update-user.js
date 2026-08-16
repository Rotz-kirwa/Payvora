import postgres from "postgres";
import bcrypt from "bcryptjs";

const dbUrl = process.env.DATABASE_URL || "postgresql://payvora_db_user:lYAJv1Gv6ri0KeY1iJBBH8wKr3Zj8gHZ@dpg-da0bmttbedkc73adhql0-a.ohio-postgres.render.com/payvora_db?sslmode=require";
const sql = postgres(dbUrl);

async function run() {
  const targetEmail = "eliudkirwa451@gmail.com";
  const rawPassword = "Rotz1362$";

  console.log(`Hashing password for ${targetEmail}...`);
  const passwordHash = await bcrypt.hash(rawPassword, 10);

  // Check existing users
  const existingUsers = await sql`SELECT id, email, role FROM users;`;
  console.log("Current users in database:", existingUsers);

  // Upsert user
  await sql`
    INSERT INTO users (email, password_hash, role)
    VALUES (${targetEmail}, ${passwordHash}, 'admin')
    ON CONFLICT (email) 
    DO UPDATE SET 
      password_hash = EXCLUDED.password_hash,
      role = 'admin';
  `;

  console.log(`Successfully updated/inserted user ${targetEmail} with password ${rawPassword}!`);

  const updatedUsers = await sql`SELECT id, email, role, created_at FROM users;`;
  console.log("Updated users list:", updatedUsers);

  await sql.end();
}

run().catch(console.error);
