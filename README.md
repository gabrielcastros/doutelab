# doutelab · Estúdio 3D

Editor no navegador para aplicar artes PNG e SVG na frente e nas costas de camisetas e exportar imagens ou animações.

## Rodar localmente

Sirva a pasta do editor por HTTP.

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory dist
```

Abra http://localhost:8000. O site roda com os arquivos do próprio repositório. As dependências do navegador estão em `dist/vendor` com suas licenças (Three.js r187, fflate 0.8.2 e gifenc 1.0.3).

## Testar

Com Node.js 22.15 ou mais recente, rode `npm ci` e `npm test`. Os testes verificam geometria e exportação pelo renderizador em software.

## Próximas etapas

- [Preparação para produção](docs/producao.md)
- [Especificação dos mockups 2D](docs/mockups/spec.md)
- [Plano de desenvolvimento dos mockups 2D](docs/mockups/plano.md)

## Mockups fotográficos

Abra **Mockups** e selecione a cena de referência ou adicione uma foto lisa do seu computador. Importe a estampa em PNG ou use **Criar mockup** no editor 3D. O arquivo baixado em **Salvar projeto** contém as camadas editáveis e, nas cenas locais, a foto e a máscara. **Abrir projeto** carrega esse arquivo.
