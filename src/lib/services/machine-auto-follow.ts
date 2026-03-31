import { db } from '@/db';
import { machineFollows } from '@/db/machine-social';
import { agents } from '@/db';
import { sql } from 'drizzle-orm';

// ============================================================
// AUTO-FOLLOW UTILITY
// Creates mutual follows among all 18 Super Machines
// Idempotent: safe to run multiple times
// ============================================================

interface AutoFollowResult {
  followsCreated: number;
  machinesProcessed: number;
}

export async function setupMutualFollows(): Promise<AutoFollowResult> {
  // 0. Ensure all Super Machines have entries in the agents table.
  //    machine_follows has FK to agents.id, so machines MUST exist in agents.
  //    This INSERT...SELECT creates agent entries for any super_machine in
  //    bot_configs that doesn't already have one. Uses bot_configs.id as the
  //    agent id for consistency.
  await db.execute(sql`
    INSERT INTO agents (id, name, api_key, api_key_hash)
    SELECT bc.id, bc.bot_name, 'mk-' || bc.id::text, 'mkhash-' || bc.id::text
    FROM bot_configs bc
    WHERE bc.bot_type = 'super_machine'
      AND NOT EXISTS (SELECT 1 FROM agents a WHERE a.name = bc.bot_name)
    ON CONFLICT (name) DO NOTHING
  `);

  // 1. Get all 18 Super Machines (agents that match super_machine bot_configs)
  const machineList = await db
    .select({ id: agents.id, name: agents.name })
    .from(agents)
    .where(
      sql`${agents.name} IN (SELECT bot_name FROM bot_configs WHERE bot_type = 'super_machine')`
    );

  console.log(`[AUTO-FOLLOW] Found ${machineList.length} machines for auto-follow setup`);

  if (machineList.length === 0) {
    return { followsCreated: 0, machinesProcessed: 0 };
  }

  // 2. Generate all pairs (A follows B, B follows A for every pair)
  const pairs: Array<{ followerId: string; followedId: string }> = [];
  for (const a of machineList) {
    for (const b of machineList) {
      if (a.id !== b.id) {
        pairs.push({ followerId: a.id, followedId: b.id });
      }
    }
  }
  console.log(`[AUTO-FOLLOW] Generated ${pairs.length} follow pairs`);

  // 3. Batch insert in chunks of 50 with ON CONFLICT DO NOTHING
  let totalInserted = 0;
  for (let i = 0; i < pairs.length; i += 50) {
    const chunk = pairs.slice(i, i + 50);
    const inserted = await db
      .insert(machineFollows)
      .values(chunk)
      .onConflictDoNothing()
      .returning({ id: machineFollows.id });
    totalInserted += inserted.length;
  }

  const skipped = pairs.length - totalInserted;
  console.log(
    `[AUTO-FOLLOW] Inserted ${totalInserted} new follows (${skipped} already existed)`
  );

  // 4. Update counts for all machines using subqueries for accuracy
  for (const machine of machineList) {
    await db.execute(sql`
      UPDATE bot_configs
      SET
        following_count = (SELECT COUNT(*) FROM machine_follows WHERE follower_id = ${machine.id}),
        follower_count = (SELECT COUNT(*) FROM machine_follows WHERE followed_id = ${machine.id})
      WHERE bot_name = ${machine.name}
    `);
  }
  console.log(`[AUTO-FOLLOW] Updated counts for ${machineList.length} machines`);

  return {
    followsCreated: totalInserted,
    machinesProcessed: machineList.length,
  };
}
