# Status de entrega — Agenda

## Entregue nesta fatia de desenvolvimento

- Site público responsivo no repositório `site_barbearia`, com fluxo de catálogo, profissional, data, disponibilidade e solicitação.
- API Fastify com endpoints públicos de catálogo, disponibilidade e criação de agendamento integrados a funções PostgreSQL/Supabase.
- Migrações iniciais para tenants, serviços, profissionais, vínculos, horários e agendamentos com isolamento por `tenant_id` e RLS habilitado.
- RPC transacional de agendamento com validação de tenant/serviço/profissional/horário, bloqueio de concorrência por profissional e chave de idempotência.
- Proxy do site público atualizado para encaminhar a data escolhida ao endpoint de disponibilidade.
- Configuração documentada para manter a chave privilegiada do banco exclusivamente no servidor.

## Ainda bloqueia publicação comercial

- Nenhum projeto Supabase apareceu na conexão disponível nesta sessão; as migrações ainda não foram aplicadas nem verificadas contra banco real.
- Fluxo de cadastro/login, sessões e autorização de membros por tenant.
- Endpoints `/v1/mobile/pair` e `/v1/owner/*` exigidos pelo aplicativo Android.
- Painel web da empresa ligado a dados persistidos (o painel atual ainda contém dados de demonstração).
- Fluxos seguros de confirmação, cancelamento e remarcação acessíveis à equipe.
- Configuração de empresa/serviços/profissionais/horários e cadastro inicial de tenant.
- Assinaturas mensais/anuais, cobrança e processamento idempotente de webhooks.
- Domínios próprios por empresa com verificação e HTTPS.
- Rate limiting persistente, auditoria, logs redigidos, backup/restauração, observabilidade e notificações.
- Testes automatizados de integração, concorrência, isolamento entre tenants e fluxos mobile/web.
- APK/AAB assinado e teste em dispositivo Android real.

## Regra de verdade

A API pública e as migrações são uma primeira fatia de implementação, não um SaaS comercial concluído. Não anunciar nem cobrar pelo produto antes de aplicar e verificar as migrações, fechar autenticação/isolamento por tenant, implementar as rotas de gestão esperadas pelo app e executar os testes de aceite. Consulte `apps/api/README.md` para configuração e limitações atuais.
