// Azure Database for PostgreSQL — Flexible Server, Burstable B1ms.
// Single-AZ; HA would roughly double the cost and the alpha doesn't need it.

param name string
param location string
param administratorLogin string
@secure()
param administratorPassword string
param databaseName string = 'openclockwork'
param storageSizeGB int = 32
param skuName string = 'Standard_B1ms'
param skuTier string = 'Burstable'
param postgresVersion string = '16'

resource server 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: name
  location: location
  sku: {
    name: skuName
    tier: skuTier
  }
  properties: {
    version: postgresVersion
    administratorLogin: administratorLogin
    administratorLoginPassword: administratorPassword
    storage: { storageSizeGB: storageSizeGB }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: { mode: 'Disabled' }
    network: { publicNetworkAccess: 'Enabled' }
    authConfig: { activeDirectoryAuth: 'Disabled', passwordAuth: 'Enabled' }
  }

  // Allow Azure-internal traffic (incl. Container Apps) — public endpoint
  // is on, but the firewall still gates connections. For prod you'd lock
  // this down to a VNet-integrated ACA env.
  resource allowAzure 'firewallRules' = {
    name: 'AllowAllAzureServices'
    properties: {
      startIpAddress: '0.0.0.0'
      endIpAddress: '0.0.0.0'
    }
  }

  resource db 'databases' = {
    name: databaseName
    properties: {
      charset: 'UTF8'
      collation: 'en_US.utf8'
    }
  }
}

output fqdn string = server.properties.fullyQualifiedDomainName
output databaseName string = databaseName
output adminLogin string = administratorLogin
