// Single Container App. Parameterised enough to host either api or web.
// Uses a shared user-assigned managed identity (UAMI) for ACR pull + KV
// secret resolution — the UAMI is granted its roles BEFORE this module
// runs (see modules/role-assignments.bicep), so the first revision can
// start cleanly.

param name string
param location string
param environmentId string
param image string
param targetPort int
param external bool
param cpu string = '0.25'
param memory string = '0.5Gi'
param minReplicas int = 0
param maxReplicas int = 3
param acrLoginServer string
@description('Resource ID of the shared UAMI used for ACR pull + KV secret resolution.')
param userAssignedIdentityId string
param envVars array = []
@description('Each entry: { name, envVarName, keyVaultUrl } — Key Vault secret URIs.')
param secretRefs array = []

var secretEnvVars = [for s in secretRefs: {
  name: s.envVarName
  secretRef: s.name
}]
var allEnvVars = concat(envVars, secretEnvVars)
var secretConfig = [for s in secretRefs: {
  name: s.name
  keyVaultUrl: s.keyVaultUrl
  identity: userAssignedIdentityId
}]

resource app 'Microsoft.App/containerApps@2024-03-01' = {
  name: name
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${userAssignedIdentityId}': {}
    }
  }
  properties: {
    managedEnvironmentId: environmentId
    configuration: {
      ingress: {
        external: external
        targetPort: targetPort
        transport: 'auto'
        allowInsecure: false
        traffic: [
          { latestRevision: true, weight: 100 }
        ]
      }
      registries: [
        {
          server: acrLoginServer
          identity: userAssignedIdentityId
        }
      ]
      secrets: secretConfig
    }
    template: {
      containers: [
        {
          name: name
          image: image
          resources: { cpu: json(cpu), memory: memory }
          env: allEnvVars
        }
      ]
      scale: { minReplicas: minReplicas, maxReplicas: maxReplicas }
    }
  }
}

output name string = app.name
output fqdn string = app.properties.configuration.ingress.fqdn
