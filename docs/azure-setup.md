# Azure-Setup & GitHub-Actions Deployment

Schritt-für-Schritt-Anleitung für die einmalige Einrichtung der Azure-Ressourcen und der Verbindung zu GitHub Actions. Nach Abschluss deployed jeder Push auf `main` Backend und Frontend automatisch.

> **Voraussetzungen**
> - Azure-Subscription mit Owner- oder Contributor+UserAccessAdmin-Rolle.
> - GitHub-Repo `bag-chronos` (Admin-Rechte für Settings → Secrets/Variables).
> - Azure CLI ≥ 2.60 lokal installiert (`az --version`).
> - Lokal eingeloggt: `az login` und `az account set --subscription <SUBSCRIPTION_ID>`.

Alle Befehle sind so geschrieben, dass sie 1:1 in eine `bash`/`zsh`-Shell kopiert werden können. Variablen am Anfang einmal anpassen.

---

## 0 Variablen festlegen

> Hinweis: Die Live-Umgebung wurde am 2026-04-29 eingerichtet.
> Subscription `sub-bag-chronos`, Resource Group `rg-bag-chronos-prod`, Suffix `623bc0`.
> Wer die Doc neu durchspielt, generiert eigenes `SUFFIX` und legt parallel an oder löscht zuerst die existierende RG (`az group delete --name rg-bag-chronos-prod --yes --no-wait`).

```bash
# Einmalig: feste Variablen in Datei schreiben, dann sourcen.
# Wichtig: KEIN $(openssl ...) im File, sonst wird es bei jedem `.` neu evaluiert.
SUFFIX="$(openssl rand -hex 3)"
SQL_PASSWORD="$(openssl rand -base64 24 | tr -d '/=+' | cut -c1-24)Aa1!"

cat > /tmp/bag-chronos-azure.env <<EOF
export LOCATION="westeurope"
export RG="rg-bag-chronos-prod"
export SUFFIX="${SUFFIX}"
export SQL_SERVER="sql-bag-chronos-${SUFFIX}"
export SQL_DB="sqldb-bag-chronos"
export SQL_ADMIN="bagadmin"
export SQL_PASSWORD='${SQL_PASSWORD}'
export PLAN="asp-bag-chronos-prod"
export API_APP="app-bag-chronos-api"
export SWA_NAME="swa-bag-chronos-web"
export KV_NAME="kv-bagchronos-${SUFFIX}"   # KV-Name max 24 Zeichen
export GH_ORG="patrickschiller"
export GH_REPO="bag-chronos"
EOF
chmod 600 /tmp/bag-chronos-azure.env
. /tmp/bag-chronos-azure.env

echo "SQL_PASSWORD=$SQL_PASSWORD"   # SOFORT in Passwort-Manager sichern
```

---

## 1 Resource Group

```bash
az group create --name "$RG" --location "$LOCATION"
```

---

## 2 Azure SQL

```bash
az sql server create \
  --name "$SQL_SERVER" \
  --resource-group "$RG" \
  --location "$LOCATION" \
  --admin-user "$SQL_ADMIN" \
  --admin-password "$SQL_PASSWORD"

# Datenbank (Basic-Tier reicht zum Start)
az sql db create \
  --resource-group "$RG" \
  --server "$SQL_SERVER" \
  --name "$SQL_DB" \
  --service-objective Basic \
  --backup-storage-redundancy Local

# Firewall: Azure-interne Dienste erlauben (App Service, Functions etc.)
az sql server firewall-rule create \
  --resource-group "$RG" \
  --server "$SQL_SERVER" \
  --name AllowAzureServices \
  --start-ip-address 0.0.0.0 \
  --end-ip-address 0.0.0.0
```

Connection-String merken (wird gleich in Key Vault gelegt):

```bash
export SQL_CONN="Server=tcp:${SQL_SERVER}.database.windows.net,1433;Database=${SQL_DB};User ID=${SQL_ADMIN};Password=${SQL_PASSWORD};Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;"
```

---

## 3 Key Vault + Secret

```bash
az keyvault create \
  --name "$KV_NAME" \
  --resource-group "$RG" \
  --location "$LOCATION" \
  --enable-rbac-authorization true

# Eigenen Account für Secret-Schreiben berechtigen
ME=$(az ad signed-in-user show --query id -o tsv)
az role assignment create \
  --role "Key Vault Secrets Officer" \
  --assignee "$ME" \
  --scope "$(az keyvault show --name "$KV_NAME" --query id -o tsv)"

# Secret ablegen (Name passt zur App-Service-Konfiguration in Schritt 4)
az keyvault secret set \
  --vault-name "$KV_NAME" \
  --name "Sql--ConnectionString" \
  --value "$SQL_CONN"
```

---

## 4 App Service (Backend)

```bash
az appservice plan create \
  --name "$PLAN" \
  --resource-group "$RG" \
  --location "$LOCATION" \
  --sku B1 \
  --is-linux

az webapp create \
  --name "$API_APP" \
  --resource-group "$RG" \
  --plan "$PLAN" \
  --runtime "DOTNETCORE:8.0"

# Managed Identity aktivieren
az webapp identity assign --name "$API_APP" --resource-group "$RG"
WEBAPP_PRINCIPAL=$(az webapp identity show --name "$API_APP" --resource-group "$RG" --query principalId -o tsv)

# App Service: Lesezugriff auf Key Vault Secrets
az role assignment create \
  --role "Key Vault Secrets User" \
  --assignee "$WEBAPP_PRINCIPAL" \
  --scope "$(az keyvault show --name "$KV_NAME" --query id -o tsv)"

# App Setting verweist als Key-Vault-Reference auf das Secret
az webapp config appsettings set \
  --name "$API_APP" \
  --resource-group "$RG" \
  --settings \
    "Sql__ConnectionString=@Microsoft.KeyVault(VaultName=${KV_NAME};SecretName=Sql--ConnectionString)" \
    "ASPNETCORE_ENVIRONMENT=Production"
```

> Die doppelten Unterstriche in `Sql__ConnectionString` sind .NET-Konvention für `Sql:ConnectionString` in der Configuration-Hierarchie. In Key Vault wird stattdessen `--` geschrieben, weil `:` dort nicht erlaubt ist.

CORS für die Static Web App muss später ergänzt werden, sobald die SWA-URL bekannt ist (Schritt 5).

---

## 5 Static Web App (Frontend)

```bash
# Static Web App im Free-Tier; Region für SWA ist enumerationsbeschränkt
az staticwebapp create \
  --name "$SWA_NAME" \
  --resource-group "$RG" \
  --location "westeurope" \
  --sku Free
```

URL der SWA holen und CORS am API-App ergänzen:

```bash
SWA_HOST=$(az staticwebapp show --name "$SWA_NAME" --resource-group "$RG" --query defaultHostname -o tsv)
echo "Frontend-URL: https://$SWA_HOST"

az webapp config appsettings set \
  --name "$API_APP" \
  --resource-group "$RG" \
  --settings "Cors__AllowedOrigins__0=https://$SWA_HOST"
```

Deployment-Token der SWA (wird in GitHub als Secret hinterlegt):

```bash
az staticwebapp secrets list \
  --name "$SWA_NAME" \
  --resource-group "$RG" \
  --query "properties.apiKey" -o tsv
```

---

## 6 GitHub-Actions-Authentifizierung via OIDC (Backend)

Statt langlebigen Publish-Profile-Secrets nutzen wir Federated Credentials – GitHub erhält bei jedem Workflow-Lauf einen kurzlebigen Token von Azure AD.

### 6.1 App Registration

```bash
APP_NAME="github-bag-chronos"
APP_ID=$(az ad app create --display-name "$APP_NAME" --query appId -o tsv)
SP_ID=$(az ad sp create --id "$APP_ID" --query id -o tsv)
SUB_ID=$(az account show --query id -o tsv)
TENANT_ID=$(az account show --query tenantId -o tsv)
```

### 6.2 Rolle zuweisen (Contributor auf die Resource Group)

```bash
az role assignment create \
  --role "Contributor" \
  --assignee-object-id "$SP_ID" \
  --assignee-principal-type ServicePrincipal \
  --scope "/subscriptions/$SUB_ID/resourceGroups/$RG"
```

### 6.3 Federated Credentials für GitHub einrichten

Eines pro Trigger-Pfad anlegen (Branch-Push, PR, Environment).

```bash
# Push auf main
az ad app federated-credential create --id "$APP_ID" --parameters "{
  \"name\": \"gh-main\",
  \"issuer\": \"https://token.actions.githubusercontent.com\",
  \"subject\": \"repo:${GH_ORG}/${GH_REPO}:ref:refs/heads/main\",
  \"audiences\": [\"api://AzureADTokenExchange\"]
}"

# Pull Requests
az ad app federated-credential create --id "$APP_ID" --parameters "{
  \"name\": \"gh-pr\",
  \"issuer\": \"https://token.actions.githubusercontent.com\",
  \"subject\": \"repo:${GH_ORG}/${GH_REPO}:pull_request\",
  \"audiences\": [\"api://AzureADTokenExchange\"]
}"

# Environment 'production' (von backend-deploy.yml verwendet)
az ad app federated-credential create --id "$APP_ID" --parameters "{
  \"name\": \"gh-env-production\",
  \"issuer\": \"https://token.actions.githubusercontent.com\",
  \"subject\": \"repo:${GH_ORG}/${GH_REPO}:environment:production\",
  \"audiences\": [\"api://AzureADTokenExchange\"]
}"
```

### 6.4 Werte für GitHub merken

```bash
echo "AZURE_CLIENT_ID=$APP_ID"
echo "AZURE_TENANT_ID=$TENANT_ID"
echo "AZURE_SUBSCRIPTION_ID=$SUB_ID"
```

---

## 7 GitHub konfigurieren

In GitHub: **Settings → Environments** → `production` anlegen (Required reviewers optional, Branch-Protection auf `main`).

### 7.1 Repository Variables (Settings → Variables → Actions)

| Name | Wert |
|---|---|
| `AZURE_CLIENT_ID` | aus 6.4 |
| `AZURE_TENANT_ID` | aus 6.4 |
| `AZURE_SUBSCRIPTION_ID` | aus 6.4 |
| `FRONTEND_API_BASE_URL` | `https://app-bag-chronos-api.azurewebsites.net` |

### 7.2 Repository Secrets (Settings → Secrets → Actions)

| Name | Wert |
|---|---|
| `AZURE_STATIC_WEB_APPS_API_TOKEN` | Output aus Schritt 5 |

> Hinweis: OIDC-Werte sind bewusst Variables (nicht Secrets). Sie sind keine Geheimnisse – ohne den Federated-Credential-Trust nutzlos.

---

## 8 Erster Push & Verifikation

```bash
cd /pfad/zu/bag-chronos
git init
git add .
git commit -m "chore: initial scaffold (Epic 1)"
git branch -M main
git remote add origin git@github.com:${GH_ORG}/${GH_REPO}.git
git push -u origin main
```

In GitHub Actions:
1. `backend-ci` und `frontend-ci` müssen grün werden.
2. `backend-deploy` und `frontend-deploy` laufen auf `main` und veröffentlichen die Anwendungen.

**Smoke-Tests:**

```bash
curl -i https://${API_APP}.azurewebsites.net/api/health
# erwartet: HTTP/1.1 200 OK + {"status":"Healthy",...}

curl -i https://$SWA_HOST/
# erwartet: HTTP/1.1 200 OK + index.html
```

Im Browser: `https://$SWA_HOST` öffnen → Smoke-Page muss "Healthy" anzeigen. PWA-Installations-Prompt erscheint nach 30 s Nutzung (Chrome).

---

## 9 Aufräumen / Wiederholbarkeit

- Komplette Umgebung wegwerfen: `az group delete --name "$RG" --yes --no-wait`.
- App Registration entfernen: `az ad app delete --id "$APP_ID"`.
- Skript-Stub für Idempotenz vorbereiten: alle Befehle oben sind idempotent außer Secret-Wertänderungen; kann später in `scripts/azure-bootstrap.sh` überführt werden.

---

## Häufige Fallstricke

- **`az login` schlägt fehl in CI:** Die Workflows nutzen OIDC und benötigen kein interaktives Login. `permissions: id-token: write` ist im Workflow gesetzt – nicht entfernen.
- **`AADSTS70021` beim Deploy:** Federated Credential für den genauen Subject-String fehlt (z. B. Branch falsch, PR statt Push, Environment-Name). Subject prüfen.
- **Key-Vault-Reference zeigt `Source: Key vault Reference (Resolved)` aber Wert `null`:** Managed Identity hat noch keine Rolle (Schritt 4) – nach Rollenvergabe App Service neu starten (`az webapp restart`).
- **CORS-Fehler im Browser:** `Cors__AllowedOrigins__0` muss exakt der Frontend-Origin entsprechen (inkl. `https://`, ohne Trailing Slash).
- **SQL Connection Timeout:** `Connection Timeout=30` bei Cold Start hochsetzen (60) bzw. App Service auf "Always On" stellen (`az webapp config set --always-on true`).
