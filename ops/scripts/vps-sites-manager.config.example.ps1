# Copie para vps-sites-manager.config.ps1 e ajuste conforme seu ambiente.

@{
  SshHost = 'root@147.79.111.76'
  RemoteRoot = '/var/www'
  BackupRoot = '/opt/backups/sites'
  EdgeService = 'avmd_web'
}
