# Copie este arquivo para vps-manager.config.ps1 e ajuste os valores.
# O script principal carrega este arquivo automaticamente quando existir.

@{
  SshHost = 'root@147.79.111.76'
  RepoPath = '/opt/avmd/AVMD_System'
  BackendService = 'avmd-backend'
  GuardService = 'avmd-guard.timer'
  EdgeService = 'avmd_web'
}
