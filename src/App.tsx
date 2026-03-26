// Módulo: oraculo-financeiro/src/App.tsx
// Versão: v01.02.00
// Descrição: Frontend do Oráculo Financeiro — análise LCI/LCA e Tesouro IPCA+ com IA Gemini.

import { useEffect, useMemo, useState } from 'react'
import './App.css'
import {
  aliquotaIrRegressiva,
  aliquotaIof,
  cdbEquivalenteALciLca,
  rendimentoLiquidoLciLca,
  rendimentoLiquidoCdb,
  ganhoRealAnualizado,
  taxaEfetivaAnualDoPeriodo,
  classificarLciLca,
  analisarLote,
  type AnaliseTesouroLote,
  gerarSinalTesouro,
  dataMediaPonderada,
  mediasPonderadasPorCapital,
  diasParaMenorIr as calcDiasParaMenorIr,
} from './lib/finance'

const APP_VERSION = 'APP v01.03.00'

type TabId = 'lci-lca' | 'tesouro-ipca'

type RegistroBase = {
  id: string
  criadoEm: string
}

type RegistroLciLca = RegistroBase & {
  prazoDias: number
  taxaLciLca: number
  aporte: number
  aliquotaIr: number
  cdbEquivalente: number
}

type RegistroTesouroIpca = RegistroBase & {
  dataCompra: string
  valorInvestido: number
  taxaContratada: number
  taxaAtual: number
  diasParaMenorIr: number
  sinal: 'vender' | 'manter'
  analise: string
}

type NotificationTone = 'success' | 'info' | 'warning' | 'error'
type ConnectionStatus = 'checking' | 'online' | 'offline'

type NotificationItem = {
  id: string
  tone: NotificationTone
  title: string
  message: string
}

type ApiListResponse<T> = {
  ok: boolean
  data: T[]
  total?: number
  limit?: number
  offset?: number
}

type ApiCreateResponse<T> = {
  ok: boolean
  data: T
}

type LoteTesouroForm = {
  dataCompra: string
  valorInvestido: number
  taxaContratada: number
}

type AvaliacaoIA = 'bom' | 'regular' | 'ruim'
type RecomendacaoIA = 'MANTER' | 'VENDER' | 'AGUARDAR' | 'EVITAR'

type AnaliseIA = {
  avaliacao: AvaliacaoIA
  titulo: string
  analise: string
  numerosChave: {
    retornoLiquidoEstimado: string
    ganhoRealAcimaIpca: string
    comparacaoTesouroSelic: string
  }
  recomendacao: RecomendacaoIA
  timing: string
  ciladas: string[]
  resumo: string
}

async function parseApiError(response: Response) {
  try {
    const payload = await response.json() as { error?: string }
    return payload.error ?? `HTTP ${response.status}`
  } catch {
    return `HTTP ${response.status}`
  }
}

// ── Formatação Brasileira (máscaras de input) ─────────────────────────────────

/** Formata número como moeda brasileira: 15491.04 → "15.491,04" */
function formatBRL(value: number, decimals = 2): string {
  if (isNaN(value) || value === 0) return ''
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

/** Parseia string brasileira de volta para número: "15.491,04" → 15491.04 */
function parseBRL(input: string): number {
  // Remove tudo que não é dígito, vírgula ou ponto
  const clean = input.replace(/[^\d.,]/g, '')
  // Converte formato BR para JS: remove pontos de milhar, troca vírgula por ponto
  const normalized = clean.replace(/\./g, '').replace(',', '.')
  const val = parseFloat(normalized)
  return isNaN(val) ? 0 : val
}

/** Formata taxa percentual: 7.41 → "7,41" */
function formatTaxa(value: number): string {
  if (isNaN(value) || value === 0) return ''
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function App() {
  const [activeTab, setActiveTab] = useState<TabId>('tesouro-ipca')
  const [loading, setLoading] = useState(false)

  const [prazoDias, setPrazoDias] = useState(365)
  const [taxaLciLca, setTaxaLciLca] = useState(90)
  const [aporte, setAporte] = useState(10000)
  const [taxaAtualTesouro, setTaxaAtualTesouro] = useState(7)
  const [durationAnos, setDurationAnos] = useState(5)
  const [cdiAtual, setCdiAtual] = useState(10.65)
  const [ipcaProjetado, setIpcaProjetado] = useState(4.83)

  const [novoLoteDataCompra, setNovoLoteDataCompra] = useState(new Date().toISOString().slice(0, 10))
  const [novoLoteValor, setNovoLoteValor] = useState(1000)
  const [novoLoteTaxa, setNovoLoteTaxa] = useState(6)

  const [lciRegistros, setLciRegistros] = useState<RegistroLciLca[]>([])
  const [tesouroRegistros, setTesouroRegistros] = useState<RegistroTesouroIpca[]>([])
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('checking')
  const [analisandoIa, setAnalisandoIa] = useState(false)
  const [analiseIa, setAnaliseIa] = useState<AnaliseIA | null>(null)
  
  // Imagem Drag/Drop
  const [isDragging, setIsDragging] = useState(false)
  const [processandoImg, setProcessandoImg] = useState(false)

  // Tesouro Transparente — taxa IPCA+ indicativa do dia
  const [taxaRef, setTaxaRef] = useState<string | null>(null)
  const [taxaLoading, setTaxaLoading] = useState(false)

  // Auto-fetch taxa do Tesouro Transparente ao montar
  useEffect(() => {
    const fetchTaxa = async () => {
      setTaxaLoading(true)
      try {
        const res = await fetch('/api/taxa-ipca-atual')
        if (!res.ok) return
        const payload = await res.json() as {
          ok: boolean
          taxaMediaIndicativa?: number
          dataReferencia?: string
          fonte?: string
        }
        if (payload.ok && payload.taxaMediaIndicativa) {
          setTaxaAtualTesouro(payload.taxaMediaIndicativa)
          setTaxaRef(payload.dataReferencia ?? null)
          pushNotification('success', 'Taxa atualizada',
            `IPCA+ indicativa: ${payload.taxaMediaIndicativa}% a.a. (${payload.fonte === 'cache' ? 'cache' : 'Tesouro Transparente'} — ref: ${payload.dataReferencia ?? 'hoje'})`)
        }
      } catch {
        // Falha silenciosa — mantém o valor default manual
      } finally {
        setTaxaLoading(false)
      }
    }
    void fetchTaxa()
  }, [])

  // ── LCI/LCA ─────────────────────────────────────────────────────────────
  const aliquotaIr = useMemo(() => aliquotaIrRegressiva(prazoDias), [prazoDias])
  const iofPct = useMemo(() => aliquotaIof(prazoDias), [prazoDias])
  const cdbEquivalente = useMemo(
    () => cdbEquivalenteALciLca(taxaLciLca, aliquotaIr),
    [taxaLciLca, aliquotaIr],
  )
  const rendLciLiquido = useMemo(
    () => rendimentoLiquidoLciLca(aporte, cdiAtual, taxaLciLca, prazoDias),
    [aporte, cdiAtual, taxaLciLca, prazoDias],
  )
  const rendCdbLiquido = useMemo(
    () => rendimentoLiquidoCdb(aporte, cdiAtual, cdbEquivalente, prazoDias),
    [aporte, cdiAtual, cdbEquivalente, prazoDias],
  )
  const rendLciPctAa = useMemo(
    () => aporte > 0 ? taxaEfetivaAnualDoPeriodo((rendLciLiquido / aporte) * 100, prazoDias) : 0,
    [rendLciLiquido, aporte, prazoDias],
  )
  const ganhoRealLci = useMemo(
    () => ganhoRealAnualizado(rendLciPctAa, ipcaProjetado),
    [rendLciPctAa, ipcaProjetado],
  )
  const benchmarkLci = useMemo(() => classificarLciLca(taxaLciLca), [taxaLciLca])

  // ── Tesouro IPCA+ ─────────────────────────────────────────────────────────
  const lotesTesouroForm = useMemo<LoteTesouroForm[]>(
    () => tesouroRegistros.map((r) => ({
      dataCompra: r.dataCompra,
      valorInvestido: r.valorInvestido,
      taxaContratada: r.taxaContratada,
    })),
    [tesouroRegistros],
  )

  const totalInvestidoTesouro = useMemo(
    () => lotesTesouroForm.reduce((sum, l) => sum + l.valorInvestido, 0),
    [lotesTesouroForm],
  )

  const taxaMediaTesouro = useMemo(
    () => mediasPonderadasPorCapital(lotesTesouroForm, (l) => l.taxaContratada),
    [lotesTesouroForm],
  )

  const dataMediaTesouro = useMemo(
    () => dataMediaPonderada(lotesTesouroForm),
    [lotesTesouroForm],
  )

  // Per-lote: Duration Modificada + Convexidade (Fabozzi/CFA Institute)
  const analisesLotes = useMemo<AnaliseTesouroLote[]>(
    () => tesouroRegistros.map((r) =>
      analisarLote(r.dataCompra, r.valorInvestido, r.taxaContratada, taxaAtualTesouro, durationAnos),
    ),
    [tesouroRegistros, taxaAtualTesouro, durationAnos],
  )

  const mtmTotalTesouro = useMemo(
    () => analisesLotes.reduce((s, a) => s + a['mtmR$'], 0),
    [analisesLotes],
  )

  const economiaIrTotal = useMemo(
    () => analisesLotes.reduce((s, a) => s + a.economiaIrAguardando, 0),
    [analisesLotes],
  )

  const aliquotaIrMediaTesouro = useMemo(
    () => mediasPonderadasPorCapital(
      tesouroRegistros.map((r, i) => ({
        valorInvestido: r.valorInvestido,
        ir: analisesLotes[i]?.aliquotaIrAtual ?? 0,
      })),
      (l) => l.ir,
    ),
    [tesouroRegistros, analisesLotes],
  )

  const diasMediosParaMenorIr = useMemo(
    () => Math.round(
      mediasPonderadasPorCapital(
        tesouroRegistros.map((r, i) => ({
          valorInvestido: r.valorInvestido,
          dias: analisesLotes[i]?.diasParaMenorIr ?? 0,
        })),
        (l) => l.dias,
      ),
    ),
    [tesouroRegistros, analisesLotes],
  )

  const durationModMediaTesouro = useMemo(
    () => mediasPonderadasPorCapital(
      analisesLotes.map((a, i) => ({
        valorInvestido: tesouroRegistros[i]?.valorInvestido ?? 0,
        md: a.md,
      })),
      (l) => l.md,
    ),
    [analisesLotes, tesouroRegistros],
  )

  const decisaoTesouro = useMemo(
    () => gerarSinalTesouro(
      taxaMediaTesouro,
      taxaAtualTesouro,
      diasMediosParaMenorIr,
      aliquotaIrMediaTesouro,
      mtmTotalTesouro,
      economiaIrTotal,
    ),
    [taxaMediaTesouro, taxaAtualTesouro, diasMediosParaMenorIr, aliquotaIrMediaTesouro, mtmTotalTesouro, economiaIrTotal],
  )



  const pushNotification = (tone: NotificationTone, title: string, message: string) => {
    const item: NotificationItem = {
      id: crypto.randomUUID(),
      tone,
      title,
      message
    }

    setNotifications((previous) => [item, ...previous].slice(0, 4))
    window.setTimeout(() => {
      setNotifications((previous) => previous.filter((entry) => entry.id !== item.id))
    }, 4200)
  }

  const carregarRegistros = async () => {
    setLoading(true)

    try {
      const [lciResponse, tesouroResponse] = await Promise.all([
        fetch('/api/registros-lci-cdb?limit=200'),
        fetch('/api/tesouro-ipca')
      ])

      if (!lciResponse.ok) {
        throw new Error(`Falha ao carregar LCI/CDB: ${await parseApiError(lciResponse)}`)
      }

      if (!tesouroResponse.ok) {
        throw new Error(`Falha ao carregar tesouro: ${await parseApiError(tesouroResponse)}`)
      }

      const lciPayload = await lciResponse.json() as ApiListResponse<RegistroLciLca>
      const tesouroPayload = await tesouroResponse.json() as ApiListResponse<RegistroTesouroIpca>

      setLciRegistros(lciPayload.data)
      setTesouroRegistros(tesouroPayload.data)
      setConnectionStatus('online')
    } catch {
      setConnectionStatus('offline')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void carregarRegistros()
  }, [])

  useEffect(() => { setAnaliseIa(null) }, [activeTab])

  const handleSalvarLciLca = async () => {
    const novoRegistro: RegistroLciLca = {
      id: crypto.randomUUID(),
      criadoEm: new Date().toISOString(),
      prazoDias,
      taxaLciLca,
      aporte,
      aliquotaIr,
      cdbEquivalente
    }

    if (prazoDias <= 0 || taxaLciLca <= 0 || aporte <= 0) {
      pushNotification('warning', 'Parâmetros inválidos', 'Informe prazo, taxa e aporte com valores positivos.')
      return
    }

    setLoading(true)

    try {
      const response = await fetch('/api/registros-lci-cdb', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(novoRegistro)
      })

      if (!response.ok) {
        throw new Error(await parseApiError(response))
      }

      const payload = await response.json() as ApiCreateResponse<RegistroLciLca>
      setLciRegistros((previous) => [payload.data, ...previous].slice(0, 200))
      pushNotification('success', 'Registro salvo', 'Dados gravados com sucesso no D1 financeiro-db.')
    } catch (error) {
      pushNotification('error', 'Erro ao salvar', error instanceof Error ? error.message : 'Não foi possível salvar no D1.')
    } finally {
      setLoading(false)
    }
  }

  const handleSalvarLoteTesouro = async () => {
    if (!novoLoteDataCompra || novoLoteValor <= 0 || novoLoteTaxa <= 0 || taxaAtualTesouro <= 0) {
      pushNotification('warning', 'Parâmetros inválidos', 'Preencha data, valor e taxas válidas para o lote.')
      return
    }

    const diasIrNovoLote = calcDiasParaMenorIr(novoLoteDataCompra)

    const lotesComNovo = [
      ...lotesTesouroForm,
      { dataCompra: novoLoteDataCompra, valorInvestido: novoLoteValor, taxaContratada: novoLoteTaxa },
    ]

    const taxaMediaComNovo = mediasPonderadasPorCapital(lotesComNovo, (l) => l.taxaContratada)
    const dataMediaComNovo = dataMediaPonderada(lotesComNovo)

    // Análise do novo lote isolado para snapshot
    const analiseNovoLote = analisarLote(novoLoteDataCompra, novoLoteValor, novoLoteTaxa, taxaAtualTesouro, durationAnos)

    // Análise completa da carteira futura para gerar sinal
    const analisesComNovo = lotesComNovo.map((l) =>
      analisarLote(l.dataCompra, l.valorInvestido, l.taxaContratada, taxaAtualTesouro, durationAnos),
    )
    const diasMediosComNovo = Math.round(
      mediasPonderadasPorCapital(
        lotesComNovo.map((l, i) => ({ valorInvestido: l.valorInvestido, dias: analisesComNovo[i]?.diasParaMenorIr ?? 0 })),
        (l) => l.dias,
      ),
    )
    const irMediaComNovo = mediasPonderadasPorCapital(
      lotesComNovo.map((l, i) => ({ valorInvestido: l.valorInvestido, ir: analisesComNovo[i]?.aliquotaIrAtual ?? 0 })),
      (l) => l.ir,
    )
    const mtmComNovo = analisesComNovo.reduce((s, a) => s + a['mtmR$'], 0)
    const econComNovo = analisesComNovo.reduce((s, a) => s + a.economiaIrAguardando, 0)

    const decisaoComNovo = gerarSinalTesouro(taxaMediaComNovo, taxaAtualTesouro, diasMediosComNovo, irMediaComNovo, mtmComNovo, econComNovo)
    const sinalBinario: 'vender' | 'manter' = decisaoComNovo.sinal === 'VENDER' ? 'vender' : 'manter'

    const novoRegistro: RegistroTesouroIpca = {
      id: crypto.randomUUID(),
      criadoEm: new Date().toISOString(),
      dataCompra: novoLoteDataCompra,
      valorInvestido: novoLoteValor,
      taxaContratada: novoLoteTaxa,
      taxaAtual: taxaAtualTesouro,
      diasParaMenorIr: diasIrNovoLote,
      sinal: sinalBinario,
      analise: `MD: ${analiseNovoLote.md.toFixed(2)}a | MTM: R$ ${analiseNovoLote['mtmR$'].toFixed(2)} | ` +
        `IR: ${analiseNovoLote.aliquotaIrAtual}% | Média carteira: ${dataMediaComNovo} taxa ${taxaMediaComNovo.toFixed(2)}% | ${decisaoComNovo.texto}`,
    }

    setLoading(true)

    try {
      const response = await fetch('/api/tesouro-ipca', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(novoRegistro)
      })

      if (!response.ok) {
        throw new Error(await parseApiError(response))
      }

      const payload = await response.json() as ApiCreateResponse<RegistroTesouroIpca>
      setTesouroRegistros((previous) => [payload.data, ...previous].slice(0, 200))
      pushNotification('info', 'Lote salvo', `Recomendação atual: ${payload.data.sinal.toUpperCase()}.`)
      setActiveTab('tesouro-ipca')
    } catch (error) {
      pushNotification('error', 'Erro no Tesouro', error instanceof Error ? error.message : 'Falha ao gravar lote no D1.')
    } finally {
      setLoading(false)
    }
  }





  const handleAnalisarIa = async () => {
    setAnalisandoIa(true)
    setAnaliseIa(null)
    try {
      let body: Record<string, unknown>
      if (activeTab === 'lci-lca') {
        body = {
          tipo: 'lci-lca',
          prazoDias, taxaLciLca, aporte, cdiAtual, ipcaProjetado,
          aliquotaIr, cdbEquivalente, rendLciLiquido, rendCdbLiquido,
          rendLciPctAa, ganhoRealLci,
          benchmarkLabel: benchmarkLci.label,
          benchmarkDescricao: benchmarkLci.descricao,
        }
      } else {
        if (tesouroRegistros.length === 0) {
          pushNotification('warning', 'Carteira vazia', 'Adicione pelo menos um lote antes de analisar.')
          setAnalisandoIa(false)
          return
        }
        body = {
          tipo: 'tesouro-ipca',
          lotes: tesouroRegistros.map((r) => ({
            dataCompra: r.dataCompra,
            valorInvestido: r.valorInvestido,
            taxaContratada: r.taxaContratada,
          })),
          taxaAtual: taxaAtualTesouro,
          durationAnos,
          totalInvestido: totalInvestidoTesouro,
          taxaMediaContratada: taxaMediaTesouro,
          durationModMedia: durationModMediaTesouro,
          mtmTotal: mtmTotalTesouro,
          aliquotaIrMedia: aliquotaIrMediaTesouro,
          diasParaMenorIr: diasMediosParaMenorIr,
          ganhoLiquidoHoje: analisesLotes.reduce((s, a) => s + a.ganhoLiquidoHoje, 0),
          ganhoLiquidoIrMin: analisesLotes.reduce((s, a) => s + a.ganhoLiquidoIrMin, 0),
          economiaIr: economiaIrTotal,
          sinal: decisaoTesouro.sinal,
          forcaSinal: decisaoTesouro.forca,
        }
      }
      const res = await fetch('/api/analisar-ia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await parseApiError(res))
      const data = await res.json() as { ok: boolean; analise: AnaliseIA }
      setAnaliseIa(data.analise)
    } catch (error) {
      pushNotification('error', 'Erro na análise IA', error instanceof Error ? error.message : 'Falha ao contactar Gemini.')
    } finally {
      setAnalisandoIa(false)
    }
  }

  const handleProcessFile = async (file: File) => {
    if (!file || !file.type.startsWith('image/')) {
      pushNotification('warning', 'Formato inválido', 'Por favor, arraste ou selecione apenas arquivos de imagem (PNG, JPG).')
      return
    }

    setProcessandoImg(true)
    pushNotification('info', 'Processando imagem', 'O Gemini está extraindo os dados do extrato...')

    try {
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          const result = reader.result as string
          resolve(result.split(',')[1])
        }
        reader.onerror = () => reject(new Error('Falha ao ler o arquivo'))
        reader.readAsDataURL(file)
      })

      const res = await fetch('/api/tesouro-ipca-vision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64Data, mimeType: file.type })
      })

      const payload = await res.json() as { ok: boolean, data?: LoteTesouroForm[], error?: string }
      if (!res.ok || !payload.ok) {
        throw new Error(payload.error ?? 'Falha na IA Vision.')
      }

      if (!payload.data || payload.data.length === 0) {
        pushNotification('warning', 'Nenhum dado encontrado', 'A IA não conseguiu identificar lotes do Tesouro IPCA+ na imagem.')
        return
      }

      // Salvar TODOS os lotes extraídos automaticamente no D1
      let salvos = 0
      let erros = 0

      for (const lote of payload.data) {
        const diasIr = calcDiasParaMenorIr(lote.dataCompra)
        const analise = analisarLote(lote.dataCompra, lote.valorInvestido, lote.taxaContratada, taxaAtualTesouro, durationAnos)
        const sinalBinario: 'vender' | 'manter' = analise['mtmR$'] > 0 ? 'vender' : 'manter'

        const registro: RegistroTesouroIpca = {
          id: crypto.randomUUID(),
          criadoEm: new Date().toISOString(),
          dataCompra: lote.dataCompra,
          valorInvestido: lote.valorInvestido,
          taxaContratada: lote.taxaContratada,
          taxaAtual: taxaAtualTesouro,
          diasParaMenorIr: diasIr,
          sinal: sinalBinario,
          analise: `MD: ${analise.md.toFixed(2)}a | MTM: R$ ${analise['mtmR$'].toFixed(2)} | IR: ${analise.aliquotaIrAtual}% | Vision OCR`,
        }

        try {
          const postRes = await fetch('/api/tesouro-ipca', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(registro),
          })

          if (postRes.ok) {
            const postPayload = await postRes.json() as ApiCreateResponse<RegistroTesouroIpca>
            setTesouroRegistros((prev) => [postPayload.data, ...prev].slice(0, 200))
            salvos++
          } else {
            erros++
          }
        } catch {
          erros++
        }
      }

      // Preencher formulário com o último lote para referência visual
      const ultimo = payload.data[payload.data.length - 1]
      setNovoLoteDataCompra(ultimo.dataCompra)
      setNovoLoteValor(ultimo.valorInvestido)
      setNovoLoteTaxa(ultimo.taxaContratada)

      if (salvos > 0) {
        pushNotification('success', 'Extração concluída',
          `${salvos} lote${salvos > 1 ? 's' : ''} extraído${salvos > 1 ? 's' : ''} e salvo${salvos > 1 ? 's' : ''} no D1.${erros > 0 ? ` (${erros} erro${erros > 1 ? 's' : ''})` : ''}`)
      }
      if (erros > 0 && salvos === 0) {
        pushNotification('error', 'Falha ao salvar', 'Nenhum lote extraído pôde ser salvo no banco de dados.')
      }

      setActiveTab('tesouro-ipca')
    } catch (error) {
      pushNotification('error', 'Erro no Vision', error instanceof Error ? error.message : 'Falha na comunicação com o Gemini.')
    } finally {
      setProcessandoImg(false)
    }
  }

  const handleDropImagem = async (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault()
    setIsDragging(false)
    
    if (activeTab !== 'tesouro-ipca') return

    const file = e.dataTransfer.files[0]
    void handleProcessFile(file)
  }

  const handleInputFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      void handleProcessFile(file)
    }
  }

  return (
    <main className="container">
      <aside className="notifications" aria-live="polite">
        {notifications.map((item) => (
          <div key={item.id} className={`toast ${item.tone}`}>
            <strong>{item.title}</strong>
            <p>{item.message}</p>
          </div>
        ))}
      </aside>

      <header className="hero">
        <div className="hero-top">
          <div className="brand-panel">
            <p className="chip">Oráculo Financeiro</p>
          </div>
          <div className={`status-square ${connectionStatus}`} aria-live="polite" aria-label="Status de conexão">
            <span>{connectionStatus === 'online' ? 'Online' : connectionStatus === 'offline' ? 'Offline' : 'Verificando'}</span>
          </div>
        </div>
      </header>

      <nav className="tabs" aria-label="Abas principais">
        <button
          className={activeTab === 'tesouro-ipca' ? 'tab active' : 'tab'}
          onClick={() => setActiveTab('tesouro-ipca')}
          type="button"
        >
          Tesouro Direto IPCA+
        </button>
        <button
          className={activeTab === 'lci-lca' ? 'tab active' : 'tab'}
          onClick={() => setActiveTab('lci-lca')}
          type="button"
        >
          LCI/LCA → Equivalente CDB
        </button>
      </nav>

      {activeTab === 'lci-lca' && (
        <section className="panel">
          <h2>LCI/LCA: &sim; CDB</h2>

          <div className="grid">
            <label htmlFor="lci-prazo-dias">
              Prazo (Dias corridos)
              <input id="lci-prazo-dias" name="lciPrazoDias" type="number" min={1} autoComplete="off" inputMode="numeric" value={prazoDias} onChange={(e) => setPrazoDias(Number(e.target.value))} />
            </label>

            <label htmlFor="lci-taxa-cdi">
              Taxa da LCI/LCA (% do CDI)
              <input id="lci-taxa-cdi" name="lciTaxaPercentCdi" type="text" autoComplete="off" inputMode="decimal" value={formatTaxa(taxaLciLca)} onChange={(e) => setTaxaLciLca(parseBRL(e.target.value))} />
            </label>

            <label htmlFor="lci-aporte">
              Aporte (R$)
              <input id="lci-aporte" name="investmentAmount" type="text" autoComplete="transaction-amount" inputMode="decimal" value={formatBRL(aporte)} onChange={(e) => setAporte(parseBRL(e.target.value))} />
            </label>

            <label htmlFor="cdi-atual">
              CDI atual (% a.a.)
              <input id="cdi-atual" name="currentCdiRate" type="text" autoComplete="off" inputMode="decimal" value={formatTaxa(cdiAtual)} onChange={(e) => setCdiAtual(parseBRL(e.target.value))} />
            </label>

            <label htmlFor="ipca-projetado">
              IPCA projetado 12m (% a.a.)
              <input id="ipca-projetado" name="projectedIpcaRate" type="text" autoComplete="off" inputMode="decimal" value={formatTaxa(ipcaProjetado)} onChange={(e) => setIpcaProjetado(parseBRL(e.target.value))} />
            </label>
          </div>

          <article className="result">
            <h3>Análise de Equivalência LCI/LCA ↔ CDB</h3>

            <div className="result-grid">
              <div className="result-block">
                <span className="result-label">Alíquota IR do CDB no prazo</span>
                <span className="result-value">{aliquotaIr.toFixed(1)}%</span>
              </div>
              {iofPct > 0 && (
                <div className="result-block warn">
                  <span className="result-label">IOF (prazo &lt; 30 dias)</span>
                  <span className="result-value">{iofPct.toFixed(0)}%</span>
                </div>
              )}
              <div className="result-block highlight">
                <span className="result-label">CDB bruto equivalente</span>
                <span className="result-value">{cdbEquivalente.toFixed(2)}% CDI</span>
              </div>
            </div>

            <div className="result-divider" />

            <h4>Rendimento estimado no período (CDI a {cdiAtual}% a.a.)</h4>
            <div className="result-grid">
              <div className="result-block">
                <span className="result-label">LCI/LCA líquido (isento)</span>
                <span className="result-value positive">R$ {rendLciLiquido.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div className="result-block">
                <span className="result-label">CDB equiv. líquido (após IR)</span>
                <span className="result-value positive">R$ {rendCdbLiquido.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div className="result-block">
                <span className="result-label">Taxa efetiva a.a. (LCI/LCA)</span>
                <span className="result-value">{rendLciPctAa.toFixed(2)}% a.a.</span>
              </div>
              <div className="result-block">
                <span className="result-label">Ganho real (acima do IPCA)</span>
                <span className={`result-value ${ganhoRealLci >= 0 ? 'positive' : 'negative'}`}>
                  {ganhoRealLci >= 0 ? '+' : ''}{ganhoRealLci.toFixed(2)}% a.a.
                </span>
              </div>
            </div>

            <div className="result-divider" />

            <div className={`benchmark-badge ${benchmarkLci.classe}`}>
              <strong>Benchmark: {benchmarkLci.label}</strong>
              <span>{benchmarkLci.descricao}</span>
            </div>
          </article>

          <div className="actions">
            <button onClick={handleSalvarLciLca} type="button">Salvar DB</button>
            <button onClick={() => void carregarRegistros()} type="button" className="ghost">Recarregar do D1</button>
            <button onClick={() => void handleAnalisarIa()} type="button" className="btn-ia" disabled={analisandoIa}>
              {analisandoIa ? 'Analisando...' : '✦ Analisar com IA'}
            </button>
          </div>

          {analiseIa && (
            <article className="result analise-ia">
              <div className="analise-ia-header">
                <span className={`avaliacao-badge ${analiseIa.avaliacao}`}>
                  {analiseIa.avaliacao === 'bom' ? 'BOM' : analiseIa.avaliacao === 'regular' ? 'REGULAR' : 'RUIM'}
                </span>
                <h3>{analiseIa.titulo}</h3>
              </div>
              <div className="analise-ia-numeros">
                <div className="numero-item">
                  <span className="result-label">Retorno líquido</span>
                  <span className="result-value">{analiseIa.numerosChave.retornoLiquidoEstimado}</span>
                </div>
                <div className="numero-item">
                  <span className="result-label">Ganho real (acima IPCA)</span>
                  <span className="result-value">{analiseIa.numerosChave.ganhoRealAcimaIpca}</span>
                </div>
                <div className="numero-item">
                  <span className="result-label">vs Tesouro Selic</span>
                  <span className="result-value">{analiseIa.numerosChave.comparacaoTesouroSelic}</span>
                </div>
              </div>
              <div className="analise-ia-body">
                {analiseIa.analise.split('\n').filter((p) => p.trim()).map((p, i) => <p key={i}>{p}</p>)}
              </div>
              {analiseIa.ciladas.length > 0 && (
                <div className="cilada-lista">
                  <strong>⚠ Alertas detectados</strong>
                  <ul>{analiseIa.ciladas.map((c, i) => <li key={i}>{c}</li>)}</ul>
                </div>
              )}
              <div className={`recomendacao-banner rec-${analiseIa.recomendacao.toLowerCase()}`}>
                <span className="rec-label">{analiseIa.recomendacao}</span>
                <span className="rec-timing">{analiseIa.timing}</span>
              </div>
              <p className="analise-ia-resumo">"{analiseIa.resumo}"</p>
            </article>
          )}

          <div className="records">
            <h3>Marcação a Mercado (LCI/LCA)</h3>
            {loading && lciRegistros.length === 0 ? (
              <p>Carregando dados do D1...</p>
            ) : lciRegistros.length === 0 ? (
              <p>Aguardando inserção de dados...</p>
            ) : (
              <ul>
                {lciRegistros.map((registro) => (
                  <li key={registro.id}>
                    <span>{new Date(registro.criadoEm).toLocaleString('pt-BR')}</span>
                    <span>Prazo: {registro.prazoDias}d | IR: {registro.aliquotaIr.toFixed(1)}%</span>
                    <span>LCI/LCA: {registro.taxaLciLca}% CDI</span>
                    <span>Aporte: R$ {registro.aporte.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    <strong>Eq. CDB: {registro.cdbEquivalente.toFixed(2)}% CDI</strong>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {activeTab === 'tesouro-ipca' && (
        <section 
          className={`panel relative ${isDragging ? 'ring-4 ring-[#1a73e8] bg-[#f8faff]' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={(e) => { e.preventDefault(); setIsDragging(false) }}
          onDrop={(e) => void handleDropImagem(e)}
        >
          {isDragging && (
            <div className="absolute inset-0 z-50 bg-[#1a73e8]/10 backdrop-blur-sm flex items-center justify-center rounded-[30px] border-2 border-dashed border-[#1a73e8]">
              <div className="bg-white p-6 rounded-3xl shadow-lg text-center font-bold text-[#1a73e8] text-lg">
                Solte a imagem do extrato aqui para extração com IA
              </div>
            </div>
          )}
          
          <h2>Tesouro Direto IPCA+: Marcação a Mercado</h2>

          <div className="feature-banner" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem', backgroundColor: processandoImg ? '#fff3cd' : '#e8f0fe', borderRadius: '16px', marginBottom: '2rem', border: `1px solid ${processandoImg ? '#ffc107' : '#d2e3fc'}`, transition: 'all 0.3s ease', position: 'relative', overflow: 'hidden' }}>
            {processandoImg && (
              <div style={{ position: 'absolute', bottom: 0, left: 0, height: '3px', backgroundColor: '#1a73e8', animation: 'progressBar 2s ease-in-out infinite', width: '100%' }} />
            )}
            <div className="feature-info">
              <h3 style={{ margin: 0, color: processandoImg ? '#856404' : '#1a73e8', fontSize: '1.1rem' }}>
                {processandoImg ? '⏳ Gemini processando...' : '✦ Auto-Preenchimento IA'}
              </h3>
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: processandoImg ? '#664d03' : '#3c4043' }}>
                {processandoImg
                  ? 'Extraindo dados do extrato. Isso pode levar alguns segundos...'
                  : 'Anexe um print do extrato. O Gemini identificará os dados sozinho.'}
              </p>
            </div>
            <label className="btn-ia" style={{ cursor: processandoImg ? 'not-allowed' : 'pointer', margin: 0, padding: '0.5rem 1.25rem', opacity: processandoImg ? 0.6 : 1, pointerEvents: processandoImg ? 'none' : 'auto' }}>
              {processandoImg ? '⏳ Processando...' : 'Upload Imagem'}
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleInputFileChange} disabled={processandoImg} />
            </label>
          </div>

          <div className="grid">
            <label htmlFor="tesouro-taxa-atual">
              Taxa IPCA+ ofertada hoje (% a.a.)
              {taxaLoading && <small style={{ color: '#1a73e8', marginLeft: '0.5rem' }}>⏳ Buscando taxa...</small>}
              {taxaRef && !taxaLoading && <small style={{ color: '#34a853', marginLeft: '0.5rem' }}>✓ Tesouro Transparente {taxaRef}</small>}
              <input id="tesouro-taxa-atual" name="currentTesouroRate" type="text" autoComplete="off" inputMode="decimal" value={formatTaxa(taxaAtualTesouro)} onChange={(e) => setTaxaAtualTesouro(parseBRL(e.target.value))} />
            </label>

            <label htmlFor="tesouro-duration">
              Macaulay Duration estimada (anos)
              <input id="tesouro-duration" name="durationYears" type="number" min={0.5} step={0.1} autoComplete="off" inputMode="decimal" value={durationAnos} onChange={(e) => setDurationAnos(Number(e.target.value))} />
            </label>
          </div>

          <article className="result">
            <h3>Resumo da Carteira — MTM com Convexidade</h3>
            <p className="result-footnote">Método: Duration Modificada + Convexidade (Fabozzi/CFA Institute)</p>

            <div className="result-grid">
              <div className="result-block">
                <span className="result-label">Total investido</span>
                <span className="result-value">R$ {totalInvestidoTesouro.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="result-block">
                <span className="result-label">Taxa média contratada (pond.)</span>
                <span className="result-value">{taxaMediaTesouro.toFixed(2)}% a.a.</span>
              </div>
              <div className="result-block">
                <span className="result-label">Taxa de mercado atual</span>
                <span className={`result-value ${taxaAtualTesouro < taxaMediaTesouro ? 'positive' : taxaAtualTesouro > taxaMediaTesouro ? 'negative' : ''}`}>
                  {taxaAtualTesouro.toFixed(2)}% a.a.
                  {taxaAtualTesouro !== taxaMediaTesouro && (
                    <small> ({taxaAtualTesouro < taxaMediaTesouro ? '↓' : '↑'} {Math.abs(taxaAtualTesouro - taxaMediaTesouro).toFixed(2)} p.p.)</small>
                  )}
                </span>
              </div>
              <div className="result-block">
                <span className="result-label">Duration Modificada média</span>
                <span className="result-value">{durationModMediaTesouro.toFixed(2)} anos</span>
              </div>
              <div className="result-block">
                <span className="result-label">Data média de compra (pond.)</span>
                <span className="result-value">{dataMediaTesouro || '—'}</span>
              </div>
              <div className="result-block">
                <span className="result-label">IR médio ponderado</span>
                <span className="result-value">{aliquotaIrMediaTesouro.toFixed(1)}%</span>
              </div>
            </div>

            <div className="result-divider" />
            <h4>Análise de Ganho / Perda (MTM)</h4>
            <div className="result-grid">
              <div className={`result-block ${mtmTotalTesouro > 0 ? 'highlight' : mtmTotalTesouro < 0 ? 'warn' : ''}`}>
                <span className="result-label">Ganho/Perda de MTM estimado</span>
                <span className={`result-value ${mtmTotalTesouro >= 0 ? 'positive' : 'negative'}`}>
                  {mtmTotalTesouro >= 0 ? '+' : ''}R$ {mtmTotalTesouro.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
              {mtmTotalTesouro > 0 && (
                <>
                  <div className="result-block">
                    <span className="result-label">Líquido vender hoje (IR {aliquotaIrMediaTesouro.toFixed(1)}%)</span>
                    <span className="result-value positive">
                      +R$ {analisesLotes.reduce((s, a) => s + a.ganhoLiquidoHoje, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="result-block">
                    <span className="result-label">Líquido aguardando IR 15%</span>
                    <span className="result-value positive">
                      +R$ {analisesLotes.reduce((s, a) => s + a.ganhoLiquidoIrMin, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  {economiaIrTotal > 0.01 && (
                    <div className="result-block">
                      <span className="result-label">Economia fiscal esperando IR 15%</span>
                      <span className="result-value positive">+R$ {economiaIrTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  <div className="result-block">
                    <span className="result-label">Dias médios para IR 15%</span>
                    <span className="result-value">{diasMediosParaMenorIr === 0 ? 'IR já no mínimo ✓' : `${diasMediosParaMenorIr} dias`}</span>
                  </div>
                </>
              )}
            </div>

            <div className="result-divider" />

            <div className={`sinal-banner sinal-${decisaoTesouro.sinal.toLowerCase().replace(' ', '-')} forca-${decisaoTesouro.forca}`}>
              <div className="sinal-header">
                <span className="sinal-badge">{decisaoTesouro.sinal}</span>
                <span className="sinal-forca">{decisaoTesouro.forca}</span>
              </div>
              <p className="sinal-texto">{decisaoTesouro.texto}</p>
              <p className="sinal-sub">{decisaoTesouro.subTexto}</p>
            </div>
          </article>

          <h3>Registrar novo lote</h3>

          <div className="grid relative">
            {processandoImg && (
              <div className="absolute inset-0 z-10 bg-white/80 backdrop-blur-sm flex items-center justify-center rounded-xl">
                <span className="font-bold text-[#1a73e8] animate-pulse">Extraindo dados da imagem com AI...</span>
              </div>
            )}
            <label htmlFor="tesouro-data-compra">
              Data da compra
              <input id="tesouro-data-compra" name="purchaseDate" type="date" autoComplete="off" value={novoLoteDataCompra} onChange={(e) => setNovoLoteDataCompra(e.target.value)} />
            </label>

            <label htmlFor="tesouro-valor-investido">
              Valor investido (R$)
              <input id="tesouro-valor-investido" name="investedAmount" type="text" autoComplete="transaction-amount" inputMode="decimal" value={formatBRL(novoLoteValor)} onChange={(e) => setNovoLoteValor(parseBRL(e.target.value))} />
            </label>

            <label htmlFor="tesouro-taxa-contratada">
              Taxa contratada IPCA+ (% a.a.)
              <input id="tesouro-taxa-contratada" name="contractedTesouroRate" type="text" autoComplete="off" inputMode="decimal" value={formatTaxa(novoLoteTaxa)} onChange={(e) => setNovoLoteTaxa(parseBRL(e.target.value))} />
            </label>
          </div>

          <div className="actions">
            <button onClick={handleSalvarLoteTesouro} type="button">Salvar lote no D1</button>
            <button onClick={() => void carregarRegistros()} type="button" className="ghost">Recarregar do D1</button>
            <button onClick={() => void handleAnalisarIa()} type="button" className="btn-ia" disabled={analisandoIa}>
              {analisandoIa ? 'Analisando...' : '✦ Analisar com IA'}
            </button>
          </div>

          {analiseIa && (
            <article className="result analise-ia">
              <div className="analise-ia-header">
                <span className={`avaliacao-badge ${analiseIa.avaliacao}`}>
                  {analiseIa.avaliacao === 'bom' ? 'BOM' : analiseIa.avaliacao === 'regular' ? 'REGULAR' : 'RUIM'}
                </span>
                <h3>{analiseIa.titulo}</h3>
              </div>
              <div className="analise-ia-numeros">
                <div className="numero-item">
                  <span className="result-label">Retorno líquido</span>
                  <span className="result-value">{analiseIa.numerosChave.retornoLiquidoEstimado}</span>
                </div>
                <div className="numero-item">
                  <span className="result-label">Ganho real (acima IPCA)</span>
                  <span className="result-value">{analiseIa.numerosChave.ganhoRealAcimaIpca}</span>
                </div>
                <div className="numero-item">
                  <span className="result-label">vs Tesouro Selic</span>
                  <span className="result-value">{analiseIa.numerosChave.comparacaoTesouroSelic}</span>
                </div>
              </div>
              <div className="analise-ia-body">
                {analiseIa.analise.split('\n').filter((p) => p.trim()).map((p, i) => <p key={i}>{p}</p>)}
              </div>
              {analiseIa.ciladas.length > 0 && (
                <div className="cilada-lista">
                  <strong>⚠ Alertas detectados</strong>
                  <ul>{analiseIa.ciladas.map((c, i) => <li key={i}>{c}</li>)}</ul>
                </div>
              )}
              <div className={`recomendacao-banner rec-${analiseIa.recomendacao.toLowerCase()}`}>
                <span className="rec-label">{analiseIa.recomendacao}</span>
                <span className="rec-timing">{analiseIa.timing}</span>
              </div>
              <p className="analise-ia-resumo">"{analiseIa.resumo}"</p>
            </article>
          )}

          <div className="records">
            {tesouroRegistros.length === 0 ? (
              <p>Nenhum lote registrado ainda.</p>
            ) : (
              <ul>
                {tesouroRegistros.map((registro, i) => {
                  const analise = analisesLotes[i]
                  return (
                    <li key={registro.id}>
                      <div className="lot-header">
                        <span className="lot-date">Compra: {registro.dataCompra}</span>
                        <span className={`risk ${registro.sinal}`}>{registro.sinal.toUpperCase()}</span>
                      </div>
                      <div className="lot-grid">
                        <span>Investido: <strong>R$ {registro.valorInvestido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></span>
                        <span>Taxa: <strong>{registro.taxaContratada.toFixed(2)}%</strong></span>
                        {analise && (
                          <>
                            <span>MD: <strong>{analise.md.toFixed(2)}a</strong></span>
                            <span>IR atual: <strong>{analise.aliquotaIrAtual}%</strong></span>
                            <span className={analise['mtmR$'] >= 0 ? 'positive' : 'negative'}>
                              MTM: <strong>{analise['mtmR$'] >= 0 ? '+' : ''}R$ {analise['mtmR$'].toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
                              {' '}({analise.mtmPct >= 0 ? '+' : ''}{analise.mtmPct.toFixed(2)}%)
                            </span>
                            <span>Dias p/ IR 15%: <strong>{analise.diasParaMenorIr === 0 ? '✓ atingido' : analise.diasParaMenorIr}</strong></span>
                          </>
                        )}
                      </div>
                      <small className="lot-analise">{registro.analise}</small>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </section>
      )}



      <footer className="app-version-footer">
        <span>{APP_VERSION}</span>
      </footer>
    </main>
  )
}

export default App
