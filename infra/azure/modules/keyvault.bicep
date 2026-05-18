// Key Vault stores DATABASE_URL, JWT_SECRET, ERP_API_KEY, and the Blob
// connection bits. ACA references them as secrets at deploy time via the
// `keyVaultUrl` + `identity` properties.

param name string
param location string
param tenantId string = subscription().tenantId

resource vault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: name
  location: location
  properties: {
    tenantId: tenantId
    sku: { family: 'A', name: 'standard' }
    enableRbacAuthorization: true
    enabledForDeployment: false
    enabledForTemplateDeployment: true
    enabledForDiskEncryption: false
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
    publicNetworkAccess: 'Enabled'
  }
}

output id string = vault.id
output name string = vault.name
output uri string = vault.properties.vaultUri
