// Copy to main.bicepparam (gitignored) and fill in the secret values.
// Then deploy with:
//   az deployment sub create \
//     --name openclockwork-dev-$(date +%Y%m%d-%H%M%S) \
//     --location westeurope \
//     --template-file infra/azure/main.bicep \
//     --parameters infra/azure/main.bicepparam

using './main.bicep'

param location = 'westeurope'
param namePrefix = 'oclock'
param environment = 'dev'

// Postgres admin login. Avoid reserved names like admin, root, postgres.
param postgresAdminLogin = 'ocadmin'

// REPLACE: openssl rand -base64 32 | tr -d '/+=' | head -c 32
param postgresAdminPassword = 'CHANGE-ME-postgres'

// REPLACE: openssl rand -base64 48
param jwtSecret = 'CHANGE-ME-jwt'

// REPLACE: openssl rand -hex 32
param erpApiKey = 'CHANGE-ME-erp'

// REPLACE: openssl rand -hex 32
param cronApiKey = 'CHANGE-ME-cron'

// Leave these on the placeholders for the FIRST deploy; the workflow
// updates them with real images once you've pushed them.
// param apiImage = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'
// param webImage = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'
