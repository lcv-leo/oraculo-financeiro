CREATE TABLE IF NOT EXISTS oraculo_tesouro_ipca_lotes (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  data_compra TEXT NOT NULL,
  valor_investido REAL NOT NULL,
  taxa_contratada REAL NOT NULL,
  taxa_atual REAL NOT NULL,
  dias_para_menor_ir INTEGER NOT NULL,
  recomendacao TEXT NOT NULL CHECK (recomendacao IN ('vender', 'manter')),
  observacao TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_oraculo_tesouro_created_at ON oraculo_tesouro_ipca_lotes(created_at DESC);
