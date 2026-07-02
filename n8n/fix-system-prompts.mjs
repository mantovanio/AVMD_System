import { readFileSync, writeFileSync } from 'node:fs'

function updateSystemMessages(filePath) {
  let raw = readFileSync(filePath, 'utf8')
  const wf = JSON.parse(raw)

  for (const node of wf.nodes) {
    if (node.type === '@n8n/n8n-nodes-langchain.agent' && node.parameters.options?.systemMessage) {
      let msg = node.parameters.options.systemMessage

      // sobreEmpresa: remove references to catalogo_ia tool
      msg = msg.replace(/Use a tool catalogo_ia para informa..es de produtos\. Sem pre.os.*?\. /g, '')
      msg = msg.replace(/Use a tool catalogo_ia para informa..es de produtos\. /g, '')
      msg = msg.replace(/Sem pre.os( — para pre.os use renovaCertiID)?\./g, '')
      msg = msg.replace(/Sem pre.os\.$/gm, '')

      // renovaCertiID: remove catalog tool requirement
      msg = msg.replace(/Chame SEMPRE a tool catalogo_ia antes de responder sobre pre.os\. Retorne pre.o EXATO\. Se a tool falhar:.*?Nunca estime pre.os\. /g, '')
      msg = msg.replace(/Chame SEMPRE a tool catalogo_ia antes de responder sobre pre.os\. /g, '')

      if (msg !== node.parameters.options.systemMessage) {
        console.log('  Updated: ' + node.name)
        node.parameters.options.systemMessage = msg.trim()
      } else {
        console.log('  No change: ' + node.name)
      }
    }
  }

  writeFileSync(filePath, JSON.stringify(wf, null, 2))
  console.log('  Saved.')
}

console.log('=== sobreEmpresa-CertiID.json ===')
updateSystemMessages('C:/projetos/AVMD_System/n8n/sobreEmpresa-CertiID.json')

console.log('=== renovaCertiID-CertiID.json ===')
updateSystemMessages('C:/projetos/AVMD_System/n8n/renovaCertiID-CertiID.json')
