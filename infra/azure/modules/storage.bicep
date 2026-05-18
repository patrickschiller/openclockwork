// Storage account + a single Blob container for request attachments.
// LRS (locally-redundant) — alpha-class durability; bump to ZRS/GRS for prod.

param name string
param location string
param containerName string = 'requestattachments'

resource account 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: name
  location: location
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
  properties: {
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    allowSharedKeyAccess: true // ACA's Blob adapter uses managed identity
    supportsHttpsTrafficOnly: true
    accessTier: 'Hot'
    networkAcls: { defaultAction: 'Allow', bypass: 'AzureServices' }
  }

  resource blobService 'blobServices' = {
    name: 'default'
    properties: {
      deleteRetentionPolicy: { enabled: true, days: 7 }
    }

    resource container 'containers' = {
      name: containerName
      properties: { publicAccess: 'None' }
    }
  }
}

output accountName string = account.name
output blobEndpoint string = account.properties.primaryEndpoints.blob
output containerName string = containerName
