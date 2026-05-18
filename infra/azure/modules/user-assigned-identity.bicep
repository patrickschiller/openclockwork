// Single user-assigned managed identity that every Container App + Job
// shares. Created BEFORE the role assignments and the apps so that role
// grants can settle before any revision tries to start (system-assigned
// identities created on the apps themselves can't precede the role
// assignments that the apps depend on at startup → chicken-and-egg).

param name string
param location string

resource uami 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: name
  location: location
}

output id string = uami.id
output name string = uami.name
output principalId string = uami.properties.principalId
output clientId string = uami.properties.clientId
