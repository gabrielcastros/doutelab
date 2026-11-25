function openTransfer() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('doutelab-artwork', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('transfers')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new Error('O navegador não disponibilizou o armazenamento local.'))
  })
}

function useStore(database, callback) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('transfers', 'readwrite')
    const result = callback(transaction.objectStore('transfers'))
    transaction.oncomplete = () => resolve(result.result)
    transaction.onabort = () => reject(new Error('Não consegui transferir a estampa.'))
  }).finally(() => database.close())
}

export async function saveTransfer(artwork) {
  const db = await openTransfer()
  await useStore(db, store => store.put({ version: 1, ...artwork }, 'pending'))
}

export async function takeTransfer() {
  const db = await openTransfer()
  return useStore(db, store => {
    const read = store.get('pending')
    read.onsuccess = () => { if (read.result) store.delete('pending') }
    return read
  })
}
