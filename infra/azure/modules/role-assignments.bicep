// Role assignments for the ACA managed identities. Pulled into its own
// module because main.bicep is sub-scoped and role assignments here are
// RG-scoped.

param apiPrincipalId string
param webPrincipalId string
param migrateJobPrincipalId string
param cronJobPrincipalId string

// Well-known Azure built-in role definition IDs.
var roleAcrPull = '7f951dda-4ed3-4680-a7ca-43fe172d538d'
var roleKvSecretsUser = '4633458b-17de-4321-9d10-d09d1cd4a6a8'
var roleStorageBlobDataContributor = 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'

resource acrPullApi 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, apiPrincipalId, 'acrpull')
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleAcrPull)
    principalId: apiPrincipalId
    principalType: 'ServicePrincipal'
  }
}

resource acrPullWeb 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, webPrincipalId, 'acrpull')
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleAcrPull)
    principalId: webPrincipalId
    principalType: 'ServicePrincipal'
  }
}

resource kvSecretsApi 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, apiPrincipalId, 'kvsecrets')
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleKvSecretsUser)
    principalId: apiPrincipalId
    principalType: 'ServicePrincipal'
  }
}

resource blobApi 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, apiPrincipalId, 'blobcontrib')
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleStorageBlobDataContributor)
    principalId: apiPrincipalId
    principalType: 'ServicePrincipal'
  }
}

resource acrPullMigrate 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, migrateJobPrincipalId, 'acrpull')
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleAcrPull)
    principalId: migrateJobPrincipalId
    principalType: 'ServicePrincipal'
  }
}

resource kvSecretsMigrate 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, migrateJobPrincipalId, 'kvsecrets')
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleKvSecretsUser)
    principalId: migrateJobPrincipalId
    principalType: 'ServicePrincipal'
  }
}

// Cron job only needs Key Vault Secrets User (for CRON-API-KEY); no ACR
// pull since it uses a public image.
resource kvSecretsCron 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, cronJobPrincipalId, 'kvsecrets')
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleKvSecretsUser)
    principalId: cronJobPrincipalId
    principalType: 'ServicePrincipal'
  }
}
