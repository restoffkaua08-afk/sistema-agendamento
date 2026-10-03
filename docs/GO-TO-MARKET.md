# Plano comercial inicial

## Melhor primeiro cliente

Começar por negócios de serviço com agenda simples, 1–5 profissionais e decisões rápidas: barbearias, salões de beleza, manicure, estética não clínica, tatuagem, massagem, personal trainer, pet grooming e pequenos estúdios. Eles sentem diretamente o problema de mensagens espalhadas, horários duplicados e falta de presença digital.

## O que o cliente compra

- site público responsivo com marca, serviços, profissionais e horários;
- reserva online com validação no banco e proteção contra dupla ocupação;
- painel protegido para acompanhar, concluir e cancelar atendimentos;
- aplicativo Android do proprietário apontando para o painel online;
- publicação na Vercel e banco PostgreSQL Supabase configurados;
- documentação de operação, backup/configuração e caminho seguro para novas páginas.

## O que o cliente precisa fornecer

- conta Vercel se quiser que a implantação fique na conta dele;
- projeto Supabase e conexão PostgreSQL, ou autorização para criar um projeto em nome dele;
- telefone Android para instalar/testar o APK;
- nome, logo/cores, serviços, preços, profissionais, jornada, fuso, e-mail e senha inicial;
- domínio próprio é opcional, mas recomendado para venda profissional.

## Entrega recomendada

1. Descoberta de serviços, equipe e jornada.
2. Configuração de tenant, Vercel, Supabase, API, site e painel.
3. Bootstrap do administrador e teste com duas tentativas no mesmo horário.
4. Geração de APK assinado, instalação no aparelho e teste de sincronização.
5. Aceite com roteiro escrito; alterações futuras entram como módulos/versionamento, sem reabrir abas lacradas sem teste específico.

## Clientes para uma segunda fase

Clínicas médicas, odontologia, psicologia, salões grandes e redes exigem privacidade, auditoria, permissões, backups, suporte, disponibilidade e conformidade mais rigorosos. Não prometer esses segmentos como produto pronto até validar push, observabilidade, recuperação de desastre, política de dados e contrato de suporte.

## Modelo de venda

Cobrar implantação/configuração e, se desejado, manutenção mensal. “Gratuito” deve significar sem licença de infraestrutura no piloto, não garantia de custo zero: Vercel, Supabase, domínio, e-mail, limites do plano e suporte pertencem ao ambiente do cliente e podem mudar.
