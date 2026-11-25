export const categories = ['Camiseta', 'Moletom', 'Hoodie', 'Outra peça']
export const views = ['Frente', 'Costas', 'Lateral']
export const styles = ['Superfície plana', 'Cabide', 'No corpo', 'Outro']

export const catalog = [
  {
    id: 'camiseta-estonada-frente', version: 1, name: 'Camiseta estonada', category: 'Camiseta',
    view: 'Frente', style: 'Superfície plana', photo: './mockups/assets/camiseta-estonada.webp',
    zone: { x: .5, y: .46, w: .47, h: .45 },
    neckline: [
      [.375, .063], [.397, .048], [.584, .048], [.615, .064],
      [.608, .106], [.599, .133], [.581, .157], [.558, .177],
      [.532, .190], [.505, .195], [.477, .195], [.449, .188],
      [.424, .175], [.403, .153], [.387, .125], [.379, .097]
    ],
    origin: 'Imagem gerada para o doutelab', usage: 'Referência distribuída com o editor'
  }
]
