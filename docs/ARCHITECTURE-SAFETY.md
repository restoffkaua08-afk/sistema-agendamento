# Evolução segura do produto

## Fronteiras estáveis

- `packages/contracts` é a fronteira única de tipos, disponibilidade e `CONTRACT_VERSION`.
- `apps/web` contém apresentação e fluxo público/painel; não deve conhecer tabelas PostgreSQL.
- `apps/api` é a fronteira de persistência, autenticação, autorização, auditoria e notificações.
- `apps/mobile` empacota o painel publicado por Capacitor; novas abas devem ser adicionadas ao web/painel primeiro, mantendo a URL configurável.

## Regras para futuras mudanças

1. Uma aba nova deve nascer como rota/componente isolado e não alterar contratos existentes sem motivo.
2. Mudanças de dados entram em nova migração numerada, idempotente e compatível com dados atuais; nunca reescrever uma migração já aplicada.
3. Mudanças de API devem preservar respostas existentes durante pelo menos uma versão de contrato; campos novos são aditivos antes de qualquer remoção.
4. Cada módulo precisa de typecheck, teste de domínio e build web antes de ser considerado fechado.
5. O APK não contém regra de negócio exclusiva: ele aponta para o painel e a API publicados, reduzindo risco de dessincronização.

## Limites atuais

O produto ainda não está lacrado para venda: PostgreSQL de implantação, push no app fechado, publicação, assinatura do APK e teste em dispositivo real permanecem obrigatórios.
