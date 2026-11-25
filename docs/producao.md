# Preparação para produção

## Base migrada

O editor estático em `dist/` veio da versão publicada do artefato, commit de origem `22a5753ce3165f4cdb5a085f360beb9bd20283a9`. O catálogo fotográfico e a implementação 2D são entregas seguintes.

## Liberação do editor 3D

1. Gerar uma prévia HTTPS de `dist/` a partir de um commit com CI verde. Configurar CSP com hash do import map, imagens `blob:` e `data:`, proteção contra emolduramento e `nosniff`. Confirmar o carregamento dos módulos de exportação na URL de prévia.
2. Validar em navegador desktop e celular. Importar PNG e SVG, testar arquivo inválido, alternar frente e costas, editar e desfazer, trocar modelo e cor e baixar PNG, GIF e ZIP. Confirmar que a arte importada permanece no dispositivo.
3. Conferir WebGL e renderização em software com arte clara e escura. O renderizador em software usa iluminação simplificada, com diferenças esperadas no relevo e acabamento. Avaliar tempo de exportação e uso de memória com SVGs complexos antes da abertura ao público.
4. Promover o mesmo artefato testado para produção. Registrar seu commit, fazer uma verificação após a publicação e manter a versão anterior disponível para rollback.

## Primeira entrega 2D

Implementar uma cena local com foto autorizada, máscara de tecido, área estampável e exportação Full HD. Validar primeiro a troca de cor do tecido preto para off-white com a textura visível. O módulo 2D terá estado próprio para cenas e camadas. Definir um contrato versionado para receber a arte do editor 3D, com arquivo ou bytes da arte, nome, dimensões e lado sugerido. Validar se a transferência leva a arte original ou a versão editada antes de ligar o atalho.

## Empacotamento no Site existente

O checkout do GitHub continua sendo a fonte do editor. Para o Site existente, gere o módulo Worker com `node scripts/build-site-worker.mjs /tmp/doutelab-worker`. O módulo incorpora os arquivos do editor e acrescenta os cabeçalhos HTTP. O manifesto de hospedagem usa o modo Worker, com esse módulo em `dist/server/index.js`. Para rollback, promova a versão anteriormente publicada no mesmo projeto Sites.
