import { useEffect, useMemo, useState } from 'react'
import './App.css'

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

async function parseApiError(response: Response) {
  try {
    const payload = await response.json() as { error?: string }
    return payload.error ?? `HTTP ${response.status}`
  } catch {
    return `HTTP ${response.status}`
  }
}

function calcularAliquotaIr(prazoDias: number) {
  if (prazoDias <= 180) return 22.5
  if (prazoDias <= 360) return 20
  if (prazoDias <= 720) return 17.5
  return 15
}

function calcularCdbEquivalente(taxaLciLca: number, aliquotaIr: number) {
  const fatorLiquidoCdb = 1 - (aliquotaIr / 100)
  if (fatorLiquidoCdb <= 0) return 0
  return taxaLciLca / fatorLiquidoCdb
}

function calcularDiasParaMenorIr(dataCompra: string) {
  const compra = new Date(dataCompra)
  const hoje = new Date()

  const diff = Math.floor((hoje.getTime() - compra.getTime()) / (1000 * 60 * 60 * 24))
  return Math.max(0, 720 - Math.max(0, diff))
}

function calcularMarcacaoMercado(valor: number, taxaContratada: number, taxaAtual: number, durationAnos: number) {
  const delta = (taxaContratada - taxaAtual) / 100
  const variacaoPercentual = durationAnos * delta
  return valor * variacaoPercentual
}

function calcularMediaPonderadaTaxa(lotes: LoteTesouroForm[]) {
  const total = lotes.reduce((sum, lote) => sum + lote.valorInvestido, 0)
  if (total <= 0) return 0
  return lotes.reduce((sum, lote) => sum + (lote.taxaContratada * lote.valorInvestido), 0) / total
}

function calcularDataMediaPonderada(lotes: LoteTesouroForm[]) {
  const total = lotes.reduce((sum, lote) => sum + lote.valorInvestido, 0)
  if (total <= 0) return ''

  const mediaEpoch = lotes.reduce((sum, lote) => {
    const epoch = new Date(lote.dataCompra).getTime()
    return sum + (epoch * lote.valorInvestido)
  }, 0) / total

  return new Date(mediaEpoch).toISOString().slice(0, 10)
}

function decidirVenda(mediaTaxaContratada: number, taxaAtual: number, diasParaMenorIr: number) {
  if (taxaAtual < mediaTaxaContratada && diasParaMenorIr <= 60) {
    return {
      recomendacaoCurta: 'vender' as const,
      texto: 'Taxa de mercado caiu e falta pouco para menor IR. Janela favorável para venda antecipada.'
    }
  }

  return {
    recomendacaoCurta: 'manter' as const,
    texto: 'Manter posição por enquanto. Reavaliar após mudança de taxa de mercado ou aproximação do IR mínimo.'
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

  const aliquotaIr = useMemo(() => calcularAliquotaIr(prazoDias), [prazoDias])
  const cdbEquivalente = useMemo(() => calcularCdbEquivalente(taxaLciLca, aliquotaIr), [taxaLciLca, aliquotaIr])

  const lotesTesouroForm = useMemo<LoteTesouroForm[]>(() => (
    tesouroRegistros.map((r) => ({
      dataCompra: r.dataCompra,
      valorInvestido: r.valorInvestido,
      taxaContratada: r.taxaContratada
    }))
  ), [tesouroRegistros])

  const totalInvestidoTesouro = useMemo(
    () => lotesTesouroForm.reduce((sum, l) => sum + l.valorInvestido, 0),
    [lotesTesouroForm]
  )

  const taxaMediaTesouro = useMemo(
    () => calcularMediaPonderadaTaxa(lotesTesouroForm),
    [lotesTesouroForm]
  )

  const dataMediaTesouro = useMemo(
    () => calcularDataMediaPonderada(lotesTesouroForm),
    [lotesTesouroForm]
  )

  const diasMediosParaMenorIr = useMemo(() => {
    if (tesouroRegistros.length === 0) return 0
    const total = tesouroRegistros.reduce((sum, l) => sum + l.valorInvestido, 0)
    if (total <= 0) return 0
    const ponderado = tesouroRegistros.reduce((sum, l) => sum + (l.diasParaMenorIr * l.valorInvestido), 0)
    return Math.round(ponderado / total)
  }, [tesouroRegistros])

  const mtmEstimado = useMemo(
    () => calcularMarcacaoMercado(totalInvestidoTesouro, taxaMediaTesouro, taxaAtualTesouro, durationAnos),
    [totalInvestidoTesouro, taxaMediaTesouro, taxaAtualTesouro, durationAnos]
  )

  const decisaoTesouro = useMemo(
    () => decidirVenda(taxaMediaTesouro, taxaAtualTesouro, diasMediosParaMenorIr),
    [taxaMediaTesouro, taxaAtualTesouro, diasMediosParaMenorIr]
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

    const diasParaMenorIr = calcularDiasParaMenorIr(novoLoteDataCompra)

    const lotesComNovo = [
      ...lotesTesouroForm,
      {
        dataCompra: novoLoteDataCompra,
        valorInvestido: novoLoteValor,
        taxaContratada: novoLoteTaxa
      }
    ]

    const taxaMediaComNovo = calcularMediaPonderadaTaxa(lotesComNovo)
    const dataMediaComNovo = calcularDataMediaPonderada(lotesComNovo)
    const totalComNovo = lotesComNovo.reduce((sum, l) => sum + l.valorInvestido, 0)
    const diasMediosComNovo = Math.round(
      ([...tesouroRegistros, {
        id: 'temp',
        criadoEm: new Date().toISOString(),
        dataCompra: novoLoteDataCompra,
        valorInvestido: novoLoteValor,
        taxaContratada: novoLoteTaxa,
        taxaAtual: taxaAtualTesouro,
        diasParaMenorIr,
        sinal: 'manter' as const,
        analise: ''
      }] as RegistroTesouroIpca[])
        .reduce((sum, l) => sum + (l.diasParaMenorIr * l.valorInvestido), 0) / totalComNovo
    )

    const decisao = decidirVenda(taxaMediaComNovo, taxaAtualTesouro, diasMediosComNovo)

    const novoRegistro: RegistroTesouroIpca = {
      id: crypto.randomUUID(),
      criadoEm: new Date().toISOString(),
      dataCompra: novoLoteDataCompra,
      valorInvestido: novoLoteValor,
      taxaContratada: novoLoteTaxa,
      taxaAtual: taxaAtualTesouro,
      diasParaMenorIr,
      sinal: decisao.recomendacaoCurta,
      analise: `Média compra: ${dataMediaComNovo} | Taxa média: ${taxaMediaComNovo.toFixed(2)}% | ${decisao.texto}`
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
      pushNotification('success', 'Registro excluído', 'Item removido com sucesso da financeiro-db.')
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
      pushNotification('success', 'Lote excluído', 'Lote removido com sucesso da financeiro-db.')
    } catch (error) {
      pushNotification('error', 'Falha na exclusão', error instanceof Error ? error.message : 'Erro ao excluir lote.')
    } finally {
      setLoading(false)
      setDeleteModalId(null)
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
        <p className="chip">Oráculo Financeiro</p>
        <div className="hero-status-row">
          <span className={`status-tag ${connectionStatus}`}>
            {connectionStatus === 'online' ? 'Online' : connectionStatus === 'offline' ? 'Offline' : 'Verificando'}
          </span>
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
              Prazo (Dias)
              <input type="number" min={1} value={prazoDias} onChange={(e) => setPrazoDias(Number(e.target.value))} />
            </label>

            <label>
              Taxa da LCI/LCA (% do CDI)
              <input type="number" min={1} value={taxaLciLca} onChange={(e) => setTaxaLciLca(Number(e.target.value))} />
            </label>

            <label>
              Aporte (R$)
              <input type="number" min={0} value={aporte} onChange={(e) => setAporte(Number(e.target.value))} />
            </label>
          </div>

          <article className="result">
            <h3>Resultado de Equivalência</h3>
            <p>Alíquota de IR do CDB no prazo: <strong>{aliquotaIr.toFixed(1)}%</strong></p>
            <p>CDB equivalente para igualar a LCI/LCA: <strong>{cdbEquivalente.toFixed(2)}% do CDI</strong></p>
          </article>

          <div className="actions">
            <button onClick={handleSalvarLciLca} type="button">Salvar DB</button>
            <button onClick={() => void carregarRegistros()} type="button" className="ghost">Recarregar do D1</button>
          </div>

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
                    <span>Prazo: {registro.prazoDias}d</span>
                    <span>LCI/LCA: {registro.taxaLciLca}% CDI</span>
                    <span>Aporte: R$ {registro.aporte.toFixed(2)}</span>
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
              Duration média estimada (anos)
              <input type="number" min={1} step={0.1} value={durationAnos} onChange={(e) => setDurationAnos(Number(e.target.value))} />
            </label>
          </div>

          <article className="result">
            <h3>Resumo da Carteira de Lotes</h3>
            <p>Total investido: <strong>R$ {totalInvestidoTesouro.toFixed(2)}</strong></p>
            <p>Taxa média contratada (ponderada): <strong>{taxaMediaTesouro.toFixed(2)}% a.a.</strong></p>
            <p>Data média de compra (ponderada): <strong>{dataMediaTesouro || '—'}</strong></p>
            <p>Marcação a mercado estimada: <strong>R$ {mtmEstimado.toFixed(2)}</strong></p>
            <p>Dias médios para menor IR (15%): <strong>{diasMediosParaMenorIr}</strong></p>
            <p>
              Sinal atual: <strong>{decisaoTesouro.recomendacaoCurta.toUpperCase()}</strong> — {decisaoTesouro.texto}
            </p>
          </article>

          <h3>Novo Lote</h3>

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
              Taxa contratada (% a.a.)
              <input type="number" min={0.01} step={0.01} value={novoLoteTaxa} onChange={(e) => setNovoLoteTaxa(Number(e.target.value))} />
            </label>
          </div>

          <div className="actions">
            <button onClick={handleSalvarLoteTesouro} type="button">Salvar lote no D1</button>
            <button onClick={() => void carregarRegistros()} type="button" className="ghost">Recarregar do D1</button>
          </div>

          <div className="records">
            {tesouroRegistros.length === 0 ? (
              <p>Nenhum lote registrado ainda.</p>
            ) : (
              <ul>
                {tesouroRegistros.map((registro) => (
                  <li key={registro.id}>
                    <span>{new Date(registro.criadoEm).toLocaleString('pt-BR')}</span>
                    <span>Compra: {registro.dataCompra}</span>
                    <span>Valor: R$ {registro.valorInvestido.toFixed(2)}</span>
                    <span>Taxa comprada: {registro.taxaContratada.toFixed(2)}% | Taxa atual: {registro.taxaAtual.toFixed(2)}%</span>
                    <span className={`risk ${registro.sinal}`}>Sinal: {registro.sinal}</span>
                    <strong>{registro.analise}</strong>
                  </li>
                ))}
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
            <p>Essa ação remove o item da base financeiro-db e não pode ser desfeita.</p>
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
