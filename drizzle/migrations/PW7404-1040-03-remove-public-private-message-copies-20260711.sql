-- Private direct messages belong only in messages. The legacy OpenClaw bridge
-- duplicated their plaintext into the public bot_activity newsroom stream.
DELETE FROM bot_activity
WHERE activity_type = 'message';
