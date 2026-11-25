export const compactEditor = matchMedia('(max-width: 51.999rem)')

export function bindInspector(workspace) {
  const toggle = workspace.querySelector('.inspector-toggle')
  const inspector = document.getElementById(toggle.getAttribute('aria-controls'))
  const quickImport = workspace.querySelector('.quick-import')

  function setOpen(open) {
    if (!open && compactEditor.matches && inspector.contains(document.activeElement)) {
      toggle.focus({ preventScroll: true })
    }
    workspace.classList.toggle('inspector-open', open)
    toggle.setAttribute('aria-expanded', String(open))
  }

  toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'))
  quickImport.addEventListener('click', () => document.getElementById('art-file').click())

  compactEditor.addEventListener('change', ({ matches }) => {
    if (matches && inspector.contains(document.activeElement)) setOpen(true)
  })

  return setOpen
}
