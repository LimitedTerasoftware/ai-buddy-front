import test from 'node:test'
import assert from 'node:assert/strict'
import { getVoiceCommand } from './voiceCommands.js'

test('recognizes short child commands and polite variations', () => {
  for (const phrase of ['Stop!', 'Stop Buddy.', 'Goodbye Tera Buddy', 'All done', 'Please stop talking', 'Buddy stop please', 'Bye bye']) {
    assert.equal(getVoiceCommand(phrase), 'stop', phrase)
  }
  for (const phrase of ['Hello Buddy!', 'Hi Tera Buddy', "Let's talk", 'Start talking']) {
    assert.equal(getVoiceCommand(phrase), 'start', phrase)
  }
})

test('supports custom names and avoids commands mentioned in stories or questions', () => {
  assert.equal(getVoiceCommand('Stop Coco', 'Coco'), 'stop')
  assert.equal(getVoiceCommand('Hello Coco', 'Coco'), 'start')
  for (const phrase of ['Tell me a story about a bus stop', 'Do not stop', 'Why did Buddy stop?', 'The character said goodbye Buddy', 'Hello there', '']) {
    assert.equal(getVoiceCommand(phrase), null, phrase)
  }
})
