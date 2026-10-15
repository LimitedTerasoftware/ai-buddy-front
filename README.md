# React + Vite

## Device voice APIs

For **Vercel-only WAV upload**, production environment settings and Bash/PowerShell curl examples: [Deploy and test WAV on Vercel](docs/vercel-wav.md). No separate voice server is needed for independent uploads.

Push-to-talk and streaming WebSocket implementation, setup, authenticated curl examples, audio contract, deployment, and prototype limits: [Device voice API documentation](docs/voice-api.md).

Run `npm run voice:server` for the shared device backend and `npm run dev` for the console. Configure credentials using `.env.example` first. Run `npm test` to verify the voice contract without calling model providers.

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.
