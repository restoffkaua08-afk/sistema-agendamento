# Deploy com Vercel + Supabase

O sistema precisa de um PostgreSQL online para que site e aplicativo compartilhem horários e não percam reservas quando uma instância reinicia. Supabase é uma opção adequada porque entrega PostgreSQL gerenciado, conexão segura e um plano gratuito para piloto.

## Arquitetura

- Vercel `apps/web`: site público e painel do proprietário.
- Vercel `apps/api`: função Fastify que valida reservas, autentica o painel e grava no banco.
- Supabase: PostgreSQL usado por `DATABASE_URL`; o código não expõe `service_role` nem precisa do SDK Supabase para a reserva.
- Capacitor: APK aponta para `MOBILE_WEB_URL` e usa a mesma API publicada.

## Configuração por cliente

Uma conta Vercel do cliente é necessária somente se o site for entregue na conta dele; não é requisito técnico da aplicação. Um celular Android é necessário para instalar/testar o APK, mas não para o site.

Para isolamento máximo, cada negócio pode ter um projeto Supabase próprio. O schema também suporta vários negócios em um banco compartilhado usando `tenant_id`; a escolha deve ser feita antes da venda conforme operação e quotas.

1. Criar o projeto Supabase e copiar a connection string PostgreSQL (preferir o Supavisor em transaction mode/porta 6543 para serverless; o cliente já usa `prepare:false`).
2. Configurar `DATABASE_URL` e `DATABASE_SSL=require` no projeto Vercel da API; nunca colocar esses valores no frontend.
3. Aplicar migrações com `npm run db:migrate --workspace @agenda/api`.
4. Executar o bootstrap com `SESSION_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `TENANT_SLUG` e `TENANT_NAME`.
5. Configurar `NEXT_PUBLIC_API_URL` no projeto web e `ALLOWED_ORIGINS` na API.
6. Publicar o web, usar a URL `/painel` em `MOBILE_WEB_URL`, sincronizar o Capacitor e gerar o APK assinado.

## Limites do plano gratuito

O plano gratuito é apropriado para piloto e pequenos clientes, mas quotas, pausa por inatividade, backups/SLA e limites de egress devem ser conferidos antes de vender volume. O produto não deve prometer disponibilidade comercial sem validar o plano escolhido.
