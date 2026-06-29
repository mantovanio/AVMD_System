import { createServer } from 'node:http'
import { loadConfig } from './config/env.js'
import { createAivenSqlClient } from './db/aivenClient.js'
import { AivenCheckoutRepository } from './repositories/aivenCheckoutRepository.js'
import { CommercialRepository } from './repositories/commercialRepository.js'
import { CatalogRepository } from './repositories/catalogRepository.js'
import { handleCatalogRoutes } from './routes/catalogRoutes.js'
import { IntegrationEventRepository } from './repositories/integrationEventRepository.js'
import { createIntegrationRegistry } from './integrations/createRegistry.js'
import { IntegrationEventProcessor } from './integrations/eventProcessor.js'
import { CheckoutService } from './services/checkoutService.js'
import { CheckoutPaymentService } from './services/checkoutPaymentService.js'
import { handleCheckoutRoutes } from './routes/checkoutRoutes.js'
import { handleCommercialRoutes } from './routes/commercialRoutes.js'
import { handleIntegrationRoutes } from './routes/integrationRoutes.js'
import { handleProfileRoutes } from './routes/profileRoutes.js'
import { handleAdminUsersRoutes } from './routes/adminUsersRoutes.js'
import { HierarquiaRepository } from './repositories/hierarquiaRepository.js'
import { handleHierarquiaRoutes } from './routes/hierarquiaRoutes.js'
import { ProfileRepository } from './repositories/profileRepository.js'
import { handleExternalIntegrationRoutes } from './routes/externalIntegrationRoutes.js'
import { ExternalIntegrationRepository } from './repositories/externalIntegrationRepository.js'
import { RenovacaoRepository } from './repositories/renovacaoRepository.js'
import { CommunicationTemplateRepository } from './repositories/communicationTemplateRepository.js'
import { AutomationRulesRepository } from './repositories/automationRulesRepository.js'
import { LinksProdutosRepository } from './repositories/linksProdutosRepository.js'
import { LeadRepository } from './repositories/leadRepository.js'
import { CommunicationOutboxRepository } from './repositories/communicationOutboxRepository.js'
import { CommunicationEventRepository } from './repositories/communicationEventRepository.js'
import { ScheduleAutomationRepository } from './repositories/scheduleAutomationRepository.js'
import { handleRenovacaoRoutes } from './routes/renovacaoRoutes.js'
import { handleCommunicationTemplateRoutes } from './routes/communicationTemplateRoutes.js'
import { handleAutomationRulesRoutes } from './routes/automationRulesRoutes.js'
import { handleLinksProdutosRoutes } from './routes/linksProdutosRoutes.js'
import { handleWhatsappSendRoutes } from './routes/whatsappSendRoutes.js'
import { handleEvolutionWebhookRoutes } from './routes/evolutionWebhookRoutes.js'
import { handleCommunicationOutboxRoutes } from './routes/communicationOutboxRoutes.js'
import { handleScheduleAutomationRoutes } from './routes/scheduleAutomationRoutes.js'
import { handleClaraAutomationRoutes } from './routes/claraAutomationRoutes.js'
import { handleChatRoutes } from './routes/chatRoutes.js'
import { writeJson } from './utils/http.js'

const config = loadConfig()
const db = createAivenSqlClient()
const checkoutRepository = new AivenCheckoutRepository(db)
const commercialRepository = new CommercialRepository(db)
const catalogRepository = new CatalogRepository(db)
const integrationEventRepository = new IntegrationEventRepository(db)
const profileRepository = new ProfileRepository(db)
const hierarquiaRepository = new HierarquiaRepository(db)
const externalIntegrationRepository = new ExternalIntegrationRepository(db)
const renovacaoRepository = new RenovacaoRepository(db)
const communicationTemplateRepository = new CommunicationTemplateRepository(db)
const automationRulesRepository = new AutomationRulesRepository(db)
const linksProdutosRepository = new LinksProdutosRepository(db)
const leadRepository = new LeadRepository(db)
const communicationOutboxRepository = new CommunicationOutboxRepository(db)
const communicationEventRepository = new CommunicationEventRepository(db)
const scheduleAutomationRepository = new ScheduleAutomationRepository(db)
const integrationRegistry = createIntegrationRegistry(config)
const integrationEventProcessor = new IntegrationEventProcessor(integrationEventRepository, integrationRegistry)
const checkoutPaymentService = new CheckoutPaymentService(checkoutRepository)
const service = new CheckoutService(checkoutRepository, checkoutPaymentService)

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

    const handledProfile = await handleProfileRoutes(req, res, profileRepository, config.corsOrigin)
    if (handledProfile) return

    const handledAdminUsers = await handleAdminUsersRoutes(req, res, profileRepository, config.clerkSecretKey, config.corsOrigin)
    if (handledAdminUsers) return

    const handledHierarquia = await handleHierarquiaRoutes(req, res, hierarquiaRepository, config.corsOrigin)
    if (handledHierarquia) return

    const handledIntegrations = await handleExternalIntegrationRoutes(req, res, externalIntegrationRepository, config.corsOrigin)
    if (handledIntegrations) return

    const handledRenovacoes = await handleRenovacaoRoutes(req, res, renovacaoRepository, leadRepository, communicationOutboxRepository, config.corsOrigin)
    if (handledRenovacoes) return

    const handledTemplates = await handleCommunicationTemplateRoutes(req, res, communicationTemplateRepository, config.corsOrigin)
    if (handledTemplates) return

    const handledAutomation = await handleAutomationRulesRoutes(req, res, automationRulesRepository, config.corsOrigin)
    if (handledAutomation) return

    const handledLinks = await handleLinksProdutosRoutes(req, res, linksProdutosRepository, config.corsOrigin)
    if (handledLinks) return

    const handledWhatsapp = await handleWhatsappSendRoutes(req, res, externalIntegrationRepository, config.corsOrigin)
    if (handledWhatsapp) return

    const handledEvolutionWebhook = await handleEvolutionWebhookRoutes(
      req,
      res,
      leadRepository,
      communicationEventRepository,
      config,
      config.corsOrigin,
    )
    if (handledEvolutionWebhook) return

    const handledOutbox = await handleCommunicationOutboxRoutes(req, res, communicationOutboxRepository, config.corsOrigin)
    if (handledOutbox) return

    const handledScheduleAutomation = await handleScheduleAutomationRoutes(
      req,
      res,
      scheduleAutomationRepository,
      communicationOutboxRepository,
      config.corsOrigin,
    )
    if (handledScheduleAutomation) return

    const handledClaraAutomation = await handleClaraAutomationRoutes(
      req,
      res,
      leadRepository,
      config.corsOrigin,
    )
    if (handledClaraAutomation) return

    const handledChat = await handleChatRoutes(
      req,
      res,
      leadRepository,
      communicationEventRepository,
      externalIntegrationRepository,
      config.corsOrigin,
    )
    if (handledChat) return

    const handledCatalog = await handleCatalogRoutes(req, res, catalogRepository, config.corsOrigin)
    if (handledCatalog) return

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

    await handleCheckoutRoutes(req, res, service, config.corsOrigin, checkoutPaymentService)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro interno do servidor.'
    writeJson(res, 500, { ok: false, error: message }, config.corsOrigin)
  }
})

server.listen(config.port, () => {
  process.stdout.write(`Backend Aiven do checkout escutando na porta ${config.port}\n`)
})

