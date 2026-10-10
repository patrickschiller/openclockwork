// Copy to main.bicepparam (gitignored) and fill in the secret values.
// Then deploy with:
//   az deployment sub create \
//     --name openclockwork-dev-$(date +%Y%m%d-%H%M%S) \
//     --location westeurope \
//     --template-file infra/azure/main.bicep \
//     --parameters infra/azure/main.bicepparam

using './main.bicep'

param location = 'westeurope'

// IANA timezone for business-day calculations; retain the existing timezone on upgrades.
param timeZone = 'UTC'
param namePrefix = 'oclock'
param environment = 'dev'

// Voluntary only; set to '' to hide the support button. Terminal functionality
// remains fully available in either case.
param supportUrl = 'https://github.com/sponsors/patrickschiller'

// Opt in only for a disposable public demo: this destroys visitor-created
// database rows and attachments every night, then recreates the seed data.
param enableDemoReset = false
param demoResetCronExpression = '0 3 * * *'

// Postgres admin login. Avoid reserved names like admin, root, postgres.
param postgresAdminLogin = 'ocadmin'

// Preserve an existing installation's name. Only a NEW disposable demo should
// explicitly use 'openclockwork_demo' before enabling its destructive reset job.
param postgresDatabaseName = 'openclockwork'

// REPLACE: openssl rand -base64 32 | tr -d '/+=' | head -c 32
param postgresAdminPassword = 'CHANGE-ME-postgres'

// REPLACE: openssl rand -base64 48
param jwtSecret = 'CHANGE-ME-jwt'

// REPLACE independently: openssl rand -hex 32
param terminalQrSecret = 'CHANGE-ME-terminal-qr'

// REPLACE: openssl rand -hex 32
param erpApiKey = 'CHANGE-ME-erp'

// REPLACE: openssl rand -hex 32
param cronApiKey = 'CHANGE-ME-cron'

// Leave these on the placeholders for the FIRST deploy; the workflow
// updates them with real images once you've pushed them.
// param apiImage = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'
// param webImage = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'
