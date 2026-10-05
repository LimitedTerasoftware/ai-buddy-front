import test from 'node:test'
import assert from 'node:assert/strict'
import { CLASS_LEVELS, STORY_TOPICS, getChildInstructions, getStoryPrompt } from './voiceLearning.js'

test('every class has a choice of stories with distinct age guidance', () => {
  assert.deepEqual(CLASS_LEVELS.map(level => level.label), ['Nursery', 'LKG', 'UKG', 'Grade 1', 'Grade 2', 'Grade 3'])
  for (const level of CLASS_LEVELS) {
    const stories = STORY_TOPICS.filter(story => story.levels.includes(level.id))
    assert.ok(stories.length >= 3, level.label)
    for (const story of stories) {
      const prompt = getStoryPrompt(story, level.id)
      assert.ok(prompt.includes(level.label))
      assert.ok(prompt.includes(level.guidance))
      assert.ok(prompt.includes(story.theme))
    }
  }
  assert.notEqual(getChildInstructions('nursery'), getChildInstructions('grade3'))
})

test('child instructions guide pacing, understanding, and accurate AI explanations', () => {
  for (const level of CLASS_LEVELS) {
    const instructions = getChildInstructions(level.id)
    assert.match(instructions, /slowly.*pauses/)
    assert.match(instructions, /one.*question.*wait/)
    assert.match(instructions, /software.*can make mistakes/)
    assert.match(instructions, /Do not ask for personal details/)
    assert.match(instructions, /non-scary/)
  }
  assert.equal(getChildInstructions('unknown'), getChildInstructions('nursery'))
})
