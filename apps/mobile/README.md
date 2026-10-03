# Aplicativo Android

O aplicativo usa Capacitor para empacotar a experiência web responsiva e manter o mesmo contrato com a API. Em produção, `MOBILE_WEB_URL` deve apontar para a rota `/painel` do domínio publicado, por exemplo `https://agenda.exemplo.com/painel`.

## Próximo passo de build

1. instalar as dependências na raiz;
2. definir `MOBILE_WEB_URL` com o painel publicado;
3. executar `npm run cap:add` dentro desta pasta uma vez;
4. executar `npm run cap:sync`;
5. executar `npm run android:build` ou abrir no Android Studio para gerar o APK assinado.

O APK ainda não é declarado pronto: assinatura, tela de configuração de ambiente e teste em aparelho físico fazem parte da etapa de entrega mobile.
