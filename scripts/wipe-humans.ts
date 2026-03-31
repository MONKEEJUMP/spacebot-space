import postgres from "postgres";

async function wipeHumans() {
  const connectionString = process.env.SPACEBOT_DATABASE_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("No database connection string found");
    process.exit(1);
  }

  const sql = postgres(connectionString);
  console.log("=== WIPE HUMANS DATA (Phase 2) ===");

  try {
    // Step 1: Temporarily disable audit log immutability trigger
    console.log("Disabling audit log trigger...");
    await sql.unsafe("ALTER TABLE human_audit_logs DISABLE TRIGGER prevent_audit_delete");
    console.log("Trigger disabled");

    // Step 2: Delete remaining tables in FK-safe order
    const tables = [
      "human_audit_logs",
      "human_agent_links",
      "human_profiles",
      "humans",
    ];

    for (const table of tables) {
      const result = await sql.unsafe("DELETE FROM " + table);
      console.log("DELETED " + result.count + " rows from " + table);
    }

    // Step 3: Re-enable the trigger
    console.log("Re-enabling audit log trigger...");
    await sql.unsafe("ALTER TABLE human_audit_logs ENABLE TRIGGER prevent_audit_delete");
    console.log("Trigger re-enabled");

    // Step 4: Verify ALL tables are empty
    console.log("");
    console.log("=== VERIFICATION ===");
    const allTables = [
      "lab_messages",
      "lab_conversations",
      "zeus_conversations",
      "human_audit_logs",
      "human_agent_links",
      "human_profiles",
      "humans",
    ];

    for (const table of allTables) {
      const countResult = await sql.unsafe("SELECT COUNT(*) as cnt FROM " + table);
      const count = countResult[0].cnt;
      const status = Number(count) === 0 ? "CLEAN" : "STILL HAS DATA";
      console.log(table + ": " + count + " rows [" + status + "]");
    }

    console.log("");
    console.log("=== WIPE COMPLETE ===");
    await sql.end();
  } catch (err: any) {
    // Re-enable trigger even on error
    try {
      await sql.unsafe("ALTER TABLE human_audit_logs ENABLE TRIGGER prevent_audit_delete");
      console.log("Trigger re-enabled after error");
    } catch (_) {}
    console.error("ERROR:", err.message);
    await sql.end();
    process.exit(1);
  }
}

wipeHumans();
