# Status de entrega — Agenda

## Entregue nesta rodada

- Site Next.js com identidade neutra e responsiva.
- Fluxo público de serviço, profissional, horário, dados e confirmação.
- API Fastify com PostgreSQL/Drizzle, tenant, serviços, profissionais, clientes e agendamentos.
- Proteção contra dupla reserva no banco com exclusão de intervalos e `Idempotency-Key`.
- Autenticação de proprietário por sessão assinada, painel protegido e atualização de status.
- Eventos de agendamento, auditoria e fila de notificações persistidos para processamento posterior.
- Migração inicial e migração segura de avanço para instalações já existentes.
- Entrada Vercel da API separada do site e contrato versionado `1.0.0`.
- Agenda pública derivando horários por jornada, duração do serviço e agendamentos ocupados.
- Painel protegido de agenda para a equipe.
- Manifesto e service worker iniciais para a experiência PWA.
- Base Capacitor para empacotar o mesmo produto em Android.
- Documentação de arquitetura segura, Supabase/Vercel, operação e plano comercial.

## Verificações executadas

- TypeScript da API: passou.
- Build de produção do site: passou nesta rodada, incluindo checagem de tipos do Next.js.
- Testes da API: 14 passaram (autenticação/perfis, disponibilidade e fuso/DST, CORS, rotas Vercel, limites de agenda e rate limit).
- Autorização do painel agora verifica o papel atual na associação do banco; proprietário e gerente podem gerir, recepção não.
- Agenda converte horários locais pelo fuso do estabelecimento, inclusive transições de horário de verão.
- CORS permite `Authorization` e `PATCH`, necessários para o painel.
- Painel permite escolher a data, atualizar manualmente e renovar dados periodicamente.
- API Vercel agora reescreve `/v1/*` para a função e recupera o caminho original antes de encaminhar ao Fastify.
- Slug e nome do tenant no site/painel são configuráveis por `NEXT_PUBLIC_TENANT_SLUG` e `NEXT_PUBLIC_TENANT_NAME`, evitando o slug fixo `marca` em cada implantação.
- A consulta de agenda diária filtra por intervalo no banco, em vez de carregar todo o histórico; os limites de dia são calculados no fuso do estabelecimento.
- A disponibilidade do site considera `bufferMinutes`, como a API.
- Em produção/Vercel, o fallback de reservas em memória está desativado; sem API configurada, a rota retorna `503` antes de processar a reserva.
- Sem API configurada em produção, a tela não exibe catálogo/horários demonstrativos; tentativas repetidas com os mesmos dados reutilizam `Idempotency-Key` e erros de limite, backend e horário são apresentados separadamente.
- A confirmação deixou de afirmar que um e-mail foi enviado; envio real por e-mail/push continua pendente.
- Diário Drizzle adicionado e validado como JSON; a configuração exige `DATABASE_URL` e falha claramente se estiver ausente. A migração não foi aplicada porque não há banco configurado neste ambiente.
- Workflow GitHub Actions versionado para typecheck, testes da API e build web em PRs/pushes; despacho manual separado pode gerar APK debug somente a partir de URL HTTPS informada. Esse APK não é assinatura de produção.
- `git diff --check`: passou; apenas avisos de conversão de fim de linha do Git.

## Ainda não comprovado para publicação comercial

- Migração/bootstrap contra um projeto Supabase real.
- Deploy e variáveis secretas configuradas na Vercel; a reescrita foi validada por teste unitário, não por um deploy real.
- Teste concorrente real contra PostgreSQL remoto.
- Push Android com aplicativo fechado; a fila existe, mas worker/FCM ainda não foi conectado.
- APK/AAB assinado e instalado em aparelho real; o ambiente atual não possui Java/Android SDK.
- Primeira execução verde do workflow de qualidade e primeiro APK debug compilado no CI; não há Actions run validado após adicionar o workflow.
- Backup/restauração, observabilidade e teste de carga.

## Regra de verdade

Esta entrega é uma fundação executável e verificável. A publicação comercial deve esperar os itens da seção anterior, principalmente Supabase real, Vercel real, APK assinado e teste de reserva concorrente.

O endpoint em memória de `apps/web/app/api/public/[slug]/appointments/route.ts` é somente fallback de desenvolvimento; produção deve apontar `NEXT_PUBLIC_API_URL` para a API persistente e responde `503` se isso não estiver configurado.

## Estimativa de prontidão comercial — 2026-10-03

**Estimativa geral: aproximadamente 45% pronto para vender e operar.** É uma avaliação de prontidão ponta a ponta, não uma medida da quantidade de código escrito. O núcleo do site, painel e API está bem encaminhado, mas ainda faltam integrações e provas de operação real.

- Site e fluxo público de reserva: ~70% — fluxo implementado, mas a revisão visual ainda encontrou conteúdo demonstrativo como “Marca” e “Serviço 1/2/3”; faltam os dados reais do estabelecimento e testes integrados em produção.
- Painel e API: ~60% — autenticação, gestão de agenda e persistência estão no código; limite persistente foi implementado, mas precisa ser validado contra PostgreSQL/Supabase real.
- App Android e notificações: ~20% — existe a base Capacitor, mas não há envio FCM ligado à fila nem APK assinado e testado em aparelho.
- Publicação e operação: ~10% — configuração e documentação para Vercel/Supabase existem, mas não houve deploy real, teste concorrente remoto, monitoramento ou ensaio de backup/restauração.
- Materialização para cada cliente: pendente — configurar identidade, catálogo, horários, contato, políticas e credenciais reais antes de vender cada implantação.

O percentual só deve subir após evidência verificável dos itens pendentes. Próximo: validar a execução do workflow, aplicar e testar a migração contra PostgreSQL/Supabase reais, depois validar Vercel/Supabase e concluir push + APK assinado.
