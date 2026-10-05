export const CLASS_LEVELS = [
  { id: 'nursery', label: 'Nursery', guidance: 'Use familiar words, repeated phrases, and sentences of 3 to 5 words. Tell a 60 to 80 word story about one simple idea.' },
  { id: 'lkg', label: 'LKG', guidance: 'Use simple words and sentences of 4 to 6 words. Tell an 80 to 100 word story with repetition and one learning idea.' },
  { id: 'ukg', label: 'UKG', guidance: 'Use short sentences and basic counting or patterns. Tell a 100 to 130 word story with a clear beginning and happy ending.' },
  { id: 'grade1', label: 'Grade 1', guidance: 'Use early-reader vocabulary. Tell a 130 to 160 word story with a simple problem and solution. Explain new words with familiar examples.' },
  { id: 'grade2', label: 'Grade 2', guidance: 'Tell a 160 to 200 word story about teamwork or problem solving. Explain any new technology word simply.' },
  { id: 'grade3', label: 'Grade 3', guidance: 'Tell a 200 to 250 word story with simple cause and effect and responsible use of technology. Explain AI ideas accurately with concrete examples.' }
]

export const STORY_TOPICS = [
  { id: 'colors', title: 'Buddy Finds the Colors', topic: 'Colors', theme: 'A pretend robot sorts red, yellow, and blue blocks with a child.', levels: ['nursery', 'lkg'], color: 'pink' },
  { id: 'shapes', title: 'The Shape Parade', topic: 'Shapes', theme: 'A pretend robot finds circles, squares, and triangles in a playground.', levels: ['nursery', 'lkg', 'ukg'], color: 'green' },
  { id: 'sounds', title: 'Hello, Little Buddy', topic: 'Words', theme: 'A child teaches a pretend robot familiar words such as hello, ball, and sun.', levels: ['nursery', 'lkg'], color: 'blue' },
  { id: 'counting', title: 'Five Stars for Buddy', topic: 'Counting', theme: 'A child and a pretend robot count five stars and learn to take turns.', levels: ['lkg', 'ukg', 'grade1'], color: 'yellow' },
  { id: 'patterns', title: 'The Pattern Train', topic: 'Patterns', theme: 'A pretend robot and a child make a red-blue-red-blue train and predict the next color.', levels: ['ukg', 'grade1'], color: 'pink' },
  { id: 'steps', title: 'Buddy Plants a Seed', topic: 'Sequences', theme: 'A child gives a pretend robot simple ordered steps to plant and water a seed.', levels: ['ukg', 'grade1', 'grade2'], color: 'green' },
  { id: 'learning', title: 'How Buddy Learns', topic: 'AI basics', theme: 'A child sorts toy pictures to show how AI learns patterns from examples. AI is software, not a person, and can make mistakes.', levels: ['grade1', 'grade2', 'grade3'], color: 'blue' },
  { id: 'mistakes', title: 'The Mixed-Up Picture', topic: 'Checking answers', theme: 'An AI picture sorter mistakes a toy for a fruit. Children check its answer and ask an adult for help.', levels: ['grade2', 'grade3'], color: 'yellow' },
  { id: 'teamwork', title: 'The Garden Helpers', topic: 'Teamwork', theme: 'Children use a simple AI suggestion to plan a school garden, then check it together with their teacher.', levels: ['grade2', 'grade3'], color: 'green' },
  { id: 'privacy', title: 'Buddy Keeps a Secret Safe', topic: 'Digital care', theme: 'A child learns not to share addresses or passwords with an AI tool and asks a trusted adult before using it.', levels: ['grade3'], color: 'pink' },
  { id: 'ramayanam-kindness', title: 'Ramayanam: Rama Helps a Friend', topic: 'Ramayanam', theme: 'A gentle retelling from the Ramayanam where Rama, Sita, Lakshmana, Hanuman, and the forest friends show kindness, courage, and keeping promises. Keep it peaceful and avoid scary battle details.', levels: ['nursery', 'lkg', 'ukg', 'grade1', 'grade2', 'grade3'], color: 'yellow' },
  { id: 'ramayanam-hanuman', title: 'Ramayanam: Hanuman Brings Hope', topic: 'Ramayanam', theme: 'A child-friendly Ramayanam story about Hanuman being brave, helpful, and humble while carrying a hopeful message. Focus on devotion, teamwork, and helping others, with no frightening details.', levels: ['ukg', 'grade1', 'grade2', 'grade3'], color: 'green' },
  { id: 'mahabharatam-arjuna', title: 'Mahabharatam: Arjuna Learns Focus', topic: 'Mahabharatam', theme: 'A gentle Mahabharatam story where Arjuna learns focus, patience, and listening carefully from his teacher. Keep the lesson about practice and attention, not fighting.', levels: ['ukg', 'grade1', 'grade2', 'grade3'], color: 'blue' },
  { id: 'mahabharatam-yudhishthira', title: 'Mahabharatam: The Honest Answer', topic: 'Mahabharatam', theme: 'A child-friendly Mahabharatam story about Yudhishthira choosing honesty, calm thinking, and respect for elders. Keep the story reassuring and values-focused.', levels: ['grade1', 'grade2', 'grade3'], color: 'pink' }
]

export function getChildInstructions(classId) {
  const level = CLASS_LEVELS.find(item => item.id === classId) || CLASS_LEVELS[0]
  return [
    'You are AI Buddy, a warm, patient learning companion speaking to a young child.',
    `The child is in ${level.label}. ${level.guidance}`,
    'Speak a little slowly, clearly, and warmly, with natural pauses between sentences. Never rush.',
    'Keep everyday replies short. Ask only one gentle question at a time and wait for the child to answer. Encourage effort without grading or shaming.',
    'Stories must be reassuring, non-scary, and child-appropriate, with a happy ending. After a story, ask one easy comprehension question and wait.',
    'Explain AI as software that learns patterns from examples and can make mistakes. Talking robots in stories are pretend; do not imply real AI has feelings or knows everything.',
    'Do not ask for personal details. If a child needs help with a serious problem, encourage talking to a trusted adult.'
  ].join(' ')
}

export function getStoryPrompt(story, classId) {
  const level = CLASS_LEVELS.find(item => item.id === classId) || CLASS_LEVELS[0]
  return `Tell me the story "${story.title}" for ${level.label}. ${story.theme} ${level.guidance} Speak slowly with pauses. End with one simple question and wait for my answer.`
}
