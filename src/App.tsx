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

function App() {
  const [activeTab, setActiveTab] = useState<TabId>('lci-lca')
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedRegistroId, setSelectedRegistroId] = useState<string | null>(null)
  const [deleteModalId, setDeleteModalId] = useState<string | null>(null)

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
  const [page, setPage] = useState(1)
  const [pageSize] = useState(25)
  const [totalRegistros, setTotalRegistros] = useState(0)
  const [analisandoIa, setAnalisandoIa] = useState(false)
  const [analiseIa, setAnaliseIa] = useState<AnaliseIA | null>(null)


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

  const registrosFiltrados = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    if (!term) {
      return activeTab === 'lci-lca' ? lciRegistros : tesouroRegistros
    }

    if (activeTab === 'lci-lca') {
      return lciRegistros.filter((registro) => {
        const dataHora = new Date(registro.criadoEm).toLocaleString('pt-BR').toLowerCase()
        return (
          dataHora.includes(term)
          || String(registro.prazoDias).includes(term)
          || String(registro.taxaLciLca).includes(term)
          || String(registro.aporte).includes(term)
          || String(registro.cdbEquivalente).includes(term)
        )
      })
    }

    return tesouroRegistros.filter((registro) => {
      const dataHora = new Date(registro.criadoEm).toLocaleString('pt-BR').toLowerCase()
      return (
        dataHora.includes(term)
        || registro.dataCompra.includes(term)
        || String(registro.valorInvestido).includes(term)
        || String(registro.taxaContratada).includes(term)
        || String(registro.taxaAtual).includes(term)
        || registro.sinal.includes(term)
        || registro.analise.toLowerCase().includes(term)
      )
    })
  }, [activeTab, lciRegistros, tesouroRegistros, searchTerm])

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

  const carregarRegistros = async (targetPage = page) => {
    setLoading(true)

    try {
      const offset = (targetPage - 1) * pageSize
      const [lciResponse, tesouroResponse] = await Promise.all([
        fetch(`/api/registros-lci-cdb?limit=${pageSize}&offset=${offset}`),
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
      setTotalRegistros(Number(lciPayload.total ?? lciPayload.data.length))
      setPage(targetPage)
      setConnectionStatus('online')
    } catch {
      setConnectionStatus('offline')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void carregarRegistros()
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
      setLciRegistros((previous) => [payload.data, ...previous].slice(0, pageSize))
      setTotalRegistros((previous) => previous + 1)
      pushNotification('success', 'Registro salvo', 'Dados gravados com sucesso no D1 bigdata_db.')
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

  const handleCarregarNoFrameLci = (registro: RegistroLciLca) => {
    setPrazoDias(registro.prazoDias)
    setTaxaLciLca(registro.taxaLciLca)
    setAporte(registro.aporte)
    setSelectedRegistroId(registro.id)
    setActiveTab('lci-lca')
    pushNotification('info', 'Registro carregado', 'Parâmetros aplicados no frame principal.')
  }

  const handleCarregarNoFrameTesouro = (registro: RegistroTesouroIpca) => {
    setNovoLoteDataCompra(registro.dataCompra)
    setNovoLoteValor(registro.valorInvestido)
    setNovoLoteTaxa(registro.taxaContratada)
    setTaxaAtualTesouro(registro.taxaAtual)
    setSelectedRegistroId(registro.id)
    setActiveTab('tesouro-ipca')
    pushNotification('info', 'Lote carregado', 'Parâmetros do lote aplicados no módulo Tesouro IPCA+.')
  }

  const handleExcluirRegistroLci = async (id: string) => {
    setLoading(true)

    try {
      const response = await fetch(`/api/registros-lci-cdb?id=${encodeURIComponent(id)}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        throw new Error(await parseApiError(response))
      }

      setLciRegistros((previous) => previous.filter((item) => item.id !== id))
      setTotalRegistros((previous) => Math.max(previous - 1, 0))
      if (selectedRegistroId === id) {
        setSelectedRegistroId(null)
      }
      pushNotification('success', 'Registro excluído', 'Item removido com sucesso da bigdata_db.')
    } catch (error) {
      pushNotification('error', 'Falha na exclusão', error instanceof Error ? error.message : 'Erro ao excluir registro.')
    } finally {
      setLoading(false)
      setDeleteModalId(null)
    }
  }

  const handleExcluirRegistroTesouro = async (id: string) => {
    setLoading(true)

    try {
      const response = await fetch(`/api/tesouro-ipca?id=${encodeURIComponent(id)}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        throw new Error(await parseApiError(response))
      }

      setTesouroRegistros((previous) => previous.filter((item) => item.id !== id))
      if (selectedRegistroId === id) {
        setSelectedRegistroId(null)
      }
      pushNotification('success', 'Lote excluído', 'Lote removido com sucesso da bigdata_db.')
    } catch (error) {
      pushNotification('error', 'Falha na exclusão', error instanceof Error ? error.message : 'Erro ao excluir lote.')
    } finally {
      setLoading(false)
      setDeleteModalId(null)
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
          className={activeTab === 'lci-lca' ? 'tab active' : 'tab'}
          onClick={() => setActiveTab('lci-lca')}
          type="button"
        >
          LCI/LCA → Equivalente CDB
        </button>
        <button
          className={activeTab === 'tesouro-ipca' ? 'tab active' : 'tab'}
          onClick={() => setActiveTab('tesouro-ipca')}
          type="button"
        >
          Tesouro Direto IPCA+
        </button>
      </nav>

      {activeTab === 'lci-lca' && (
        <section className="panel">
          <h2>LCI/LCA: equivalência em CDB</h2>

          <div className="grid">
            <label>
              Prazo (Dias corridos)
              <input type="number" min={1} value={prazoDias} onChange={(e) => setPrazoDias(Number(e.target.value))} />
            </label>

            <label>
              Taxa da LCI/LCA (% do CDI)
              <input type="number" min={1} step={0.1} value={taxaLciLca} onChange={(e) => setTaxaLciLca(Number(e.target.value))} />
            </label>

            <label>
              Aporte (R$)
              <input type="number" min={0} value={aporte} onChange={(e) => setAporte(Number(e.target.value))} />
            </label>

            <label>
              CDI atual (% a.a.)
              <input type="number" min={0.01} step={0.01} value={cdiAtual} onChange={(e) => setCdiAtual(Number(e.target.value))} />
            </label>

            <label>
              IPCA projetado 12m (% a.a.)
              <input type="number" min={0} step={0.01} value={ipcaProjetado} onChange={(e) => setIpcaProjetado(Number(e.target.value))} />
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
            <h3>Registros D1 (LCI/LCA)</h3>
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
        <section className="panel">
          <h2>Tesouro Direto IPCA+: marcação a mercado</h2>

          <div className="grid">
            <label>
              Taxa IPCA+ ofertada hoje (% a.a.)
              <input type="number" min={0.01} step={0.01} value={taxaAtualTesouro} onChange={(e) => setTaxaAtualTesouro(Number(e.target.value))} />
            </label>

            <label>
              Macaulay Duration estimada (anos)
              <input type="number" min={0.5} step={0.1} value={durationAnos} onChange={(e) => setDurationAnos(Number(e.target.value))} />
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

          <div className="grid">
            <label>
              Data da compra
              <input type="date" value={novoLoteDataCompra} onChange={(e) => setNovoLoteDataCompra(e.target.value)} />
            </label>

            <label>
              Valor investido (R$)
              <input type="number" min={1} value={novoLoteValor} onChange={(e) => setNovoLoteValor(Number(e.target.value))} />
            </label>

            <label>
              Taxa contratada IPCA+ (% a.a.)
              <input type="number" min={0.01} step={0.01} value={novoLoteTaxa} onChange={(e) => setNovoLoteTaxa(Number(e.target.value))} />
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

      <footer className="footer-table panel">
        <h2>Registros D1 (rodapé) — {activeTab === 'lci-lca' ? 'LCI/LCA' : 'Tesouro IPCA+'}</h2>
        <p className="legend">Clique em um registro para carregar no frame principal. Use a lixeira para excluir.</p>

        <div className="table-toolbar">
          <input
            type="text"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Filtrar por data, prazo, CDI ou aporte"
            aria-label="Filtrar registros"
          />
          <small>{registrosFiltrados.length} registro(s)</small>
        </div>

        <div className="table-wrapper" role="region" aria-label="Tabela de registros LCI/CDB">
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Hora</th>
                {activeTab === 'lci-lca' ? (
                  <>
                    <th>Prazo</th>
                    <th>LCI/LCA (% CDI)</th>
                    <th>Eq. CDB</th>
                  </>
                ) : (
                  <>
                    <th>Compra</th>
                    <th>Taxa Contratada</th>
                    <th>Taxa Atual</th>
                  </>
                )}
                <th>Excluir</th>
              </tr>
            </thead>
            <tbody>
              {registrosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={6}>Nenhum registro encontrado para o filtro atual.</td>
                </tr>
              ) : (
                registrosFiltrados.map((registro) => {
                  const date = new Date((registro as RegistroBase).criadoEm)
                  const data = date.toLocaleDateString('pt-BR')
                  const hora = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

                  return (
                    <tr
                      key={(registro as RegistroBase).id}
                      onClick={() => {
                        if (activeTab === 'lci-lca') {
                          handleCarregarNoFrameLci(registro as RegistroLciLca)
                        } else {
                          handleCarregarNoFrameTesouro(registro as RegistroTesouroIpca)
                        }
                      }}
                      className={selectedRegistroId === (registro as RegistroBase).id ? 'clickable-row selected-row' : 'clickable-row'}
                    >
                      <td>{data}</td>
                      <td>{hora}</td>
                      {activeTab === 'lci-lca' ? (
                        <>
                          <td>{(registro as RegistroLciLca).prazoDias}d</td>
                          <td>{(registro as RegistroLciLca).taxaLciLca.toFixed(2)}%</td>
                          <td>{(registro as RegistroLciLca).cdbEquivalente.toFixed(2)}%</td>
                        </>
                      ) : (
                        <>
                          <td>{(registro as RegistroTesouroIpca).dataCompra}</td>
                          <td>{(registro as RegistroTesouroIpca).taxaContratada.toFixed(2)}%</td>
                          <td>{(registro as RegistroTesouroIpca).taxaAtual.toFixed(2)}%</td>
                        </>
                      )}
                      <td>
                        <button
                          type="button"
                          className="icon-button"
                          title="Excluir registro"
                          aria-label="Excluir registro"
                          onClick={(event) => {
                            event.stopPropagation()
                            setDeleteModalId((registro as RegistroBase).id)
                          }}
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="pagination-bar">
          <button
            type="button"
            className="ghost"
            disabled={page <= 1 || loading}
            onClick={() => void carregarRegistros(page - 1)}
          >
            ← Anterior
          </button>
          <span>
            Página {page} de {Math.max(1, Math.ceil(totalRegistros / pageSize))}
          </span>
          <button
            type="button"
            className="ghost"
            disabled={page >= Math.max(1, Math.ceil(totalRegistros / pageSize)) || loading}
            onClick={() => void carregarRegistros(page + 1)}
          >
            Próxima →
          </button>
        </div>
      </footer>

      {deleteModalId && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="delete-modal-title">
            <h3 id="delete-modal-title">Excluir registro?</h3>
            <p>Essa ação remove o item da base bigdata_db e não pode ser desfeita.</p>
            <div className="modal-actions">
              <button type="button" className="ghost" onClick={() => setDeleteModalId(null)}>Cancelar</button>
              <button
                type="button"
                onClick={() => {
                  if (activeTab === 'lci-lca') {
                    void handleExcluirRegistroLci(deleteModalId)
                  } else {
                    void handleExcluirRegistroTesouro(deleteModalId)
                  }
                }}
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

export default App
