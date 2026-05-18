// Seeds Key Vault with the runtime secrets the api needs. Lives in its own
// module because the parent main.bicep is scoped to the subscription, and
// secrets are RG-scoped resources.

param keyVaultName string

@secure()
param databaseUrl string
@secure()
param jwtSecret string
@secure()
param erpApiKey string

resource kv 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVaultName
}

resource secretDbUrl 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: 'DATABASE-URL'
  properties: { value: databaseUrl }
}

resource secretJwt 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: 'JWT-SECRET'
  properties: { value: jwtSecret }
}

resource secretErp 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: 'ERP-API-KEY'
  properties: { value: erpApiKey }
}
