# Image Upload for AI Chat

## Tasks

- [x] **Add image upload UI to AiAssistantPanel**
  - [x] Add state for attached image (base64 + preview URL)
  - [x] Add file input + upload button (image icon) next to Send
  - [x] Show image thumbnail preview with remove button
  - [x] Display uploaded image in chat messages

- [x] **Update AI provider to support multimodal (image + text)**
  - [x] Add optional `imageDataUrl` field to `AssistantPlanRequestSchema`
  - [x] Update [buildAssistantRequest](file:///c:/Users/carlos/PROYECTOS/pistola/editor/apps/editor/lib/assistant-ai-provider.ts#159-199) to include image as vision content
  - [x] Update system prompt to handle image interpretation for 3D scenes

- [x] **Update API route to pass image data through**
  - [x] Handle larger payload sizes for base64 images

- [x] **Verify end-to-end**
  - [x] Test image upload UI renders correctly
  - [x] Test image is sent with prompt to API
  - [x] Test AI responds with scene interpretation
