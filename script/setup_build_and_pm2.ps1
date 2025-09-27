# ================================
# setup_build_and_pm2.ps1
# ================================
# Objetivo:
# - Instalar deps
# - Construir frontend (Vite) -> dist/
# - Subir server com PM2
# - Configurar PM2 para iniciar junto com o Windows
# - Salvar snapshot dos processos
# ================================

$ErrorActionPreference = 'Stop'

# --- Configurações ---
$ProjectDir = 'C:\controle-ponto'
$AppName    = 'controle-ponto'
$NodePort   = $env:PORT; if (-not $NodePort) { $NodePort = '3001' }  # porta do server.js

Write-Host ">> Entrando no projeto: $ProjectDir"
Set-Location $ProjectDir

# --- Garantir Node/npm presentes ---
Write-Host ">> Checando Node e npm..."
node -v | Out-Null
npm -v  | Out-Null

# --- Garantir que a pasta de binários globais do npm está no PATH desta sessão ---
Write-Host ">> Ajustando PATH do npm (somente nesta sessão)..."
$npmPrefix = (& npm config get prefix).Trim()
if (-not (Test-Path $npmPrefix)) {
  throw "Prefixo npm não encontrado: $npmPrefix"
}
if ($env:Path -notlike "*$npmPrefix*") {
  $env:Path = "$npmPrefix;$env:Path"
}
Write-Host "   npm prefix: $npmPrefix"

# --- Instalar dependências do projeto ---
Write-Host ">> Instalando dependências do projeto (npm install)..."
npm install

# --- Build do frontend (Vite) -> dist/ ---
Write-Host ">> Gerando build de produção (npm run build)..."
npm run build

# --- Instalar PM2 global, se necessário ---
Write-Host ">> Checando PM2..."
$pm2Found = $false
try { pm2 -v | Out-Null; $pm2Found = $true } catch { $pm2Found = $false }
if (-not $pm2Found) {
  Write-Host ">> Instalando PM2 globalmente..."
  npm install -g pm2
}

# --- Subir/atualizar app no PM2 ---
Write-Host ">> (Re)iniciando processo no PM2..."
# Tenta deletar um processo anterior com o mesmo nome (se existir)
try { pm2 delete $AppName | Out-Null } catch {}

# Exporta PORT para o ambiente do processo
$env:PORT = $NodePort

# Sobe o server com nome padronizado e preserva env
pm2 start "$ProjectDir\server.js" --name $AppName --update-env

# --- Habilitar autostart no Windows via pm2-windows-startup ---
Write-Host ">> Configurando PM2 para iniciar com o Windows..."
# Instala (ou atualiza) a ferramenta de startup
try { npm list -g pm2-windows-startup | Out-Null } catch {}
npm install -g pm2-windows-startup | Out-Null

# Registra o hook de inicialização. Ignora erro se já estiver instalado.
try { pm2-startup install } catch { Write-Host "   (pm2-startup já instalado?)" }

# --- Salvar snapshot dos processos ---
Write-Host ">> Salvando snapshot do PM2 (pm2 save)..."
pm2 save

# --- Status final ---
Write-Host ">> Status PM2:"
pm2 list

Write-Host "`nTudo pronto! Após reiniciar o Windows, o PM2 irá ressuscitar '$AppName' automaticamente."
Write-Host "Acesse: http://localhost:$NodePort/  (ou http://<IP-do-servidor>:$NodePort/)"
