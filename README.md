# Desafio Trauma Analytics

Dashboard público e pipeline privado para consolidar participações, aprendizagem e avaliações das apresentações **Desafio Trauma** no Mentimeter.

## Arquitetura

```text
Mentimeter ── Playwright/XLSX ──┐
                                ├─ Pipeline Python ─ Supabase privado
Feedback pós-reunião ───────────┘          │
                                           ├─ snapshot agregado público
                                           ├─ XLSX público agregado
                                           └─ XLSX completo privado

Supabase RPC ── React/Vite ── GitHub Pages
```

- O GitHub Actions executa o sincronismo incremental toda quinta-feira às 07:00 em `America/Belem` e também sob demanda.
- O Supabase mantém respostas, comentários e arquivos originais em área privada com RLS.
- O frontend consulta somente `get_public_dashboard_snapshot()`.
- Recortes públicos com menos de cinco observações são suprimidos.
- Se uma extração falhar, o último snapshot válido continua publicado.

## Desenvolvimento local

Requisitos: Node.js 22+, Python 3.12+ e Chromium do Playwright.

```bash
npm ci
npm run dev
```

O dashboard não inventa dados quando o Supabase não está configurado. Para a fixture visual explícita de desenvolvimento:

```bash
VITE_USE_DEMO_DATA=true npm run dev
```

Pipeline:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r pipeline/requirements.txt
python -m playwright install chromium
python -m pipeline sync --mode incremental --dry-run
```

Comandos aceitos:

```bash
python -m pipeline sync --mode backfill
python -m pipeline sync --mode incremental
python -m pipeline sync --mode manual
python -m pipeline sync --mode incremental --presentation-id ID
python -m pipeline sync --mode incremental --force-reclassify
```

## Configuração

Use `.env.example` como referência e mantenha valores reais apenas em arquivos ignorados ou em secrets.
O comando local carrega `.env.local` e depois `.env`, sem sobrescrever variáveis já exportadas no ambiente.

Frontend:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_USE_DEMO_DATA=false`
- `VITE_OPENAI_MONTHLY_BUDGET_USD=5`

Pipeline privado:

- `MENTIMETER_EMAIL`
- `MENTIMETER_PASSWORD`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `OPENAI_MODEL=gpt-5.6-luna`
- `OPENAI_MONTHLY_BUDGET_USD=5`
- `OPENAI_BUDGET_WARNING_PERCENT=70`
- `OPENAI_INPUT_USD_PER_M=1.00`
- `OPENAI_CACHED_INPUT_USD_PER_M=0.10`
- `OPENAI_OUTPUT_USD_PER_M=6.00`

Nunca use uma chave `service_role` ou `OPENAI_API_KEY` em variável prefixada por `VITE_`.

## Supabase

Aplicar as migrations e implantar a função administrativa:

```bash
supabase db push
supabase functions deploy dispatch-ingestion
supabase secrets set GITHUB_REPOSITORY=Maverick591/desafiotrauma
supabase secrets set GITHUB_WORKFLOW_FILE=mentimeter-sync.yml
supabase secrets set GITHUB_WORKFLOW_REF=main
supabase secrets set GITHUB_WORKFLOW_TOKEN=SEU_TOKEN_RESTRITO
```

Como o login usa `shouldCreateUser=false`, crie ou convide primeiro o usuário em **Authentication → Users** no painel do Supabase. Depois cadastre o mesmo e-mail, em minúsculas, na allowlist pelo SQL Editor:

```sql
insert into public.admin_users (email, active)
values ('administrador@exemplo.com', true)
on conflict (email) do update set active = excluded.active;
```

O token do GitHub usado pela Edge Function deve ter somente permissão para disparar Actions no repositório alvo.

Na contingência manual, a área `/admin` exige o XLSX oficial, o ID externo, o título e a data do encontro. O upload cria uma entrada pendente e dispara o workflow em modo `manual`.

## GitHub Actions

Cadastre estes secrets no repositório:

- `MENTIMETER_EMAIL`
- `MENTIMETER_PASSWORD`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

O workflow `Mentimeter sync` aceita backfill, incremental, importação manual, apresentação específica, reclassificação e dry-run. O workflow `Deploy dashboard` executa os testes, gera o build e publica no GitHub Pages.

## Privacidade e custo

- Identificadores de participantes são pseudonimizados e não são correlacionados entre encontros.
- Nenhum nome, e-mail, comentário bruto ou resposta individual integra o snapshot público.
- A fronteira da IA usa minimização fail-closed: somente vocabulário funcional e clínico controlado é enviado; nomes e tokens desconhecidos viram marcadores locais.
- Comentários permanecem fora da API até terem versão anonimizada e aprovação administrativa.
- Classificações com confiança inferior a `0.80` entram na fila administrativa.
- O orçamento padrão da IA é `US$ 5/mês`; ao atingir o limite, a ingestão continua e os itens ficam como `pending_budget`.
- Tokens e custo estimado são registrados por execução.
- Os filtros públicos usam recortes pré-calculados e verificados uma dimensão por vez; combinações não publicadas nunca reutilizam silenciosamente o total global.

Estimativa da API com as tarifas configuradas de US$ 1,00/M tokens de entrada, US$ 0,10/M em cache e US$ 6,00/M de saída:

| Cenário | Estimado | Com margem de 25% |
|---|---:|---:|
| Backfill de 342 questões | US$ 0,64 | US$ 0,81 |
| 342 questões + 500 comentários anonimizados | US$ 1,15 | US$ 1,45 |
| 342 questões + 2.000 comentários anonimizados | US$ 2,68 | US$ 3,36 |
| Nova apresentação com 8 questões e 30 comentários | US$ 0,05 | US$ 0,06 |
| Quatro novas apresentações por mês | US$ 0,18 | US$ 0,23 |

O custo real é calculado pelos tokens devolvidos pela API, incluindo entrada em cache, e pode variar com câmbio, impostos e volume. Mentimeter, Supabase e GitHub Actions não estão incluídos.

## Verificação

```bash
python -m pytest tests/pipeline -q
npm test
npm run build
```

O caso de referência de 27/05/2026 deve reconciliar:

- participação: `208 / 245 = 84,9%`;
- adesão à avaliação: `9 / 35 = 25,7%`;
- acurácia acadêmica: `142 / 166 = 85,5%`.

## Autoria

Dr. Jocielle Miranda — Developer novas tecnologias aplicadas à medicina.

© ano atual Dr. Jocielle Miranda. Todos os direitos reservados.
