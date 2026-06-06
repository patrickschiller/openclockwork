// Container Registry (Basic SKU). Container Apps pulls via the ACA
// environment's system-assigned managed identity, which is granted
// AcrPull at the registry scope from main.bicep.

param name string
param location string

resource registry 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' = {
  name: name
  location: location
  sku: { name: 'Basic' }
  properties: {
    // We want managed-identity pulls; the deploy workflow uses OIDC to
    // push, so admin user is unnecessary and a security smell.
    adminUserEnabled: false
    publicNetworkAccess: 'Enabled'
  }
}

output id string = registry.id
output name string = registry.name
output loginServer string = registry.properties.loginServer
