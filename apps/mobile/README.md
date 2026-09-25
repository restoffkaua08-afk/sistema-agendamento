# Aplicativo Android

O aplicativo usa Capacitor para empacotar a experiência web responsiva e manter o mesmo contrato com a API. Em produção, `MOBILE_WEB_URL` pode apontar para o domínio publicado.

## Próximo passo de build

1. instalar as dependências na raiz;
2. gerar o build web exportável;
3. executar `npx cap add android` dentro desta pasta;
4. executar `npm run cap:sync`;
5. abrir o projeto no Android Studio e gerar o APK assinado.

O APK ainda não é declarado pronto: assinatura, tela de configuração de ambiente e teste em aparelho físico fazem parte da etapa de entrega mobile.
