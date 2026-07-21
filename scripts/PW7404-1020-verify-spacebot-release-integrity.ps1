param(
    [switch]$SkipGitDiffCheck
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $repoRoot
$failures = [Collections.Generic.List[string]]::new()
$checks = 0

$rules = @(
    @{
        Path = 'src/lib/security/api-keys.ts'
        Required = @('getApiKeyLookupValue', 'return sha256Hash(apiKey);', 'getClaimCodeLookupValue', 'verifyClaimCode', 'crypto.randomInt')
        Forbidden = @('Math.random()')
    },
    @{
        Path = 'src/lib/auth.ts'
        Required = @('authenticateAgentCredential', 'principal?.agent ?? null')
        Forbidden = @('eq(agents.apiKey, apiKey)')
    },
    @{
        Path = 'src/lib/machine-auth.ts'
        Required = @('authenticateAgentCredential', 'principal.agent.id', 'principal.agent.name')
        Forbidden = @('startsWith("sb_")', 'eq(agents.apiKey, machineKey)')
    },
    @{
        Path = 'src/lib/security/agent-credential-input.ts'
        Required = @('BOTSPACE_KEY_PATTERN', 'MACHINE_KEY_PATTERN', 'status: "conflict"', 'x-api-key', 'x-machine-key')
    },
    @{
        Path = 'src/lib/security/agent-credential-auth.ts'
        Required = @('getApiKeyLookupValue', 'verifyApiKey', 'input.family === "botspace"', 'credentialFamily: input.family', 'db.query.agentCredentials.findFirst', 'credential.verifierHash', 'machine:sha256_lookup', 'isNull(agentCredentials.revokedAt)')
        Forbidden = @('eq(agentCredentials.lookupHash, input.credential)')
    },
    @{
        Path = 'src/app/api/v1/agents/register/route.ts'
        Required = @('lockAgentResidentIdentity', 'ensureAgentResidentProjection', 'db.transaction', 'Primary credential dual-write failed', 'credentialFamily: "botspace"', 'verifierKind: "bcrypt"')
    },
    @{
        Path = 'src/db/schema.ts'
        Required = @('agent_credentials_lookup_unique_idx', 'agent_credentials_family_verifier_check', 'credential_family', 'verifier_kind', 'credentials: many(agentCredentials)', 'export const agentCredentialsRelations', 'export const agentIdentityAliases', 'agent_identity_aliases_canonical_idx')
    },
    @{
        Path = 'drizzle/migrations/PW7404-1025-01-prepare-agent-credentials-20260710.sql'
        Required = @('BEGIN;', 'COMMIT;', 'CREATE TABLE IF NOT EXISTS agent_credentials', 'agent_credentials_family_verifier_check', 'CREATE TABLE IF NOT EXISTS agent_identity_aliases', 'INSERT INTO agent_credentials', 'pw7404_sync_agent_primary_credential_trigger', 'current_setting(''pw7404.identity_merge'', true) = ''on''', 'pw7404_guard_resident_normalized_name_trigger', 'Resident-linked agents cannot be renamed independently', 'label = ''rotated-primary''', 'credential catalog or constraint validation failed', 'same-connection database identity guard failed')
    },
    @{
        Path = 'drizzle/migrations/PW7404-1025-02-merge-founding-agent-identities-20260710.sql'
        Required = @('BEGIN;', 'COMMIT;', 'Expected exactly 18 guarded founding-agent merge pairs', 'credential_family = ''machine''', 'UPDATE agent_credentials AS credential SET agent_id = map.canonical_id', 'Existing identity alias conflicts with the guarded merge map', 'INSERT INTO agent_identity_aliases', 'DELETE FROM agents AS duplicate', 'agents_name_casefold_unique_idx', 'bot_configs_name_casefold_unique_idx')
    },
    @{
        Path = 'scripts/PW7404-1025-apply-one-agent-identity.mjs'
        Required = @('--phase=prepare', '--phase=merge', 'MERGE_DRY_RUN', 'PW7404_DRY_RUN=1', 'merge dry-run rollback receipt failed', 'SPACEBOT_APPLY_ONE_AGENT_IDENTITY', 'SPACEBOT_CREATE_PREMERGE_BACKUP', 'SPACEBOT_FULL_WRITE_MAINTENANCE', '--schema=public', '--single-transaction', '--exit-on-error', '--use-list', 'hashNormalizedCommandOutput', 'capturePublicDataHashes', 'octet_length', 'COLLATE "C"', 'THEN ''N''', 'SET client_encoding=''UTF8''', 'Restore-test managed function seeding failed', 'DEFAULT ACL public', 'restoreListSha256', 'flag: "wx"', 'backup or permissions failed', 'Public rollback has cross-schema dependent objects', 'Public rollback requires explicit publication membership preservation', 'Initial restore data or schema fingerprint does not match source', 'Rollback data or schema fingerprint does not match source', 'rollbackTest: "passed"', 'const databaseUrl =', 'pw7404.expected_server_address')
    },
    @{
        Path = 'scripts/PW7404-1025-verify-canonical-agent-identity.mjs'
        Required = @('PW7404-1025 canonical agent identity: PASS', 'foreignKeyMoves', 'DELETE FROM agents AS duplicate')
    },
    @{
        Path = 'src/lib/security/rate-limiter.ts'
        Required = @('extractAgentCredentialInput', 'agent:${getApiKeyLookupValue(input.credential)}')
        Forbidden = @('if (machineKey) return machineKey;')
    },
    @{
        Path = 'src/lib/security/cors.ts'
        Required = @('''X-API-Key''', '''X-Machine-Key''')
    },
    @{
        Path = 'scripts/PW7404-1024-verify-agent-identity-contract.mjs'
        Required = @('PW7404-1024 agent identity contract: PASS', 'status: "conflict"', 'authenticateAgentCredential')
    },
    @{
        Path = 'src/app/api/v1/agents/register/route.ts'
        Required = @('getApiKeyLookupValue', 'apiKey: apiKeyLookup', 'getClaimCodeLookupValue', 'claimCodeExpiresAt', 'https://spacebot.space')
    },
    @{
        Path = 'src/lib/security/claiming-human.ts'
        Required = @('resolveHumanIdentity', 'ensureVerifiedClerkHuman', 'address.id === user.primaryEmailAddressId', 'primaryAddress.verification?.status !== "verified"', 'authType: "clerk"')
        Forbidden = @('verifyHumanRequest')
    },
    @{
        Path = 'src/app/api/webhooks/clerk/route.ts'
        Required = @('getVerifiedPrimaryEmail', 'ensureVerifiedClerkHuman', 'primary.verification?.status !== ''verified''', 'clerkId: null', 'deleted.spacebot.invalid', 'isPublic: false')
        Forbidden = @('email_addresses?.[0]', 'isEmailVerified: true')
    },
    @{
        Path = 'src/app/api/v1/humans/claim/route.ts'
        Required = @('resolveClaimingHuman', 'eq(agents.isClaimed, false)', 'claimCodeExpiresAt: null', 'expectedAction: "claim-agent"', 'lockAgentResidentIdentity', 'ResidentProjectionConflictError', 'assertAgentResidentProjection')
    },
    @{
        Path = 'drizzle/migrations/PW7404-1021-01-reconcile-test-claim-orphan-20260710.sql'
        Required = @('9be568b0-42a9-4a85-97f1-11515615be17', 'is_claimed = false', 'Known test claim orphan is no longer inert')
        Forbidden = @('COMMIT;')
    },
    @{
        Path = 'drizzle/migrations/PW7404-1021-02-agent-claim-residency-20260710.sql'
        Required = @('human_agent_links_one_active_agent_idx', 'bot_configs_agent_id_unique_idx', 'humans_email_casefold_unique_idx', 'humans_stripe_subscription_id_unique_idx', 'bot_configs_agent_id_agents_id_fk', 'claim_code_expires_at', 'Claimed agents without an active owner', 'BotSpace residents without canonical agents')
        Forbidden = @('COMMIT;')
    },
    @{
        Path = 'scripts/PW7404-1021-apply-agent-claim-residency.mjs'
        Required = @('SPACEBOT_APPLY_CLAIM_RESIDENCY', 'SPACEBOT_EXPECTED_DATABASE', 'PW7404-1021-01-reconcile', 'PW7404-1021-02-agent-claim', 'ON_ERROR_STOP=1', '--single-transaction')
    },
    @{
        Path = 'src/db/schema.ts'
        Required = @('human_agent_links_one_active_agent_idx', 'bot_configs_agent_id_unique_idx', 'humans_email_casefold_unique_idx', 'humans_stripe_subscription_id_unique_idx', '.where(sql`${table.status} = ''active''`)', '.where(sql`${table.agentId} IS NOT NULL`)')
    },
    @{
        Path = 'src/app/api/v1/humans/avatar/route.ts'
        Required = @('resolveHumanIdentity', 'identity.humanId')
        Forbidden = @('requireClerkOrBotAuth')
    },
    @{
        Path = 'src/app/api/v1/humans/planet/route.ts'
        Required = @('resolveHumanIdentity', 'identity.humanId')
        Forbidden = @('requireClerkOrBotAuth')
    },
    @{
        Path = 'src/app/api/v1/humans/profile/route.ts'
        Required = @('resolveHumanIdentity', 'eq(humans.id, identity.humanId)', 'Invalid avatar configuration.', 'db.transaction', '.onConflictDoUpdate')
    },
    @{
        Path = 'src/app/api/v1/humans/login/route.ts'
        Required = @('status: 410', 'authUrl: ''/login''', 'same verified email address')
        Forbidden = @('signHumanAccessToken', 'bcrypt.compare')
    },
    @{
        Path = 'src/app/api/v1/humans/register/route.ts'
        Required = @('status: 410', 'authUrl: ''/register''', 'Existing accounts are linked')
        Forbidden = @('passwordHash', 'emailVerificationToken')
    },
    @{
        Path = 'src/app/api/v1/humans/simple-login/route.ts'
        Required = @('status: 410', 'Simple password login has been retired')
        Forbidden = @('<form', 'bcrypt.compare')
    },
    @{
        Path = 'src/app/api/v1/humans/refresh/route.ts'
        Required = @('status: 410', 'Legacy refresh tokens have been retired')
        Forbidden = @('signHumanAccessToken', 'verifyHumanRefreshToken')
    },
    @{
        Path = 'src/app/api/v1/humans/sync-clerk/route.ts'
        Required = @('resolveHumanIdentity', 'identity.authType !== "clerk"')
        Forbidden = @('email_addresses?.[0]', 'x-admin-key')
    },
    @{
        Path = 'src/app/api/v1/humans/theme/route.ts'
        Required = @('resolveHumanIdentity', 'eq(humans.id, identity.humanId)', '.returning({ id: humans.id })')
        Forbidden = @('verifyHumanRequest')
    },
    @{
        Path = 'src/app/api/v1/humans/directory/route.ts'
        Required = @('eq(humans.isPublic, true)', 'eq(humans.isEmailVerified, true)', 'isNotNull(humans.clerkId)', 'id: humans.id')
        Forbidden = @('clerkId: humans.clerkId')
    },
    @{
        Path = 'src/app/api/v1/humans/[username]/top8/route.ts'
        Required = @('UUID_PATTERN', 'eligiblePublicHuman', 'inArray(humans.id, publicHumanIds)', 'clerkIdByPublicId', 'db.transaction')
    },
    @{
        Path = 'src/components/profile/Top8EditModal.tsx'
        Required = @('id: string;', 'humansError', 'saveError', 'onClick={fetchHumans}')
        Forbidden = @('clerkId: string;')
    },
    @{
        Path = 'src/app/api/v1/humans/[username]/wall/route.ts'
        Required = @('resolveHumanIdentity', 'identity.authType !== "clerk"', 'eq(humans.isPublic, true)', 'authorId: sessionUserId', 'POST_NOT_ALLOWED')
        Forbidden = @('verifyHumanRequest')
    },
    @{
        Path = 'src/app/api/v1/humans/[username]/wall/[transmissionId]/route.ts'
        Required = @('eq(profileTransmissions.profileOwnerId, owner.clerkId)', 'currentHuman?.id === transmission.authorId', 'Not authorized to delete this transmission')
    },
    @{
        Path = 'src/components/profile/TransmissionsWall.tsx'
        Required = @('json.code === "POST_NOT_ALLOWED"', 'title="Delete transmission"', 'Failed to load transmissions.')
        Forbidden = @('title="Report"', 'aria-label="Report transmission"')
    },
    @{
        Path = 'src/app/api/v1/stripe/webhook/route.ts'
        Required = @('current_period_end', 'getSubscriptionExpiry', 'stripeSubscriptionId: subscription.id', 'Stale Stripe subscription update ignored', 'Stale Stripe subscription deletion ignored', 'premium access not granted')
        Forbidden = @('computeExpiryFromInterval')
    },
    @{
        Path = 'src/components/humans/dashboard/AIFamilySection.tsx'
        Required = @('/api/v1/humans/agents?limit=100', '/botspace/', 'Your AI Family')
    },
    @{
        Path = 'src/app/api/v1/stripe/checkout/route.ts'
        Required = @('resolveHumanIdentity', 'const { humanId } = identity;', 'pg_advisory_xact_lock', 'isNull(humans.stripeCustomerId)', 'Orphan Stripe customer cleanup failed')
        Forbidden = @('requireClerkOrBotAuth')
    },
    @{
        Path = 'src/app/api/v1/stripe/portal/route.ts'
        Required = @('resolveHumanIdentity', 'identity.humanId')
        Forbidden = @('verifyHumanRequest')
    },
    @{
        Path = 'public/skill.md'
        Required = @('https://spacebot.space/api/v1', '"apiKey"', '/posts/POST_ID/vote', '### One Agent Identity', '/api/social/*', 'Conflicting credential headers fail closed', '### Direct Messages', '/messages/conversation/AGENT_NAME', 'full microsecond precision', 'private message content is never copied into the public')
        Forbidden = @('botspace.online', '/boost', '/dampen')
    },
    @{
        Path = 'public/heartbeat.md'
        Required = @('https://spacebot.space/api/v1/heartbeat', 'every four hours')
        Forbidden = @('botspace.online')
    },
    @{
        Path = 'src/app/api/test-bot/route.ts'
        Required = @('requireClerkOrBotAuth', 'rateLimitExceededResponse')
        Forbidden = @('debug:')
    },
    @{
        Path = 'src/middleware.ts'
        Required = @('"/api/test-bot(.*)",', '"/claim(.*)",', '"/login(.*)",', 'webmanifest|txt|md|xml|json', 'return undefined;')
        Forbidden = @('"/test-bot(.*)",')
    },
    @{
        Path = 'src/components/ticker/HomepageTickerBar.tsx'
        Required = @('ALL_HOMEPAGE_TICKER_SOURCES', 'pickStaticHeadlinesForSources')
        Forbidden = @('"AI News"', '"arXiv"', '"Hugging Face Blog"')
    },
    @{
        Path = 'src/app/api/v1/ticker/headlines/route.ts'
        Required = @('ALL_HOMEPAGE_TICKER_SOURCES', 'pickRotatingHeadlinesForSources<HeadlineRow>')
        Forbidden = @('"AI News"', '"arXiv"', '"Hugging Face Blog"')
    },
    @{
        Path = 'ticker-worker/config.js'
        Required = @('../src/lib/ticker/source-catalog.js')
    },
    @{
        Path = 'src/lib/ticker/homepage-contract.ts'
        Required = @('HOMEPAGE_TICKER_SOURCE_TARGET', 'TOP_TICKER_SOURCES', 'BOTTOM_TICKER_SOURCES')
    },
    @{
        Path = 'src/lib/ticker/homepage-editorial.ts'
        Required = @('isHomepageEditorialPreferred', 'compareHomepageHeadlines')
    },
    @{
        Path = 'src/lib/ticker/homepage-selection.ts'
        Required = @('pickStaticHeadlinesForSources', 'pickRotatingHeadlinesForSources')
    },
    @{
        Path = 'src/lib/ticker/source-catalog.js'
        Required = @('TICKER_SOURCE_CATALOG', 'module.exports')
    },
    @{
        Path = 'safe-build.sh'
        Required = @('cp -a .next/static .next/standalone/.next/', 'cp -a public .next/standalone/')
    },
    @{
        Path = 'scripts/grand-finale-restart.sh'
        Required = @('cp -a .next/static .next/standalone/.next/', 'cp -a public .next/standalone/')
    },
    @{
        Path = 'docs/PW7404-1019-SPACEBOT-SPACE-FRONT-BOARD-20260709.md'
        Required = @('## Active Priority Stack', '## Next Build Slice')
    },
    @{
        Path = 'J:/BigC_Vault/.sync/vault-auto-sync.bat'
        Required = @('git merge --ff-only origin/main', 'skipped: local work present')
        Forbidden = @('git reset --hard')
    }
)

foreach ($rule in $rules) {
    $path = if ([IO.Path]::IsPathRooted($rule.Path)) {
        [IO.Path]::GetFullPath($rule.Path)
    } else {
        [IO.Path]::GetFullPath((Join-Path $repoRoot $rule.Path))
    }

    $checks += 1
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        $failures.Add("Missing file: $path")
        continue
    }

    $content = [IO.File]::ReadAllText($path)
    foreach ($marker in @($rule.Required)) {
        $checks += 1
        if (-not $content.Contains($marker)) {
            $failures.Add("Missing marker '$marker' in $path")
        }
    }

    if ($rule.ContainsKey('Forbidden')) {
        foreach ($marker in @($rule.Forbidden)) {
            $checks += 1
            if ($content.Contains($marker)) {
                $failures.Add("Forbidden marker '$marker' found in $path")
            }
        }
    }
}

$catalogProbe = & node -e "const {SOURCES,TIER_INTERVALS}=require('./ticker-worker/config.js'); const count=Object.keys(SOURCES).length; if(count!==28) process.exit(2); if(Object.keys(TIER_INTERVALS).length!==5) process.exit(3); console.log('catalog=28 tiers=5');" 2>&1
$checks += 1
if ($LASTEXITCODE -ne 0) {
    $failures.Add("Ticker catalog probe failed: $catalogProbe")
}

if (-not $SkipGitDiffCheck) {
    $releasePaths = $rules |
        Where-Object { -not [IO.Path]::IsPathRooted($_.Path) } |
        ForEach-Object { $_.Path }
    # Git writes line-ending notices to stderr even when diff --check passes.
    # Capture the process exit code instead of promoting those notices to a
    # terminating PowerShell error under ErrorActionPreference=Stop.
    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $diffOutput = & git -C $repoRoot diff --check -- @releasePaths 2>&1
        $gitDiffExitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
    $checks += 1
    if ($gitDiffExitCode -ne 0) {
        $failures.Add("git diff --check failed: $diffOutput")
    }
}

if ($failures.Count -gt 0) {
    Write-Host "PW7404-1020 release integrity: FAILED ($($failures.Count) issue(s), $checks checks)" -ForegroundColor Red
    $failures | ForEach-Object { Write-Host "- $_" -ForegroundColor Red }
    exit 1
}

Write-Host "PW7404-1020 release integrity: PASS ($checks checks)" -ForegroundColor Green
Write-Host $catalogProbe
exit 0
