# Regras de Desenvolvimento — Apps CTV Campo

## Regra de Integridade de Dados (CRÍTICA)
Toda atualização, correção ou nova funcionalidade deve garantir que:
1. **Dados existentes nunca sejam perdidos** — alterações no fluxo de boot, sincronização ou persistência devem preservar dados já salvos (localStorage, Firestore, IndexedDB).
2. **Fallback de local para nuvem deve sincronizar** — se o app operar em modo local (sem Firebase), dados salvos localmente devem ser enviados ao Firestore quando a conexão for restabelecida.
3. **Testar cenários de sinal fraco** — verificar que o app funciona corretamente com timeout de Firebase, transição local→cloud e vice-versa.
4. **Nunca sobrescrever dados mais recentes** — o snapshot listener do Firestore não deve apagar dados locais não sincronizados.

## Arquitetura dos Apps
- Apps single-file HTML com CSS/JS inline, mobile-first, pt-BR
- Firebase: projeto `rdo-benetech` (Firestore + Email/Password Auth)
- Padrão boot: `bootLocal()` sempre primeiro (dados imediatos do cache), `upgradeToCloud()` em background quando Firebase carrega
- IndexedDB para fotos: subcollection `{collection}/{id}/fotos/{fotoId}`
- Service Worker: `CACHE_VERSION` deve ser incrementado a cada deploy

## Padrão de Boot Seguro
Todos os 6 apps seguem o padrão:
1. `bootLocal()` executa sempre e imediatamente (carrega dados do localStorage)
2. Firebase SDK carrega em background sem timeout agressivo
3. `upgradeToCloud(api)` faz transição segura: empurra dados locais pendentes (`*_local_dirty`) para Firestore antes de iniciar listeners
4. Flag `localReady` garante que o upgrade só ocorre após dados locais estarem carregados

## Apps
- `rdo_ctv.html` — RDO (Relatório Diário de Obra)
- `registro_emenda_ctv.html` — Registro de Emendas
- `registro_revestimento_ctv.html` — Registro de Revestimento
- `registro_placa_ctv.html` — Registro de Placas (Firebase desabilitado)
- `cronograma_ctv.html` — Cronograma
- `registo_horarios_ctv.html` — Registro de Horários

## Regra de Deploy Seguro (CRÍTICA)
Problema ocorrido: código foi perdido porque a branch foi resetada para main antes de confirmar que TODAS as alterações estavam incluídas no PR mergeado. O PR #103 foi mergeado com apenas 2 dos 3 arquivos modificados, e o reset apagou as mudanças do terceiro arquivo.

**Regras para evitar recorrência:**
1. **Antes de fazer merge de um PR**, sempre verificar o diff do PR e confirmar que TODOS os arquivos modificados localmente estão incluídos. Usar `git diff main...HEAD --stat` para listar os arquivos.
2. **Nunca resetar a branch para main** até confirmar que o merge do PR contém todas as alterações pendentes.
3. **Se houver múltiplas features na mesma branch**, criar PRs separados ou garantir que todas estejam no mesmo commit antes do PR.
4. **Após o merge**, verificar o resultado do squash-merge no GitHub (número de arquivos alterados) antes de resetar a branch.

## Mecanismo de Auto-Update Agressivo
Todos os apps usam `app-update.js` + `service-worker.js` com:
- `updateViaCache: 'none'` no registro do SW
- Listener `SKIP_WAITING` no SW para ativação imediata
- Checagem a cada 30s (`setInterval`), ao voltar ao foreground (`visibilitychange`), e quando a rede volta (`online`)
- `updatefound` + `statechange` para detectar e ativar SW em espera
- Proteção de formulários abertos (`editando()`) antes de recarregar
- **`CACHE_VERSION` deve ser incrementado a cada deploy** no `service-worker.js`

Ao criar ou modificar qualquer app, garantir que ele inclui `<script src="app-update.js"></script>` e que o `service-worker.js` lista o arquivo do app no `APP_SHELL`.

## Cores da Marca
- Navy: `#001a33`
- Blue accent: `#43a6ea`
