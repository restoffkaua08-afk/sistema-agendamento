# Sistema de agendamento

Produto neutro da Trindade: site público responsivo, fluxo de reserva, API persistente, painel operacional autenticado e aplicativo Android Capacitor.

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

O site abre em `http://localhost:3000`. Para conectar a interface à API, defina `NEXT_PUBLIC_API_URL`. Para preparar a API, defina `DATABASE_URL` (Supabase PostgreSQL é suportado), `DATABASE_SSL=require` e `SESSION_SECRET`, execute `npm run db:migrate --workspace @agenda/api` e faça o bootstrap com `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `TENANT_SLUG` e `TENANT_NAME` usando `npm run db:bootstrap --workspace @agenda/api`. Consulte `docs/SUPABASE-DEPLOYMENT.md`.

## Estado da entrega

O site e a API compilam; a API já persiste reservas com idempotência, bloqueio de sobreposição, autenticação do painel, auditoria e outbox. A plataforma Android foi gerada e sincronizada, mas o APK ainda depende de Java/Android SDK no ambiente de build. Antes de vender, ainda é necessário aplicar a migração em PostgreSQL real, configurar o worker/push de notificações, publicar API e web, configurar segredos e validar um aparelho Android.
