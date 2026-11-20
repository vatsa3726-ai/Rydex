import { z } from "zod";
import { createDatabase } from "./database.js";
import { migrateAccountSecurity } from "./account-data.js";
const [action, id, choice, days, reason] = process.argv.slice(2);
if (!process.env.DATABASE_URL && !process.env.SOULNEST_DATA_DIR)
  throw Error(
    "Set DATABASE_URL or an absolute SOULNEST_DATA_DIR for the intended database.",
  );
const db = await createDatabase();
try {
  await migrateAccountSecurity(db);
  if (action === "grant") {
    z.string().uuid().parse(id);
    const plan = z.enum(["free", "premium"]).parse(choice),
      duration = z.coerce.number().int().min(1).max(365).parse(days),
      note = z.string().min(5).max(200).parse(reason);
    await db.transaction(async (tx) => {
      const result = await tx.query(
        "UPDATE sn_subscriptions SET plan=$1,status=$2,active_until=$3,grant_reason=$4 WHERE user_id=$5 RETURNING user_id",
        [
          plan,
          plan === "premium" ? "manual" : "inactive",
          plan === "premium"
            ? new Date(Date.now() + duration * 86400000)
            : null,
          note,
          id,
        ],
      );
      if (!result.rows.length) throw Error("SoulNest account not found.");
      await tx.query(
        "INSERT INTO sn_operator_audit(action,target_id,reason) VALUES ($1,$2,$3)",
        ["entitlement." + plan, id, note],
      );
    });
    console.log("Evaluation access updated. No payment has been collected.");
  } else if (action === "reports") {
    console.log(
      JSON.stringify(
        (
          await db.query(
            "SELECT id,category,details,excerpt,status,created_at FROM sn_reports WHERE status='open' ORDER BY created_at LIMIT 100",
          )
        ).rows,
        null,
        2,
      ),
    );
  } else if (action === "resolve") {
    z.string().uuid().parse(id);
    const status = z.enum(["resolved", "dismissed"]).parse(choice),
      note = z.string().min(5).max(500).parse(days);
    await db.transaction(async (tx) => {
      const result = await tx.query(
        "UPDATE sn_reports SET status=$1,resolution=$2 WHERE id=$3 RETURNING id",
        [status, note, id],
      );
      if (!result.rows.length) throw Error("Report not found.");
      await tx.query(
        "INSERT INTO sn_operator_audit(action,target_id,reason) VALUES ($1,$2,$3)",
        ["report." + status, id, note],
      );
    });
    console.log("Report review recorded.");
  } else
    throw Error(
      'Usage: soulnest:operator grant USER_UUID free|premium DAYS "REASON" | reports | resolve REPORT_UUID resolved|dismissed "RESOLUTION". Authorized operators only.',
    );
} finally {
  await db.close();
}
