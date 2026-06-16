# Azure reference deployment

Bicep templates that stand up the topology described in
[ADR-0001](../../docs/adr/0001-azure-hosting.md): Container Apps + ACR +
Postgres Flexible + Key Vault + Blob Storage + Log Analytics, all in a
single West Europe resource group.

This is **not** the only way to host OpenClockwork. The
`docker-compose.prod.yml` path stays the canonical self-host story; this
directory is the maintainer's reference deployment.

## Layout

```
infra/azure/
├── main.bicep                    # subscription-scoped entry point
├── main.example.bicepparam       # copy → main.bicepparam (gitignored)
└── modules/
    ├── acr.bicep                 # Container Registry (Basic)
    ├── container-app.bicep       # Single ACA service (api or web)
    ├── container-app-env.bicep   # ACA environment
    ├── keyvault.bicep            # Key Vault, RBAC mode
    ├── log-analytics.bicep       # Log Analytics workspace
    ├── postgres.bicep            # Postgres Flexible Server B1ms
    └── storage.bicep             # Storage account + Blob container
```

## Prerequisites (one-time, on your machine)

```bash
brew install azure-cli                    # or your platform's equivalent
az login                                  # interactive sign-in
az account set --subscription <name-or-id>
az bicep install                          # used implicitly by az deployment
```

## One-time GitHub OIDC federation (for deploys without long-lived secrets)

You need a Microsoft Entra app + service principal with a federated
credential bound to this private GitHub repo's `demo` environment. Replace
`<your-...>` placeholders before running:

```bash
APP_NAME=openclockwork-deploy
SUB_ID=$(az account show --query id -o tsv)
TENANT_ID=$(az account show --query tenantId -o tsv)
REPO=patrickschiller/openclockwork-internal

# 1. Create the app + service principal.
APP_ID=$(az ad app create --display-name "$APP_NAME" --query appId -o tsv)
az ad sp create --id "$APP_ID"
SP_OBJECT_ID=$(az ad sp show --id "$APP_ID" --query id -o tsv)

# 2. Federated credential — issued only by jobs using the demo environment.
az ad app federated-credential create --id "$APP_ID" --parameters "{
  \"name\": \"github-demo\",
  \"issuer\": \"https://token.actions.githubusercontent.com\",
  \"subject\": \"repo:$REPO:environment:demo\",
  \"audiences\": [\"api://AzureADTokenExchange\"]
}"

# 3. RBAC: grant the SP Contributor at subscription scope so it can
#    create the RG + everything inside it. Scope down to the RG after
#    the first deploy if you want to tighten this.
az role assignment create \
  --assignee "$SP_OBJECT_ID" \
  --role Contributor \
  --scope "/subscriptions/$SUB_ID"

# Also grant User Access Administrator so the Bicep can create the role
# assignments that bind ACA managed identities to ACR + Key Vault + Blob.
az role assignment create \
  --assignee "$SP_OBJECT_ID" \
  --role "User Access Administrator" \
  --scope "/subscriptions/$SUB_ID"

# 4. Print the three values to paste into GitHub repo Settings → Secrets
#    and variables → Actions → New repository **secret**:
echo "AZURE_CLIENT_ID=$APP_ID"
echo "AZURE_TENANT_ID=$TENANT_ID"
echo "AZURE_SUBSCRIPTION_ID=$SUB_ID"
```

## GitHub repository variables (after the first deploy)

The deploy workflow (`.github/workflows/deploy-azure.yml`) reads the
resource names from repo **variables** so they don't have to be
hard-coded. After running the first manual deploy, take the outputs and
set them under Settings → Secrets and variables → Actions → Variables:

```bash
az deployment sub show --name <deployment-name> \
  --query 'properties.outputs.{
    AZURE_RESOURCE_GROUP: resourceGroupName.value,
    AZURE_ACR_NAME: acrName.value,
    AZURE_ACR_LOGIN_SERVER: acrLoginServer.value,
    AZURE_API_APP_NAME: apiAppName.value,
    AZURE_WEB_APP_NAME: webAppName.value,
    AZURE_MIGRATE_JOB_NAME: migrateJobName.value,
    AZURE_DEMO_RESET_JOB_NAME: demoResetJobName.value,
    AZURE_WEB_FQDN: webFqdn.value
  }' -o jsonc
```

Use `AZURE_WEB_FQDN` as the public web endpoint for smoke tests, monitoring,
or any deployment workflow you add in your own hosting environment.

## First deployment (manual)

```bash
cp infra/azure/main.example.bicepparam infra/azure/main.bicepparam
$EDITOR infra/azure/main.bicepparam   # fill in the secrets

az deployment sub create \
  --name "openclockwork-dev-$(date +%Y%m%d-%H%M%S)" \
  --location westeurope \
  --template-file infra/azure/main.bicep \
  --parameters infra/azure/main.bicepparam
```

That spins everything up with placeholder hello-world images for api and
web. The first push to `main` after merging the deploy workflow will
replace them with the real builds.

## Disposable public demo reset

For the public demo, set these values in the local, gitignored
`infra/azure/main.bicepparam` before deploying the Bicep:

```bicep
param environment = 'demo'
param enableDemoReset = true
param demoResetCronExpression = '0 3 * * *'
```

Redeploy the Bicep once after the public demo reset feature lands. Then
store `demoResetJobName` from the deployment outputs as the repository
variable `AZURE_DEMO_RESET_JOB_NAME`. The deploy workflow treats this
variable as optional; when it is present, each deploy pins the nightly
reset job to the same API image as the application.

## Outputs you'll need

After the deployment finishes:

```bash
az deployment sub show --name <deployment-name> --query properties.outputs -o jsonc
```

The interesting ones:

- `acrLoginServer` — the registry the workflow pushes to
- `apiAppName` / `webAppName` — the ACA app names the workflow updates
- `keyVaultName` — for rotating secrets later
- `postgresFqdn` — for prisma migrate / psql
- `demoResetJobName` — optional; update `AZURE_DEMO_RESET_JOB_NAME`
  when the disposable demo reset is enabled
- `webFqdn` — the public URL of the app

## Cost envelope

See ADR-0001 §"Cost envelope". Roughly 50 EUR/month with everything
running 24/7 and Postgres in Burstable B1ms. ACA scales to zero when
idle, which keeps real cost lower for an alpha.

## Tearing down

```bash
az group delete --name openclockwork-dev-rg --yes --no-wait
```

Key Vault is soft-deleted for 7 days; purge with
`az keyvault purge --name <kv-name>` to free the name immediately.

## What this does NOT do

- DNS / custom domains. After the first deploy, point a CNAME at the
  web app's `properties.configuration.ingress.fqdn` and add a managed
  cert via `az containerapp hostname add/bind`.
- VNet integration / private endpoints. Production-tier change; out of
  scope for the alpha.
- HA Postgres. Single-AZ. Flip to ZoneRedundant in `postgres.bicep`
  when the demo graduates.
- Backups beyond the 7-day Flexible-Server default + 7-day Blob soft
  delete. Wire up Backup Vault when needed.
