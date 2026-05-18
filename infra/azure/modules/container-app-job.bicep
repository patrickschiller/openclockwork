// One-shot Container Apps Job. Used for prisma migrate deploy on each
// deployment and (later) for the nightly carry-over expiry cron.
//
// Triggered manually from the deploy workflow via:
//   az containerapp job start --name <name> --resource-group <rg>

param name string
param location string
param environmentId string
param image string
param command array = []
param args array = []
param cpu string = '0.5'
param memory string = '1.0Gi'
param triggerType string = 'Manual'
@description('Cron expression — only used when triggerType = "Schedule".')
param cronExpression string = '0 2 * * *'
param replicaTimeoutSeconds int = 600
@description('ACR login server. Pass an empty string to pull from a public registry (no managed-identity pull configured).')
param acrLoginServer string = ''
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
  identity: 'system'
}]

resource job 'Microsoft.App/jobs@2024-03-01' = {
  name: name
  location: location
  identity: { type: 'SystemAssigned' }
  properties: {
    environmentId: environmentId
    configuration: {
      triggerType: triggerType
      replicaTimeout: replicaTimeoutSeconds
      replicaRetryLimit: 1
      manualTriggerConfig: triggerType == 'Manual' ? {
        parallelism: 1
        replicaCompletionCount: 1
      } : null
      scheduleTriggerConfig: triggerType == 'Schedule' ? {
        cronExpression: cronExpression
        parallelism: 1
        replicaCompletionCount: 1
      } : null
      registries: empty(acrLoginServer) ? [] : [
        {
          server: acrLoginServer
          identity: 'system'
        }
      ]
      secrets: secretConfig
    }
    template: {
      containers: [
        {
          name: name
          image: image
          command: command
          args: args
          resources: { cpu: json(cpu), memory: memory }
          env: allEnvVars
        }
      ]
    }
  }
}

output name string = job.name
output principalId string = job.identity.principalId
