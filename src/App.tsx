import { useEffect, useMemo, useState } from 'react'
import './App.css'

type TabId = 'lci-cdb' | 'auditoria-ia'

type RegistroBase = {
  id: string
  criadoEm: string
}

type RegistroLciCdb = RegistroBase & {
  prazoDias: number
  taxaCdi: number
  aporte: number
  rendimentoBruto: number
}

type RegistroAuditoria = RegistroBase & {
  observacao: string
  risco: 'baixo' | 'medio' | 'alto'
  recomendacao: string
}

type NotificationTone = 'success' | 'info' | 'warning' | 'error'

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

async function parseApiError(response: Response) {
  try {
    const payload = await response.json() as { error?: string }
    return payload.error ?? `HTTP ${response.status}`
  } catch {
    return `HTTP ${response.status}`
  }
}

function calcularRendimentoBruto(aporte: number, taxaCdi: number, prazoDias: number) {
  const taxaAnual = (taxaCdi / 100) * 0.1325
  const periodo = prazoDias / 365
  return aporte * taxaAnual * periodo
}

function gerarAuditoria(valor: number, prazoDias: number): Pick<RegistroAuditoria, 'risco' | 'recomendacao'> {
  if (valor >= 50000 || prazoDias >= 720) {
    return {
      risco: 'alto',
      recomendacao: 'Alta exposição/tempo longo. Revisar liquidez e concentração antes de confirmar.'
    }
  }

  if (valor >= 15000 || prazoDias >= 365) {
    return {
      risco: 'medio',
      recomendacao: 'Perfil intermediário. Avaliar alocação em mais de um vencimento para reduzir risco.'
    }
  }

  return {
    risco: 'baixo',
    recomendacao: 'Perfil conservador para o cenário informado. Manter acompanhamento periódico.'
  }
}

function App() {
  const [activeTab, setActiveTab] = useState<TabId>('lci-cdb')
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedRegistroId, setSelectedRegistroId] = useState<string | null>(null)
  const [deleteModalId, setDeleteModalId] = useState<string | null>(null)

  const [prazoDias, setPrazoDias] = useState(365)
  const [taxaCdi, setTaxaCdi] = useState(100)
  const [aporte, setAporte] = useState(10000)

  const [lciRegistros, setLciRegistros] = useState<RegistroLciCdb[]>([])
  const [auditoriaRegistros, setAuditoriaRegistros] = useState<RegistroAuditoria[]>([])
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [page, setPage] = useState(1)
  const [pageSize] = useState(25)
  const [totalRegistros, setTotalRegistros] = useState(0)

  const rendimentoBruto = useMemo(
    () => calcularRendimentoBruto(aporte, taxaCdi, prazoDias),
    [aporte, taxaCdi, prazoDias]
  )

  const registrosFiltrados = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    if (!term) {
      return lciRegistros
    }

    return lciRegistros.filter((registro) => {
      const dataHora = new Date(registro.criadoEm).toLocaleString('pt-BR').toLowerCase()
      return (
        dataHora.includes(term)
        || String(registro.prazoDias).includes(term)
        || String(registro.taxaCdi).includes(term)
        || String(registro.aporte).includes(term)
      )
    })
  }, [lciRegistros, searchTerm])

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
      const [lciResponse, auditoriaResponse] = await Promise.all([
        fetch(`/api/registros-lci-cdb?limit=${pageSize}&offset=${offset}`),
        fetch('/api/auditorias-ia')
      ])

      if (!lciResponse.ok) {
        throw new Error(`Falha ao carregar LCI/CDB: ${await parseApiError(lciResponse)}`)
      }

      if (!auditoriaResponse.ok) {
        throw new Error(`Falha ao carregar auditorias: ${await parseApiError(auditoriaResponse)}`)
      }

      const lciPayload = await lciResponse.json() as ApiListResponse<RegistroLciCdb>
      const auditoriaPayload = await auditoriaResponse.json() as ApiListResponse<RegistroAuditoria>

      setLciRegistros(lciPayload.data)
      setAuditoriaRegistros(auditoriaPayload.data)
      setTotalRegistros(Number(lciPayload.total ?? lciPayload.data.length))
      setPage(targetPage)

      pushNotification('success', 'D1 conectado', 'Registros carregados da base bigdata_db.')
    } catch (error) {
      pushNotification('error', 'Falha de conexão', error instanceof Error ? error.message : 'Erro inesperado ao carregar dados.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void carregarRegistros()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSalvarLci = async () => {
    const novoRegistro: RegistroLciCdb = {
      id: crypto.randomUUID(),
      criadoEm: new Date().toISOString(),
      prazoDias,
      taxaCdi,
      aporte,
      rendimentoBruto
    }

    if (prazoDias <= 0 || taxaCdi <= 0 || aporte <= 0) {
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

      const payload = await response.json() as ApiCreateResponse<RegistroLciCdb>
      setLciRegistros((previous) => [payload.data, ...previous].slice(0, pageSize))
      setTotalRegistros((previous) => previous + 1)
      pushNotification('success', 'Registro salvo', 'Dados gravados com sucesso no D1 bigdata_db.')
    } catch (error) {
      pushNotification('error', 'Erro ao salvar', error instanceof Error ? error.message : 'Não foi possível salvar no D1.')
    } finally {
      setLoading(false)
    }
  }

  const handleAuditarIa = async () => {
    const analise = gerarAuditoria(aporte, prazoDias)

    const novoRegistro: RegistroAuditoria = {
      id: crypto.randomUUID(),
      criadoEm: new Date().toISOString(),
      observacao: `Simulação com aporte R$ ${aporte.toFixed(2)} e prazo ${prazoDias} dias`,
      risco: analise.risco,
      recomendacao: analise.recomendacao
    }

    setLoading(true)

    try {
      const response = await fetch('/api/auditorias-ia', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(novoRegistro)
      })

      if (!response.ok) {
        throw new Error(await parseApiError(response))
      }

      const payload = await response.json() as ApiCreateResponse<RegistroAuditoria>
      setAuditoriaRegistros((previous) => [payload.data, ...previous].slice(0, 25))
      pushNotification('info', 'Auditoria gerada', `Risco classificado como ${payload.data.risco.toUpperCase()}.`)
      setActiveTab('auditoria-ia')
    } catch (error) {
      pushNotification('error', 'Erro de auditoria', error instanceof Error ? error.message : 'Falha ao gravar auditoria no D1.')
    } finally {
      setLoading(false)
    }
  }

  const handleCarregarNoFrame = (registro: RegistroLciCdb) => {
    setPrazoDias(registro.prazoDias)
    setTaxaCdi(registro.taxaCdi)
    setAporte(registro.aporte)
    setSelectedRegistroId(registro.id)
    setActiveTab('lci-cdb')
    pushNotification('info', 'Registro carregado', 'Parâmetros aplicados no frame principal.')
  }

  const handleExcluirRegistro = async (id: string) => {
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
        <h1>Oráculo Edge Analytics</h1>
        <p className="subtitle">CLOUDFLARE D1 + GEMINI LLM</p>
        <p className="legend">LCI/CDB IPCA+ com gravação direta na base D1 <strong>bigdata_db</strong>.</p>
      </header>

      <nav className="tabs" aria-label="Abas principais">
        <button
          className={activeTab === 'lci-cdb' ? 'tab active' : 'tab'}
          onClick={() => setActiveTab('lci-cdb')}
          type="button"
        >
          LCI/CDB IPCA+
        </button>
        <button
          className={activeTab === 'auditoria-ia' ? 'tab active' : 'tab'}
          onClick={() => setActiveTab('auditoria-ia')}
          type="button"
        >
          Auditoria IA
        </button>
      </nav>

      {activeTab === 'lci-cdb' && (
        <section className="panel">
          <h2>Variáveis de Entrada</h2>

          <div className="grid">
            <label>
              Prazo (Dias)
              <input type="number" min={1} value={prazoDias} onChange={(e) => setPrazoDias(Number(e.target.value))} />
            </label>

            <label>
              Taxa Isenta Ofertada (% do CDI)
              <input type="number" min={1} value={taxaCdi} onChange={(e) => setTaxaCdi(Number(e.target.value))} />
            </label>

            <label>
              Aporte (R$)
              <input type="number" min={0} value={aporte} onChange={(e) => setAporte(Number(e.target.value))} />
            </label>
          </div>

          <article className="result">
            <h3>Matemática Pura</h3>
            <p>Rendimento bruto estimado: <strong>R$ {rendimentoBruto.toFixed(2)}</strong></p>
          </article>

          <div className="actions">
            <button onClick={handleSalvarLci} type="button">Salvar DB</button>
            <button onClick={handleAuditarIa} type="button" className="secondary">Auditoria IA</button>
            <button onClick={() => void carregarRegistros()} type="button" className="ghost">Recarregar do D1</button>
          </div>

          <div className="records">
            <h3>Registros D1 (LCI/CDB)</h3>
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
                    <span>CDI: {registro.taxaCdi}%</span>
                    <span>Aporte: R$ {registro.aporte.toFixed(2)}</span>
                    <strong>Rendimento: R$ {registro.rendimentoBruto.toFixed(2)}</strong>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {activeTab === 'auditoria-ia' && (
        <section className="panel">
          <h2>Auditoria IA</h2>
          <p>Análises registradas em tempo real no D1.</p>

          <div className="actions">
            <button onClick={handleAuditarIa} type="button">Gerar nova auditoria</button>
          </div>

          <div className="records">
            {auditoriaRegistros.length === 0 ? (
              <p>Nenhuma auditoria registrada ainda.</p>
            ) : (
              <ul>
                {auditoriaRegistros.map((registro) => (
                  <li key={registro.id}>
                    <span>{new Date(registro.criadoEm).toLocaleString('pt-BR')}</span>
                    <span>{registro.observacao}</span>
                    <span className={`risk ${registro.risco}`}>Risco: {registro.risco}</span>
                    <strong>{registro.recomendacao}</strong>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      <footer className="footer-table panel">
        <h2>Registros D1 (rodapé)</h2>
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
                <th>Prazo</th>
                <th>% CDI</th>
                <th>Aporte</th>
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
                  const date = new Date(registro.criadoEm)
                  const data = date.toLocaleDateString('pt-BR')
                  const hora = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

                  return (
                    <tr
                      key={registro.id}
                      onClick={() => handleCarregarNoFrame(registro)}
                      className={selectedRegistroId === registro.id ? 'clickable-row selected-row' : 'clickable-row'}
                    >
                      <td>{data}</td>
                      <td>{hora}</td>
                      <td>{registro.prazoDias}d</td>
                      <td>{registro.taxaCdi}%</td>
                      <td>R$ {registro.aporte.toFixed(2)}</td>
                      <td>
                        <button
                          type="button"
                          className="icon-button"
                          title="Excluir registro"
                          aria-label="Excluir registro"
                          onClick={(event) => {
                            event.stopPropagation()
                            setDeleteModalId(registro.id)
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
              <button type="button" onClick={() => void handleExcluirRegistro(deleteModalId)}>Excluir</button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

export default App
