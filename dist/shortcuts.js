const mac = /Mac|iPhone|iPad/.test(navigator.platform)
const labels = { ArrowUp: '↑', ArrowDown: '↓', Escape: 'Esc', Mod: mac ? '⌘' : 'Ctrl' }

export function bindShortcuts(commands) {
  const bindings = commands.map(([selector, ...keys]) => {
    const control = document.querySelector(selector)
    const label = control.title || control.getAttribute('aria-label') || control.textContent.trim()
    control.title = label + ' (' + keys.map(key => key.split('+').map(part => labels[part] ?? part).join('+')).join(' / ') + ')'
    control.setAttribute('aria-keyshortcuts', keys.map(key => key.replace('Mod+', mac ? 'Meta+' : 'Control+')).join(' '))
    return { control, keys }
  })

  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.isComposing || !(event.target instanceof Element) ||
        event.target.isContentEditable || event.target.closest('input:not([type=file]):not([type=checkbox]), textarea, select, dialog[open]')) return
    if ((mac ? event.ctrlKey : event.metaKey)) return
    const key = event.key.length === 1 ? event.key.toUpperCase() : event.key
    const modifiers = [(mac ? event.metaKey : event.ctrlKey) && 'Mod', event.altKey && 'Alt', event.shiftKey && 'Shift'].filter(Boolean)
    const chord = [...modifiers, key].join('+')
    const physicalChord = event.altKey && /^Key[A-Z]$/.test(event.code)
      ? [...modifiers, event.code.slice(-1)].join('+')
      : chord
    const binding = bindings.find(item => item.keys.includes(chord) || item.keys.includes(physicalChord))
    const control = binding?.control
    if (!control || control.disabled || control.closest('[hidden]')) return
    event.preventDefault()
    if (event.repeat) return
    if (control.matches('select, input[type=color], input[type=range]')) {
      control.focus()
      if (!control.matches('input[type=range]')) {
        try { control.showPicker?.() } catch {}
      }
    } else {
      control.click()
    }
  })
}

export function describeHandleKeys(handles) {
  for (const handle of handles) {
    const label = handle.title || handle.getAttribute('aria-label')
    handle.title = label + ' (setas com foco; Shift para passos maiores)'
  }
}
