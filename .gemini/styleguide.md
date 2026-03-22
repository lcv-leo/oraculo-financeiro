# Diretivas de Projeto — LCV Apps

## Protocolo Universal de Engenharia e Gestão Modular

Diretrizes inegociáveis para todo projeto de TI e Engenharia:

### 1. Exibição e Formato
- **EXIBIÇÃO**: Obrigatória e exclusivamente em blocos de Markdown padrão no corpo da mensagem.
- **PROIBIÇÃO**: Estritamente proibido o uso de Canvas, abas de código, artefatos ou interfaces ocultas.
- **IDIOMA**: Português (Brasil). Comentários de código em português, exceto sintaxe reservada.

### 2. Rigor Técnico e Verdade
- **STACK**: Use as últimas versões estáveis (Ex: Vite 7+, Wrangler 4+, npm 11+, React 18+). Consulte docs oficiais.
- **COMPLETUDE**: Forneça passo-a-passo total (build, deploy, config) para funcionamento imediato.
- **POSTURA**: 100% técnico e objetivo. NUNCA misture tecnologia com psicologia, filosofia ou espiritualidade.

### 3. Preservação Funcional e Anti-Regressão (DIRETRIZ MÁXIMA)
- **EVOLUÇÃO CUMULATIVA**: O versionamento dinâmico exige evolução cumulativa. É estritamente proibido regredir, simplificar ou descartar código funcional, lógica de negócio, máscaras de input, validações, integrações ou dados de estado que já estejam operando corretamente em versões anteriores.
- **ENVELOPAMENTO, NÃO SUBSTITUIÇÃO**: Ao receber ordens para aplicar novos padrões visuais (ex: Glassmorphism, Material Design), refatorações estruturais ou conceitos globais a um módulo, a IA deve OBRIGATORIAMENTE adaptar o novo código para "envelopar" e acomodar a lógica existente. O design deve servir à funcionalidade, nunca o contrário.
- **PROIBIÇÃO DE EXCLUSÃO SILENCIOSA**: Nenhuma funcionalidade ou inteligência prévia pode ser removida do código de forma silenciosa ou presumida.
- **PROTOCOLO DE EXCEÇÃO (CONFLITO INTRANSPONÍVEL)**: A única exceção admitida para a regressão de código ocorre quando é tecnicamente impossível aplicar a nova solicitação sem quebrar a lógica anterior. Nestes casos raros, a IA deve PARAR imediatamente, explicar o conflito arquitetural de forma técnica e objetiva, e solicitar a autorização explícita do consulente para decidir qual caminho seguir.

---

## Mensagens de Commit (OBRIGATÓRIO)
Ao gerar mensagens de commit, SEMPRE use o formato:
```
chore(versao): APP vXX.XX.XX, <resumo das alterações>
```
Para commits sem mudança de versão:
```
fix(<escopo>): <descrição curta>
feat(<escopo>): <descrição curta>
refactor(<escopo>): <descrição curta>
```
A mensagem DEVE ser em português, sem acentos, descrevendo o que foi feito.

---

## Controle de Versão (OBRIGATÓRIO)

Todas as modificações em qualquer app — por menores que sejam — DEVEM atualizar o sistema de versão.

### Formato
- Versão: `APP v00.00.00` (major.minor.patch com 2 dígitos + zero à esquerda)
- Incremento: **Patch** = correções/ajustes menores | **Minor** = funcionalidades novas | **Major** = breaking changes

### Variável APP_VERSION
Cada frontend tem uma constante no topo do arquivo principal:
```js
const APP_VERSION = 'APP v00.00.00';
```
Esta é a ÚNICA linha alterada ao atualizar versão. Todos os locais que exibem versão DEVEM referenciar `APP_VERSION`.

### Cabeçalho de Código
Todo arquivo principal (frontend e backend) DEVE conter:
```
// Módulo: path-do-app/arquivo.ext
// Versão: v00.00.00
// Descrição: Breve descrição do módulo.
```

### Exibição no Rodapé
Todo frontend exibe a versão no footer via `APP_VERSION`. Não duplicar o prefixo "APP" — a variável já o contém.

### CHANGELOG.md
Cada app possui `CHANGELOG.md` na pasta raiz. Toda alteração DEVE adicionar uma entrada:
```markdown
## [v00.00.00] — AAAA-MM-DD
### Adicionado / Alterado / Corrigido / Removido
- Descrição da mudança
```

### Novos Apps
Devem nascer com: `APP_VERSION`, cabeçalho de código, footer com versão, e `CHANGELOG.md` inicial.
