export function getVoiceCommand(text, characterName = 'Buddy') {
  const normalize = value => value.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim()
  const phrase = normalize(text || '').replace(/^please /, '').replace(/ please$/, '')
  const names = new Set(['buddy', 'tera buddy', normalize(characterName)])
  if (['stop', 'goodbye', 'bye bye', 'all done', 'stop talking', 'end chat'].includes(phrase)) return 'stop'
  for (const name of names) {
    if (!name) continue
    if ([`stop ${name}`, `goodbye ${name}`, `bye ${name}`, `${name} stop`, `all done ${name}`].includes(phrase)) return 'stop'
    if ([`hello ${name}`, `hi ${name}`, `start ${name}`, `${name} start`].includes(phrase)) return 'start'
  }
  if (['start talking', 'lets talk', 'start chat'].includes(phrase)) return 'start'
  return null
}
