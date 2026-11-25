# Especificação do módulo Mockups

Versão 0.2

## Objetivo

Criar mockups fotográficos de peças lisas no doutelab, com várias artes por cena, acabamentos por camada, iluminação e sombras ajustáveis e exportação offline. O usuário pode importar uma arte diretamente ou reaproveitar a arte do editor 3D.

## Fluxo principal

Escolher peça e vista na biblioteca → importar ou receber a arte do 3D → ajustar camadas e acabamentos → escolher luz e sombra → salvar ou exportar.

## Requisitos e critérios de aceitação

### CAT-01 · Biblioteca de cenas

- A página inicial de Mockups abre uma grade das cenas. A biblioteca filtra por peça, vista e apresentação. Abrir uma cena leva ao editor. Voltar à biblioteca mantém a composição durante a sessão. A navegação entre Estúdio 3D e Mockups usa a mesma barra nos dois editores.
- Cada cena associada a uma peça tem foto base, miniatura, máscara, zonas estampáveis, deformação por zona, recursos de iluminação e informações de origem e licença.
- **Aceite.** Selecionar frente e costas abre as fotos e zonas correspondentes. Incluir uma cena válida no catálogo a torna disponível sem alterar o código do editor.

### ART-01 · Importação e posicionamento

- Cada PNG importado vira uma camada independente e selecionada, com PNG direto inicial. A arte começa centralizada na zona ativa, ajustada à área e com proporção preservada.
- Arrastar a arte move a camada, arrastar os cantos ajusta a escala e arrastar a alça redonda gira a arte. Shift ajusta a rotação em passos de 15°. Os acabamentos simulados deformam a arte com as dobras. A zona estampável e o sombreamento da cena valem para todos os acabamentos.
- **Aceite.** Um PNG transparente pode ser movido, redimensionado e rotacionado. Transparência, dobras e recorte aparecem tanto na prévia quanto no arquivo exportado. Arquivo corrompido gera mensagem e preserva o projeto.

### CAM-01 · Edição por camada

- Ao selecionar uma arte no canvas ou na lista de camadas, exibir acabamento, duplicar, trazer para frente, mandar para trás e excluir no menu flutuante perto da seleção. A alça desloca esse menu. Clicar fora da estampa limpa a seleção. No Estúdio 3D, clicar fora entra em prévia e clicar nos pixels visíveis da estampa volta à edição.
- Duplicar copia arte, zona, transformação e acabamento. A cópia recebe identidade própria, entra logo acima da original com pequeno deslocamento e fica selecionada.
- A ordem é comum à lista e ao canvas. Cada ação de ordenação move uma posição, com o controle desabilitado no limite. Excluir remove a camada selecionada e limpa a seleção. As operações podem ser desfeitas e refeitas.
- **Aceite.** Com duas artes sobrepostas, a ordem visível muda ao reordenar. Editar a cópia preserva a original. Desfazer uma exclusão restaura a camada na posição, ordem e acabamento anteriores.

### ACA-01 · Acabamentos de impressão

O usuário escolhe um acabamento por camada. Cada modo simula a aparência da impressão na foto.

- **PNG direto** · Usa a cor e transparência do PNG, sem deformação de tecido ou efeito de tinta.
- **DTG** · Impressão direta, com textura do tecido visível na arte.
- **Plastisol** · Cobertura mais opaca e brilho discreto.
- **À base d’água** · Aparência fosca, suave e integrada às fibras.
- **Puff** · Volume aparente com bordas arredondadas, realces e sombras.
- **Desgastado** · Falhas e rachaduras que deixam aparecer o tecido.

A ação **Aplicar a todas as camadas** propaga o acabamento selecionado em uma única operação reversível.

- **Aceite.** Duas artes sobrepostas mantêm acabamentos diferentes. Aplicar a todas atualiza ambas, e desfazer restaura o acabamento individual. Desgastado mantém o padrão entre prévia, reabertura e exportação.

### CEN-01 · Iluminação e sombras

Cada grupo oferece cinco estados, contando o neutro. As escolhas são independentes e valem para a cena inteira.

- **Iluminação** · Original, Estúdio, Dourada, Fria, Dramática.
- **Sombras** · Sem sombra adicional, Janela, Janela difusa, Persiana, Galhos.

Original usa a luz já presente na foto base. Sem sombra adicional remove somente a projeção adicionada. As sombras projetadas têm controles de intensidade, posição e suavidade. Os grupos seguem ativos no app local.

- **Aceite.** As 25 combinações podem ser selecionadas na cena de referência. Trocar a luz mantém a sombra escolhida e vice-versa. Uma sombra sobre a área estampada escurece tecido e arte de forma coerente. Alterar acabamento ou camada preserva as escolhas de cena.

### PRO-01 · Projeto e integração

- Salvar localmente a versão do projeto, a referência à cena e sua versão, os arquivos de arte, a ordem e os ajustes de cada camada e os controles de luz e sombra.
- O fluxo inicial aceita o PNG transparente da estampa como arquivo separado. A integração direta, após definir o contrato de transferência, abre Mockups com a arte original, preservando transparência e dimensões. A transformação pertence à cena fotográfica.
- **Aceite.** Reabrir o projeto offline restaura a composição editável. Uma cena ausente gera mensagem que identifica o recurso faltante. Na integração direta, a arte chega como camada independente.

### EXP-01 · Exportação

- Exportar PNG e JPEG offline, com enquadramento revisável. Oferecer Full HD horizontal (1920 × 1080), vertical (1080 × 1920) e opção de preservar a proporção original.
- **Aceite.** Exportar gera o tamanho selecionado, sem guias nem controles do editor. Prévia e exportação mostram a mesma ordem, posição, deformação, acabamento, iluminação e sombra.

## Decisões provisórias

- Os cinco estados de cada grupo incluem a opção neutra, como na referência. O rótulo truncado da segunda sombra de janela foi interpretado como **Janela difusa**.
- O acabamento inicial é PNG direto. Os acabamentos são simulações visuais para apresentação do produto.
- O catálogo inicial prioriza camiseta, moletom sem capuz e hoodie, frente e costas. Outras categorias entram conforme houver cenas preparadas.

## AST-01 · Preparação de fotos

- Guardar os originais e trabalhar em cópias. Antes de cadastrar uma cena, remover logos, textos de demonstração e marcas visíveis na peça, inclusive em mangas e etiquetas externas, quando aplicável.
- Fazer retoque localizado usando tecido adjacente como referência para reconstruir a área coberta e preservar costuras, vincos, granulação e lavagem. Se a arte cobre detalhes que não podem ser reconstruídos com fidelidade, obter uma foto da peça lisa.
- **Aceite.** Revisar antes e depois a 100%. O tecido retocado deve manter continuidade nas bordas e nas dobras. Arquivos totalmente transparentes precisam ser substituídos. Fotos menores podem entrar no catálogo após o upscale opcional e a revisão de qualidade do requisito AST-02.

## COR-01 · Recoloração de peças pretas

- Selecionar uma cor predefinida ou informar um HEX, com prévia imediata e opção de restaurar a cor original. Salvar a cor por cena. A estampa mantém as cores do arquivo e recebe a luz e a sombra da cena.
- Recolorir apenas a região de tecido com máscara de contorno suave. Preservar fundo, pele e acessórios. A cena pode ter máscaras próprias para partes como zíper e cordão.
- Usar composição em espaço linear com a cor escolhida como base e preservar mapas separados do sombreado das dobras e dos detalhes finos, incluindo trama, costuras e lavagem estonada. Compartilhar o cálculo entre prévia e exportação.
- **Aceite.** Em tecido preto liso e preto estonado, comparar a 100% o original com branco, off-white, cinza e uma cor saturada. A silhueta, vincos, textura e lavagem continuam legíveis, sem halos, manchas planas ou perda visível de detalhe. Verificar a estampa e o fundo. Restaurar Original recupera a base retocada sob as mesmas condições de cena. A cor escolhida sobreviverá ao salvamento e à reabertura.
- Se pretos clipados, compressão ou baixa resolução ocultarem detalhes na origem, marcar a cena para substituição. Para validar cores claras, usar uma captura neutra com boa exposição e, quando possível, comparar com uma foto real de uma peça clara sob a mesma luz.

## AST-02 · Upscale opcional

- Aceitar fotos válidas abaixo da resolução de referência. Oferecer upscale para que o lado menor tenha pelo menos 1000 px, preservando a proporção, a transparência e o enquadramento. Manter o original e identificar a cópia ampliada.
- **Aceite.** Uma entrada de 554 × 554 gera 1000 × 1000. Uma entrada de 635 × 865 gera 1000 × 1362. Uma entrada de 1200 × 1500 mantém suas dimensões. Arquivos vazios, totalmente transparentes ou com falha de decodificação precisam de uma fonte válida.
- Conferir contornos, costuras e áreas escuras a 100% antes de usar a cópia ampliada para máscaras e recoloração. A ampliação aumenta as dimensões da imagem. A qualidade da textura continua sujeita ao critério COR-01.
