CREATE TABLE IF NOT EXISTS lci_cdb_registros (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  prazo_dias INTEGER NOT NULL,
  taxa_cdi REAL NOT NULL,
  aporte REAL NOT NULL,
  rendimento_bruto REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS auditorias_ia (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  observacao TEXT NOT NULL,
  risco TEXT NOT NULL CHECK (risco IN ('baixo', 'medio', 'alto')),
  recomendacao TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lci_cdb_created_at ON lci_cdb_registros(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_created_at ON auditorias_ia(created_at DESC);
