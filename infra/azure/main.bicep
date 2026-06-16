// OpenClockwork — Azure reference deployment.
// Scope: subscription (creates the resource group).

targetScope = 'subscription'

@description('Where to deploy. Default = West Europe.')
param location string = 'westeurope'

@description('Lowercase prefix used for all resource names. Keep short — storage account + ACR names cap at 24 chars including the env + hash suffix.')
@minLength(3)
@maxLength(10)
param namePrefix string = 'oclock'

@description('Environment slug — usually "dev", "staging", or "prod".')
@allowed(['dev', 'demo', 'staging', 'prod'])
param environment string = 'dev'

@description('Enables the destructive nightly demo reset job. Never enable this for staging or production.')
param enableDemoReset bool = false

@description('UTC cron expression for the destructive demo reset job.')
param demoResetCronExpression string = '0 3 * * *'

@description('Postgres admin login. Cannot be "azure_superuser", "admin", or other reserved names.')
param postgresAdminLogin string = 'ocadmin'

@secure()
@description('Postgres admin password. Generate with: openssl rand -base64 32.')
param postgresAdminPassword string

@secure()
@description('JWT signing secret for the API. Generate with: openssl rand -base64 48.')
param jwtSecret string

@secure()
@description('Static API key for the ERP export endpoint. Rotate by redeploying.')
param erpApiKey string

@secure()
@description('Static API key for the unattended carry-over expiry cron job. Rotate by redeploying.')
param cronApiKey string

@description('Initial api image. Replace this with the image produced by your own build or deployment process.')
param apiImage string = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

@description('Initial web image. Replace this with the image produced by your own build or deployment process.')
param webImage string = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

// Naming convention: <prefix>-<env>-<resource-suffix>.
// Storage account + ACR need globally-unique lowercase-alphanumeric names so
// we squash dashes and append a short subscription hash.
var hash = uniqueString(subscription().subscriptionId, namePrefix, environment)
var rgName = '${namePrefix}-${environment}-rg'
var laName = '${namePrefix}-${environment}-logs'
var acrName = toLower(replace('${namePrefix}${environment}${substring(hash, 0, 6)}', '-', ''))
var pgName = '${namePrefix}-${environment}-pg'
var kvName = take(toLower('${namePrefix}-${environment}-kv-${substring(hash, 0, 4)}'), 24)
var storageName = take(toLower(replace('${namePrefix}${environment}${substring(hash, 0, 6)}', '-', '')), 24)
var acaEnvName = '${namePrefix}-${environment}-env'
var apiAppName = '${namePrefix}-${environment}-api'
var webAppName = '${namePrefix}-${environment}-web'
var uamiName = '${namePrefix}-${environment}-mi'

resource rg 'Microsoft.Resources/resourceGroups@2024-11-01' = {
  name: rgName
  location: location
  tags: { project: 'openclockwork', environment: environment }
}

module logs 'modules/log-analytics.bicep' = {
  name: 'logs'
  scope: rg
  params: { name: laName, location: location }
}

module acr 'modules/acr.bicep' = {
  name: 'acr'
  scope: rg
  params: { name: acrName, location: location }
}

module pg 'modules/postgres.bicep' = {
  name: 'pg'
  scope: rg
  params: {
    name: pgName
    location: location
    administratorLogin: postgresAdminLogin
    administratorPassword: postgresAdminPassword
  }
}

module kv 'modules/keyvault.bicep' = {
  name: 'kv'
  scope: rg
  params: { name: kvName, location: location }
}

module storage 'modules/storage.bicep' = {
  name: 'storage'
  scope: rg
  params: {
    name: storageName
    location: location
    // A demo reset should remove uploaded visitor files immediately.
    enableDeleteRetention: !(enableDemoReset && environment == 'demo')
  }
}

module acaEnv 'modules/container-app-env.bicep' = {
  name: 'acaEnv'
  scope: rg
  params: {
    name: acaEnvName
    location: location
    logAnalyticsCustomerId: logs.outputs.customerId
    logAnalyticsPrimarySharedKey: logs.outputs.primarySharedKey
  }
}

// Shared UAMI for every Container App + Job. Created before the role
// assignments so the apps can start cleanly on first deploy.
module uami 'modules/user-assigned-identity.bicep' = {
  name: 'uami'
  scope: rg
  params: { name: uamiName, location: location }
}

module roles 'modules/role-assignments.bicep' = {
  name: 'roles'
  scope: rg
  params: {
    uamiPrincipalId: uami.outputs.principalId
    acrName: acr.outputs.name
    keyVaultName: kv.outputs.name
    storageAccountName: storage.outputs.accountName
  }
}

var databaseUrl = 'postgresql://${postgresAdminLogin}:${postgresAdminPassword}@${pg.outputs.fqdn}:5432/${pg.outputs.databaseName}?schema=public&sslmode=require'

module kvSecrets 'modules/keyvault-secrets.bicep' = {
  name: 'kvSecrets'
  scope: rg
  params: {
    keyVaultName: kv.outputs.name
    databaseUrl: databaseUrl
    jwtSecret: jwtSecret
    erpApiKey: erpApiKey
    cronApiKey: cronApiKey
  }
}

module apiApp 'modules/container-app.bicep' = {
  name: 'apiApp'
  scope: rg
  dependsOn: [ roles, kvSecrets ]
  params: {
    name: apiAppName
    location: location
    environmentId: acaEnv.outputs.id
    image: apiImage
    targetPort: 3000
    // Internal only — the web app proxies /api and /socket.io to it.
    external: false
    acrLoginServer: acr.outputs.loginServer
    userAssignedIdentityId: uami.outputs.id
    envVars: [
      { name: 'NODE_ENV', value: 'production' }
      { name: 'API_PORT', value: '3000' }
      { name: 'SWAGGER_ENABLED', value: 'false' }
      // Wall-clock timezone — core-time + off-hours logic reasons in
      // local time, so the server must run in the deployment's zone.
      { name: 'TZ', value: 'Europe/Berlin' }
      { name: 'API_CORS_ORIGINS', value: 'https://${webAppName}.${acaEnv.outputs.defaultDomain}' }
      { name: 'STORAGE_BACKEND', value: 'azure-blob' }
      { name: 'AZURE_BLOB_ACCOUNT', value: storage.outputs.accountName }
      { name: 'AZURE_BLOB_CONTAINER', value: storage.outputs.containerName }
      // Forces the Azure SDK's DefaultAzureCredential to pick the UAMI.
      { name: 'AZURE_CLIENT_ID', value: uami.outputs.clientId }
    ]
    secretRefs: [
      { name: 'database-url', envVarName: 'DATABASE_URL', keyVaultUrl: '${kv.outputs.uri}secrets/DATABASE-URL' }
      { name: 'jwt-secret', envVarName: 'JWT_SECRET', keyVaultUrl: '${kv.outputs.uri}secrets/JWT-SECRET' }
      { name: 'erp-api-key', envVarName: 'ERP_API_KEY', keyVaultUrl: '${kv.outputs.uri}secrets/ERP-API-KEY' }
      { name: 'cron-api-key', envVarName: 'CRON_API_KEY', keyVaultUrl: '${kv.outputs.uri}secrets/CRON-API-KEY' }
    ]
  }
}

module webApp 'modules/container-app.bicep' = {
  name: 'webApp'
  scope: rg
  dependsOn: [ roles ]
  params: {
    name: webAppName
    location: location
    environmentId: acaEnv.outputs.id
    image: webImage
    targetPort: 8080
    external: true
    acrLoginServer: acr.outputs.loginServer
    userAssignedIdentityId: uami.outputs.id
    envVars: [
      // nginx upstream — the internal-only api over the ACA env's HTTPS hop.
      { name: 'API_UPSTREAM', value: 'https://${apiAppName}.internal.${acaEnv.outputs.defaultDomain}' }
      { name: 'DEMO_MODE', value: enableDemoReset && environment == 'demo' ? 'true' : 'false' }
    ]
    secretRefs: []
  }
}

// Manual-trigger job that runs `prisma migrate deploy` against the
// production DB. The deploy workflow starts it after pushing the new
// api image and waits for it before flipping ACA traffic.
var migrateJobName = '${namePrefix}-${environment}-migrate'

module migrateJob 'modules/container-app-job.bicep' = {
  name: 'migrateJob'
  scope: rg
  dependsOn: [ roles, kvSecrets ]
  params: {
    name: migrateJobName
    location: location
    environmentId: acaEnv.outputs.id
    image: apiImage
    command: ['/bin/sh', '-c']
    args: ['npx prisma migrate deploy']
    triggerType: 'Manual'
    acrLoginServer: acr.outputs.loginServer
    userAssignedIdentityId: uami.outputs.id
    envVars: [
      { name: 'NODE_ENV', value: 'production' }
    ]
    secretRefs: [
      { name: 'database-url', envVarName: 'DATABASE_URL', keyVaultUrl: '${kv.outputs.uri}secrets/DATABASE-URL' }
    ]
  }
}

// Scheduled job: nightly carry-over expiry. Uses a public curl image so
// no ACR pull is required; talks to the api over the ACA env's internal
// DNS and authenticates with X-Cron-Key.
var cronJobName = '${namePrefix}-${environment}-carry-expire'
var apiInternalUrl = 'https://${apiAppName}.internal.${acaEnv.outputs.defaultDomain}'

module cronJob 'modules/container-app-job.bicep' = {
  name: 'cronJob'
  scope: rg
  dependsOn: [ roles, kvSecrets ]
  params: {
    name: cronJobName
    location: location
    environmentId: acaEnv.outputs.id
    // Public curl image — small (~7 MB) and pulled directly, no ACR.
    image: 'curlimages/curl:8.10.1'
    command: ['/bin/sh', '-c']
    args: [
      'curl -fsS --max-time 30 -X POST -H "X-Cron-Key: $CRON_API_KEY" "$API_URL/api/cron/expire-carryovers"'
    ]
    triggerType: 'Schedule'
    // Daily at 02:00 UTC — well past most German workday cut-offs.
    cronExpression: '0 2 * * *'
    replicaTimeoutSeconds: 120
    cpu: '0.25'
    memory: '0.5Gi'
    userAssignedIdentityId: uami.outputs.id
    envVars: [
      { name: 'API_URL', value: apiInternalUrl }
    ]
    secretRefs: [
      { name: 'cron-api-key', envVarName: 'CRON_API_KEY', keyVaultUrl: '${kv.outputs.uri}secrets/CRON-API-KEY' }
    ]
  }
}

// Destructive nightly reset for a public demo. It removes all application
// rows and uploaded attachments, then recreates the documented seed data.
// The job contains two explicit guards so an accidental deployment cannot
// reset a non-demo environment.
var demoResetJobName = '${namePrefix}-${environment}-demo-reset'

module demoResetJob 'modules/container-app-job.bicep' = if (enableDemoReset && environment == 'demo') {
  name: 'demoResetJob'
  scope: rg
  dependsOn: [ roles, kvSecrets ]
  params: {
    name: demoResetJobName
    location: location
    environmentId: acaEnv.outputs.id
    image: apiImage
    command: ['/bin/sh', '-c']
    args: ['node --import tsx prisma/demo-reset.ts']
    triggerType: 'Schedule'
    cronExpression: demoResetCronExpression
    replicaTimeoutSeconds: 900
    cpu: '0.5'
    memory: '1.0Gi'
    acrLoginServer: acr.outputs.loginServer
    userAssignedIdentityId: uami.outputs.id
    envVars: [
      { name: 'NODE_ENV', value: 'production' }
      { name: 'TZ', value: 'Europe/Berlin' }
      { name: 'DEMO_RESET_ENABLED', value: 'true' }
      { name: 'DEMO_RESET_CONFIRMATION', value: 'DELETE-AND-RESEED-OPENClockwork-DEMO' }
      { name: 'STORAGE_BACKEND', value: 'azure-blob' }
      { name: 'AZURE_BLOB_ACCOUNT', value: storage.outputs.accountName }
      { name: 'AZURE_BLOB_CONTAINER', value: storage.outputs.containerName }
      { name: 'AZURE_CLIENT_ID', value: uami.outputs.clientId }
    ]
    secretRefs: [
      { name: 'database-url', envVarName: 'DATABASE_URL', keyVaultUrl: '${kv.outputs.uri}secrets/DATABASE-URL' }
    ]
  }
}

output resourceGroupName string = rg.name
output acrLoginServer string = acr.outputs.loginServer
output acrName string = acr.outputs.name
output apiAppName string = apiApp.outputs.name
output webAppName string = webApp.outputs.name
output webFqdn string = webApp.outputs.fqdn
output keyVaultName string = kv.outputs.name
output postgresFqdn string = pg.outputs.fqdn
output storageAccount string = storage.outputs.accountName
output storageContainer string = storage.outputs.containerName
output migrateJobName string = migrateJob.outputs.name
output demoResetJobName string = enableDemoReset && environment == 'demo' ? demoResetJob!.outputs.name : ''
