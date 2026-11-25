# Plano de desenvolvimento do módulo Mockups

A [especificação](spec.md) define o comportamento e os critérios de aceitação. Cada etapa aponta para os requisitos que cobre. Usar uma cena de referência do começo ao fim permite comparar as mudanças de renderização à medida que entram novas funções.

## 1. Cena de referência e prova de renderização

**Requisitos** · ART-01, CEN-01 e EXP-01, parcialmente.

- Fotografar uma camiseta lisa em resolução suficiente para o recorte de exportação. Manter câmera, peça e enquadramento fixos para as variações de luz que serão fotografadas.
- Preparar máscara, zona de peito e mapa de deformação. Usar a iluminação capturada quando a direção da luz for importante e ajustar temperatura e contraste para as variações que a foto suportar.
- Prototipar a composição na ordem zona e deformação, acabamento, iluminação e sombra projetada. Compartilhar o pipeline de prévia e exportação, renderizando cada um na resolução apropriada.
- **Concluída quando** uma arte clara, uma escura e uma com detalhes finos passarem pela prévia e pela exportação Full HD. Revisar dobras, recorte e legibilidade a 100%, com luz original e uma variação.

## 2. Editor de camadas e acabamentos

**Requisitos** · ART-01, CAM-01 e ACA-01.

- Implementar estado de projeto versionado, seleção no canvas e na lista, transformações, comandos de edição e histórico.
- Entregar os cinco acabamentos, com parâmetros testados em tecidos claros e escuros. Usar uma semente persistida para os padrões de desgaste que dependam de aleatoriedade.
- **Concluída quando** duas artes sobrepostas puderem ter acabamentos distintos, ser duplicadas, reordenadas e excluídas, com desfazer e refazer. Conferir o resultado composto no arquivo exportado.

## 3. Presets e operação local

**Requisitos** · CEN-01, PRO-01 no fluxo por arquivo e EXP-01.

- Entregar as cinco opções de luz e as cinco de sombra, com controles de projeção e persistência das escolhas. Incluir os recursos necessários no pacote local da cena.
- Entregar salvamento, reabertura e exportação PNG/JPEG nos formatos especificados.
- **Concluída quando** as 25 combinações funcionarem na cena de referência e o mesmo projeto puder ser reaberto, editado e exportado com a rede desligada.

## 4. Biblioteca e preparação de novas peças

**Requisito** · CAT-01.

- Definir um pacote versionado por cena com manifesto, foto, miniatura, máscaras, zonas, mapas, recursos dos presets e origem dos arquivos.
- Criar fluxo de cadastro e validação com prévia da zona estampável. Testar integridade dos arquivos, bordas da máscara e deformação antes de publicar cada cena no catálogo local.
- **Concluída quando** camiseta, moletom sem capuz e hoodie tiverem frente e costas cadastradas e filtráveis. A próxima expansão pode incluir acessórios, jaquetas, regatas, polos, calças, shorts e vestidos.

## 5. Integração direta com o editor 3D

**Requisito** · PRO-01 no fluxo direto.

- Inspecionar a normalização de artes do editor 3D em `dist/artwork.js`. Reutilizar esse formato no contrato de transferência e adicionar o comando **Criar mockup**. Esta etapa pode começar assim que o contrato estiver definido e o editor aceitar importação, em paralelo à ampliação do catálogo.
- **Concluída quando** uma arte enviada pelo 3D abrir em Mockups preservando transparência e dimensões e puder ser ajustada, salva e exportada.

## Verificação para cada entrega

- Registrar os IDs de requisitos atendidos e guardar amostras comparáveis de prévia e exportação.
- Automatizar regras determinísticas de seleção, ordenação, desfazer e refazer, persistência e dimensões de exportação. Revisar visualmente o tecido, as dobras, os acabamentos e as transições de luz.
- Atualizar a especificação antes de implementar mudanças de comportamento. Rever estimativas depois da primeira cena, quando será possível medir o trabalho de preparação por foto e por zona.

O editor 3D já está em `dist/`. O PNG de mockup renderizado pelo 3D contém a peça. A entrada do 2D é a arte transparente separada. O atalho direto depende da definição do contrato de transferência da arte.

## Preparação do catálogo e recoloração

**Requisitos** · AST-01 e COR-01. Antecipar este trabalho para a etapa 1.

1. Inventariar vistas, resolução, arte visível e origem. Buscar fotos limpas e maiores para os arquivos de 600 px antes de investir em retoque definitivo. Para a prova inicial, avaliar o moletom careca de 2400 × 2400, que tem resolução útil, mas precisa passar pelo teste de detalhe nas sombras.
2. Preparar uma cena preta lisa e uma preta estonada. Retocar a arte existente nas cópias, revisar a 100% e preparar máscaras de tecido e componentes.
3. Implementar a troca de cor por paleta ou HEX. Separar o sombreado de baixa frequência do detalhe fino do tecido em espaço linear e recompor ambos sobre a nova cor, com ajuste por cena para evitar ruído amplificado ou altas luzes estouradas. Aplicar acabamento, iluminação e sombras após compor a cor do tecido e a arte.
4. Validar as cores claras e saturadas do requisito COR-01 em prévia e exportação. Na etapa 4, cadastrar novas vistas apenas quando os critérios de limpeza, textura e resolução passarem.

## Inventário inicial dos arquivos recebidos

- **Boxy lisa** · frente em superfície plana (600 × 600) e costas no corpo (600 × 750). Ambas têm arte visível. Confirmar se correspondem à mesma modelagem antes de vincular. Buscar costas em superfície plana ou frente no corpo para formar um par com a mesma apresentação.
- **Sem costas na pasta** · boxy estonada, camiseta normal, camiseta normal estonada, oversized, moletom careca, hoodie estonado com zíper e hoodie normal no corpo. As frentes têm arte ou marca visível, com exceção do moletom careca, que aparenta estar liso na inspeção inicial.
- **Manga longa, patch e pôster urbano** · os três PNGs de 800 × 800 são cópias idênticas e totalmente transparentes. Buscar arquivos reais. Para a manga longa, faltam frente e costas utilizáveis.
- **Resolução** · somente o moletom careca (2400 × 2400) tem resolução de origem suficiente para avaliar uma exportação Full HD. Os oito JPGs têm 600 px de largura e servem como referência de catálogo. Exportar em dimensões maiores não recupera detalhe perdido.

## Upscale opcional na preparação de fotos

**Requisito** · AST-02. Incluir na preparação da cena de referência e no cadastro do catálogo.

- Começar com reamostragem Lanczos para as fotos cujo lado menor tenha menos de 1000 px. Gerar uma cópia mantendo as proporções e preparar máscaras a partir da versão que será usada na cena.
- Validar primeiro com as costas da camiseta normal e da oversized. Comparar a 100% as bordas e costuras e verificar se a recoloração para off-white mantém a textura visível antes de aplicar ao restante do catálogo.
