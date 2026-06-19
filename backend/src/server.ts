import { createServer } from 'node:http'
import { loadConfig } from './config/env.js'
import { createAivenSqlClient } from './db/aivenClient.js'
import { AivenCheckoutRepository } from './repositories/aivenCheckoutRepository.js'
import { CommercialRepository } from './repositories/commercialRepository.js'
import { IntegrationEventRepository } from './repositories/integrationEventRepository.js'
import { createIntegrationRegistry } from './integrations/createRegistry.js'
import { IntegrationEventProcessor } from './integrations/eventProcessor.js'
import { CheckoutService } from './services/checkoutService.js'
import { handleCheckoutRoutes } from './routes/checkoutRoutes.js'
import { handleCommercialRoutes } from './routes/commercialRoutes.js'
import { handleIntegrationRoutes } from './routes/integrationRoutes.js'
import { writeJson } from './utils/http.js'

const config = loadConfig()
const db = createAivenSqlClient()
const checkoutRepository = new AivenCheckoutRepository(db)
const commercialRepository = new CommercialRepository(db)
const integrationEventRepository = new IntegrationEventRepository(db)
const integrationRegistry = createIntegrationRegistry(config)
const integrationEventProcessor = new IntegrationEventProcessor(integrationEventRepository, integrationRegistry)
const service = new CheckoutService(checkoutRepository)

const server = createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/healthz') {
      writeJson(res, 200, { ok: true, service: 'avmd-backend' }, config.corsOrigin)
      return
    }

    if (req.method === 'OPTIONS') {
      writeJson(res, 204, {}, config.corsOrigin)
      return
    }

    const handledCommercial = await handleCommercialRoutes(req, res, commercialRepository, config.corsOrigin)
    if (handledCommercial) return

    const handledIntegration = await handleIntegrationRoutes(
      req,
      res,
      integrationEventRepository,
      integrationEventProcessor,
      config.corsOrigin,
    )
    if (handledIntegration) return

    await handleCheckoutRoutes(req, res, service, config.corsOrigin)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro interno do servidor.'
    writeJson(res, 500, { ok: false, error: message }, config.corsOrigin)
  }
})

server.listen(config.port, () => {
  process.stdout.write(`Backend Aiven do checkout escutando na porta ${config.port}\n`)
})



