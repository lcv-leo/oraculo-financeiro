CREATE TABLE IF NOT EXISTS oraculo_lci_cdb_registros (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  prazo_dias INTEGER NOT NULL,
  taxa_cdi REAL NOT NULL,
  aporte REAL NOT NULL,
  rendimento_bruto REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS oraculo_auditorias_ia (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  observacao TEXT NOT NULL,
  risco TEXT NOT NULL CHECK (risco IN ('baixo', 'medio', 'alto')),
  recomendacao TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_oraculo_lci_cdb_created_at ON oraculo_lci_cdb_registros(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oraculo_auditoria_created_at ON oraculo_auditorias_ia(created_at DESC);
