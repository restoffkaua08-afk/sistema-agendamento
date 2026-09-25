# Sistema de agendamento

Primeira fatia do produto neutro da Trindade: site público responsivo, fluxo de reserva, painel operacional inicial e base para API e aplicativo Android.

## Estrutura

- `apps/web`: site Next.js preparado para publicação na Vercel.
- `apps/api`: contrato e núcleo inicial da API Fastify.
- `apps/mobile`: casca Capacitor para o aplicativo Android conectado ao mesmo produto.
- `packages/contracts`: contratos compartilhados entre web, API e mobile.

## Desenvolvimento

```bash
npm install
npm run dev:web
```

O site abre em `http://localhost:3000`. A primeira fatia usa um adaptador local para validar o fluxo visual; a persistência PostgreSQL e o worker de notificações entram na próxima etapa antes de qualquer piloto real.

## Estado da entrega

Esta branch contém a fundação executável, não uma alegação de produto final publicado. O checklist de produção exige PostgreSQL, autenticação, isolamento de tenant, outbox de e-mail, testes de concorrência, observabilidade e build Android validado.
