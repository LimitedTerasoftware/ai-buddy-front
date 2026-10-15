import { VoiceError } from './protocol.js'

export function createOpenAIProvider(env = process.env, fetchImpl = fetch) {
  const models = { stt: env.OPENAI_TRANSCRIPTION_MODEL || 'gpt-4o-mini-transcribe',
    llm: env.OPENAI_CHAT_MODEL || 'gpt-4o-mini', tts: env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts',
    safety: env.OPENAI_MODERATION_MODEL || 'omni-moderation-latest' }
  async function request(path, body, signal, multipart = false) {
    if (!env.OPENAI_API_KEY) throw new VoiceError('generation_failed', 'Voice provider is not configured.', 503, true)
    try {
      const response = await fetchImpl(`https://api.openai.com/v1/${path}`, {
        method: 'POST', headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          ...(multipart ? {} : { 'Content-Type': 'application/json' }) },
        body: multipart ? body : JSON.stringify(body), signal
      })
      if (!response.ok) {
        await response.body?.cancel()
        if (response.status === 429) throw new VoiceError('rate_limited', 'Voice provider is busy. Please retry later.', 429, true)
        throw new VoiceError('generation_failed', 'Voice provider could not complete this stage.', 502, true)
      }
      return response
    } catch (error) {
      if (signal.aborted || error instanceof VoiceError) throw error
      throw new VoiceError('generation_failed', 'Voice provider is unavailable.', 502, true)
    }
  }
  return {
    id: 'openai', models,
    async transcribe(audio, language, signal) {
      const form = new FormData()
      form.append('file', new Blob([audio], { type: 'audio/wav' }), 'utterance.wav')
      form.append('model', models.stt)
      if (language) form.append('language', language)
      const data = await (await request('audio/transcriptions', form, signal, true)).json()
      if (typeof data.text !== 'string') throw new VoiceError('generation_failed', 'Transcription failed.', 502, true)
      return data.text.trim()
    },
    async safe(text, signal) {
      const data = await (await request('moderations', { model: models.safety, input: text }, signal)).json()
      if (typeof data.results?.[0]?.flagged !== 'boolean') throw new VoiceError('generation_failed', 'Safety check failed.', 502, true)
      return !data.results[0].flagged
    },
    async generate(messages, signal) {
      const data = await (await request('chat/completions', {
        model: models.llm, messages, max_completion_tokens: 500
      }, signal)).json()
      const text = data.choices?.[0]?.message?.content
      if (typeof text !== 'string' || !text.trim()) throw new VoiceError('generation_failed', 'No response was generated.', 502, true)
      return { text: text.trim().slice(0, 4096), usage: data.usage }
    },
    async *speak(text, character, speed, signal) {
      const response = await request('audio/speech', {
        model: models.tts, voice: character.voice, input: text, speed, response_format: 'pcm'
      }, signal)
      for await (const chunk of response.body) yield Buffer.from(chunk)
    }
  }
}
