import type { RenovacaoRepository } from '../repositories/renovacaoRepository.js'

const ONE_DAY_MS = 24 * 60 * 60 * 1000
const DEFAULT_INITIAL_DELAY_MS = 5 * 60 * 1000

export class RenewalReconciliationService {
  private intervalId: ReturnType<typeof setInterval> | null = null
  private initialTimeoutId: ReturnType<typeof setTimeout> | null = null
  private running = false

  constructor(private readonly renovacaoRepo: RenovacaoRepository) {}

  start(intervalMs = ONE_DAY_MS, initialDelayMs = DEFAULT_INITIAL_DELAY_MS) {
    if (this.intervalId || this.initialTimeoutId) return

    const tick = async () => {
      await this.processDailyReconciliation()
    }

    this.initialTimeoutId = setTimeout(() => {
      this.initialTimeoutId = null
      void tick()
    }, initialDelayMs)

    this.intervalId = setInterval(() => void tick(), intervalMs)
    console.error(`[RenewalReconciliation] Iniciado: primeira execucao em ${Math.round(initialDelayMs / 60_000)} min; depois a cada ${Math.round(intervalMs / 3_600_000)} h`)
  }

  stop() {
    if (this.initialTimeoutId) {
      clearTimeout(this.initialTimeoutId)
      this.initialTimeoutId = null
    }
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    console.error('[RenewalReconciliation] Parado')
  }

  async processDailyReconciliation(): Promise<{ converted: number; skipped: boolean }> {
    if (this.running) return { converted: 0, skipped: true }

    this.running = true
    const startedAt = Date.now()
    try {
      const converted = await this.renovacaoRepo.reconcileConvertedFromSales('180s')
      const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000)
      console.error(`[RenewalReconciliation] Concluido: ${converted} renovacao(oes) conciliada(s) em ${elapsedSeconds}s`)
      return { converted, skipped: false }
    } catch (error) {
      console.error('[RenewalReconciliation] Erro na conciliacao diaria:', error)
      return { converted: 0, skipped: false }
    } finally {
      this.running = false
    }
  }
}
