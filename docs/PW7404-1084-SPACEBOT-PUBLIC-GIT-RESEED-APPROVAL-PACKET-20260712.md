# PW7404-1084 SPACEBOT Public Git Reseed Approval Packet

Date: 2026-07-12  
Status: explicit PAULIEWOOD approval required; no Git write performed  
Remote: `https://github.com/MONKEEJUMP/spacebot-space.git`

## Why Approval Is Required

Public `main` still tracks `.machine_keys.json` from initial commit `66167dd`, current `HEAD` is the stale May 17 commit `aa758aa`, and the working tree contains 407 dirty entries. The 18 values are permanently revoked and restore-denied, so this is not an active authentication emergency, but tip/history remain unsafe source truth and any ordinary commit from the current tree could mix live, candidate, historical, and private artifacts.

## Recommended Strategy: Clean Public Reseed

1. Create a root-only Git bundle and metadata receipt of the old repository for legal/history recovery; never publish the secret-bearing bundle.
2. Secret-scan every historical object and classify any finding before constructing replacement history.
3. Build a new clean repository from the verified 871-file `PW7404-1071` released-source baseline plus the reviewed `PW7404-1080` through `1084` security/control artifacts. Exclude TaskSpace candidate paths until their separate release gate passes.
4. Prove secret scan, manifest parity, strict TypeScript, static contracts, build, migration replay, and browser/API smoke from a fresh clone.
5. Pause branch protection only for the approved cutover, replace public `main` with the clean root commit, create an annotated production-baseline tag, restore protection, and enable GitHub secret scanning/push protection.
6. Invalidate old clones operationally: announce that every collaborator/server must archive or delete the old clone and re-clone. Production must not `git pull` from old history.
7. Verify the public default branch, tags, archives, releases, Actions artifacts, forks under our control, and GitHub search no longer expose the file. External clones may retain revoked values forever.

## Alternative: History-Preserving Rewrite

Use `git filter-repo --path .machine_keys.json --invert-paths`, secret-scan the rewritten graph, force-push every affected ref, and invalidate clones. This preserves more history but also preserves the May-to-July source-truth drift and requires a separate canonical release commit; it is therefore not recommended as the primary recovery path.

## Approval Choices

- `APPROVE PW7404-1084 CLEAN RESEED`: authorize the recommended clean replacement after fresh-clone proof and a final exact-ref/hash preview.
- `APPROVE PW7404-1084 FILTER REWRITE`: preserve history while removing the path, then add a separate canonical release commit.
- `HOLD PW7404-1084`: perform no Git mutation; public history remains stale but revoked credentials cannot authenticate.

Approval authorizes only the chosen reviewed sequence. It does not authorize broad reset of the 407-entry working tree, deletion of user work, an unreviewed force push, or inclusion of the undeployed TaskSpace candidate.
