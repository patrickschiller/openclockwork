// Storage account + a single Blob container for request attachments.
// LRS (locally-redundant) — alpha-class durability; bump to ZRS/GRS for prod.

param name string
param location string
param containerName string = 'requestattachments'
@description('Retain deleted blobs for seven days. Disable for ephemeral demo environments that reset nightly.')
param enableDeleteRetention bool = true

resource account 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: name
  location: location
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
  properties: {
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    // Every workload uses managed identity; shared account keys are unnecessary.
    allowSharedKeyAccess: false
    supportsHttpsTrafficOnly: true
    accessTier: 'Hot'
    networkAcls: { defaultAction: 'Allow', bypass: 'AzureServices' }
  }

  resource blobService 'blobServices' = {
    name: 'default'
    properties: {
      deleteRetentionPolicy: enableDeleteRetention
        ? { enabled: true, days: 7 }
        : { enabled: false }
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
