// RG-scoped role assignments for the shared user-assigned managed
// identity (UAMI) that every Container App + Job in this deployment
// uses. Granting roles to a UAMI created up-front avoids the
// chicken-and-egg you get with system-assigned identities (where the
// app needs roles to start, but the roles need the app's principalId).

@description('principalId of the shared UAMI (modules/user-assigned-identity.bicep output).')
param uamiPrincipalId string

// Well-known Azure built-in role definition IDs.
var roleAcrPull = '7f951dda-4ed3-4680-a7ca-43fe172d538d'
var roleKvSecretsUser = '4633458b-17de-408a-b874-0445c86b69e6'
var roleStorageBlobDataContributor = 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'

// Pull both api + web images. Cron job uses a public registry so it
// doesn't need this; we grant once at RG scope and every UAMI consumer
// gets it.
resource acrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, uamiPrincipalId, 'acrpull')
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleAcrPull)
    principalId: uamiPrincipalId
    principalType: 'ServicePrincipal'
  }
}

// Read DATABASE-URL / JWT-SECRET / ERP-API-KEY / CRON-API-KEY at app start.
resource kvSecrets 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, uamiPrincipalId, 'kvsecrets')
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleKvSecretsUser)
    principalId: uamiPrincipalId
    principalType: 'ServicePrincipal'
  }
}

// Write request attachments to the blob container.
resource blobContrib 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, uamiPrincipalId, 'blobcontrib')
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleStorageBlobDataContributor)
    principalId: uamiPrincipalId
    principalType: 'ServicePrincipal'
  }
}
