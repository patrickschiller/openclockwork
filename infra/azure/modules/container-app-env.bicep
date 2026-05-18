// Container Apps environment — the regional boundary that the api and web
// container apps share. Internal DNS lets web call api by service name.

param name string
param location string
param logAnalyticsCustomerId string
@secure()
param logAnalyticsPrimarySharedKey string

resource environment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: name
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalyticsCustomerId
        sharedKey: logAnalyticsPrimarySharedKey
      }
    }
    // Internal-only ingress for the api means web reaches it as
    // https://api.internal.<env>.<region>.azurecontainerapps.io.
    workloadProfiles: [
      {
        name: 'Consumption'
        workloadProfileType: 'Consumption'
      }
    ]
    zoneRedundant: false
  }
}

output id string = environment.id
output defaultDomain string = environment.properties.defaultDomain
output staticIp string = environment.properties.staticIp
