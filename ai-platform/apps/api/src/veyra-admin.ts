import { createDatabase } from "./database.js";
import { migrateVeyra } from "./veyra-data.js";
const id = process.argv[2];
if (!id || !/^[-a-f0-9]{36}$/.test(id))
  throw Error(
    "Usage: npm run veyra:admin -- <existing-user-uuid>. Run only from an authorized operator shell.",
  );
const db = await createDatabase(
  process.env.VEYRA_DATABASE_URL ?? process.env.DATABASE_URL,
  process.env.VEYRA_DATA_DIR ?? "./.veyra-data",
);
try {
  await migrateVeyra(db);
  const result = await db.query(
    "UPDATE vy_users SET role='admin' WHERE id=$1 RETURNING id",
    [id],
  );
  if (!result.rows.length) throw Error("Existing Veyra user not found.");
  await db.query(
    "INSERT INTO vy_audit(actor_id,action,target_id) VALUES (NULL,'operator.admin-grant',$1)",
    [id],
  );
  console.log(
    "Administrator role assigned to the specified Veyra account. Age verification is still required.",
  );
} finally {
  await db.close();
}
