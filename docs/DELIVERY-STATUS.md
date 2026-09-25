# Status de entrega — Agenda

## Entregue nesta fatia

- Site Next.js com identidade neutra e responsiva.
- Fluxo público de serviço, profissional, horário, dados e confirmação.
- API local de demonstração com validação, conflito de horário e `Idempotency-Key`.
- Painel inicial de leitura para a equipe.
- Manifesto e service worker iniciais para a experiência PWA.
- Base Capacitor para empacotar o mesmo produto em Android.

## Ainda bloqueia publicação comercial

- PostgreSQL/Drizzle e migrações reais.
- Autenticação, sessões, memberships e autorização por tenant.
- Disponibilidade baseada em escala, folgas e fuso do tenant.
- Token seguro de consulta/cancelamento.
- Outbox, worker e Resend.
- Auditoria, rate limit, logs redigidos, backup/restauração e observabilidade.
- Testes unitários, integração, concorrência e Playwright mobile/desktop.
- Tela de configuração do app e APK/AAB assinado em aparelho real.

## Regra de verdade

Esta entrega é uma fundação executável e verificável. Ela não deve ser anunciada como produto comercial fechado até que os itens acima passem pelo checklist de aceite documentado em `projeto-trindade/agenda/06-seguranca-testes-aceite.md`.
