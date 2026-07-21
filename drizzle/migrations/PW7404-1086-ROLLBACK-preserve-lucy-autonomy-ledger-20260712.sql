-- Preservation-first rollback: resident actions and their authority receipts are
-- durable history. Disable the LUCY scheduler and application routes instead of
-- dropping this ledger or deleting resident-authored content.
DO $$
BEGIN
  RAISE EXCEPTION 'PW7404-1086 rollback refused: preserve lucy_autonomy_runs and canonical resident history';
END
$$;
