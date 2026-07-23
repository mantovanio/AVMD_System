# Operação remota via Telegram

Este fluxo transforma o Telegram no painel de comando da sua operação.

## O que já ficou pronto

- Backend do AVMD com webhook de Telegram para alertas e comandos de status.
- Agente local em PowerShell para rodar no seu computador.
- Comandos básicos:
  - `/status`
  - `/pwd`
  - `/project <alias ou caminho>`
  - `/wake <alias, MAC ou apelido>`
  - `/ls [pasta]`
  - `/cat <arquivo>`
  - `/run <comando PowerShell>`
  - `/ok <id>`
  - `/cancel <id>`

## Variáveis do agente local

Configure no Windows:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_ADMIN_CHAT_IDS` — lista separada por vírgula com os chat IDs autorizados
- `TELEGRAM_AGENT_WORKSPACE` — pasta padrão para os comandos
- `TELEGRAM_AGENT_STATE_PATH` — caminho opcional do arquivo de estado
- `TELEGRAM_PROJECT_ALIASES` — JSON com atalhos de projetos, por exemplo:

```json
{"avmd":"C:\\projetos\\AVMD_System","site":"C:\\projetos\\meu-site"}
```
- `TELEGRAM_WOL_TARGETS` — JSON com máquinas que podem ser acordadas, por exemplo:

```json
{"pc":{"mac":"AA:BB:CC:DD:EE:FF","broadcast":"192.168.0.255","port":9}}
```

## Como iniciar

```powershell
powershell -ExecutionPolicy Bypass -File .\ops\scripts\telegram-ops-agent.ps1
```

## Como testar

1. Envie `/start` para o bot.
2. Envie `/status`.
3. Tente `/project avmd`.
4. Tente `/wake pc` se a máquina estiver em sleep e houver outro agente sempre ligado enviando o pacote.
5. Tente `/ls`.
6. Tente `/run Get-ChildItem`.

## Importante sobre acordar o computador

O Telegram sozinho não acorda um PC desligado ou em sleep profundo.

Para funcionar, o comando `/wake` precisa ser executado por um serviço que esteja sempre ligado:

- um VPS;
- um Raspberry Pi;
- outro computador da rede;
- n8n rodando fora do PC que vai dormir.

Esse serviço envia o pacote Wake-on-LAN para a placa de rede do seu PC.

## Observação de segurança

Comandos sensíveis geram confirmação por ID antes de executar. Isso evita execução acidental de ações destrutivas.

## Próximo passo recomendado

Ligar o n8n para:

- leitura de e-mails;
- roteamento de tarefas;
- consulta de caixas compartilhadas;
- rotinas agendadas.
