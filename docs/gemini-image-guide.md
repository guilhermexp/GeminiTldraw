# Guia de Imagens com Gemini 2.5 Flash (e modelos relacionados)

## Visão Geral
- `gemini-2.5-flash` (texto → texto e raciocínio) e `gemini-2.5-flash-image-preview` (texto/imagem → imagem) são modelos multimodais da API Gemini usados aqui para descrição, edição e geração com referência.
- Para geração “do zero”, usamos Imagen 4: `imagen-4.0-generate-001`.
- Para vídeo, usamos VEO 2.0: `veo-2.0-generate-001`.

## Setup e Autenticação
- Defina `GEMINI_API_KEY` em `.env.local` (git-ignorado). O Vite injeta em `process.env.API_KEY` (veja `vite.config.ts`).
- Biblioteca: `@google/genai`. Instalação: `npm i @google/genai` (já presente).

## Fluxos Principais (c/ exemplos TypeScript)
- Texto + Imagem → Imagem (edição/variação) com Gemini
```ts
const res = await ai.models.generateContent({
  model: 'gemini-2.5-flash-image-preview',
  contents: { parts: [
    { text: 'Remova o fundo e deixe o objeto central mais nítido.' },
    { inlineData: { mimeType: 'image/png', data: base64Image } },
    // Opcional: máscara (áreas a editar)
    // { inlineData: { mimeType: 'image/png', data: base64Mask } },
  ]},
  config: { responseModalities: [Modality.IMAGE, Modality.TEXT] },
});
const imagePart = res.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
```
- Texto → Imagem (sem referência) com Imagen 4
```ts
const res = await ai.models.generateImages({
  model: 'imagen-4.0-generate-001',
  prompt: 'Paisagem futurista 16:9, pôr do sol, detalhada',
  config: { numberOfImages: 2, aspectRatio: '16:9', outputMimeType: 'image/jpeg' },
});
const imgs = res.generatedImages?.map(g => `data:image/jpeg;base64,${g.image.imageBytes}`);
```
- Vídeo a partir de imagem ou texto com VEO 2.0
```ts
let op = await ai.models.generateVideos({ model: 'veo-2.0-generate-001', prompt, image, config:{ aspectRatio:'16:9' }});
while (!op.done) { await new Promise(r => setTimeout(r, 10_000)); op = await ai.operations.getVideosOperation({ operation: op }); }
const blobs = await Promise.all(op.response.generatedVideos.map(async v => (await fetch(`${decodeURIComponent(v.video.uri)}&key=${process.env.API_KEY}`)).blob()));
```

## Boas Práticas de Prompting
- Descreva a cena de forma contextual (tema, composição, luz, estilo, qualidade). Evite lista solta de palavras.
- Para consistência visual, fixe aspectos (ângulo, lente, cores, materiais) e referências (imagens de estilo/modelo).
- Para texto em imagem (cartazes/logos), especifique tipografia, posicionamento e contraste.

## Parâmetros Importantes
- Gemini (conteúdo): `config.responseModalities: [Modality.IMAGE]` para retornar imagem; ajuste `maxOutputTokens` apenas para texto.
- Imagen 4: `numberOfImages`, `aspectRatio` (ex.: `1:1`, `3:4`, `4:3`, `9:16`, `16:9`), `outputMimeType`. Quando suportado, use `seed` para reprodutibilidade e `negativePrompt` para evitar elementos.
- VEO: gere 1 vídeo por operação e faça polling até `done`.

## Edição e Máscaras
- Forneça a imagem original + prompt; opcionalmente inclua uma máscara (PNG) para delimitar a área a alterar. Dica: use bordas suaves para transições naturais.

## Segurança, Quotas e Erros
- Respeite políticas de conteúdo; respostas podem ser filtradas (verifique razões RAI antes de exibir). Trate erros e estados de operação.
- Rotacione chaves vazadas e nunca commit secrets. Em produção, prefira proxy/backend.
- Quotas, latência e limites variam por modelo; teste com `numberOfImages` baixo e `aspectRatio` adequado.

## Quando usar qual modelo
- Gemini 2.5 Flash Image: variações/edições guiadas por imagem, composição multi-imagem, “conversa” iterativa.
- Imagen 4: geração rápida/robusta a partir de texto (sem referência).
- VEO 2.0: geração de vídeo curta a partir de texto e/ou imagem base.

## Referências
- Vertex AI – Gemini 2.5 Flash: https://cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/2-5-flash
- Gemini API – Image generation: https://ai.google.dev/gemini-api/docs/image-generation
- Imagen API – Referência: https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/imagen-api
- GenerationConfig (seed, topK/P, etc.): https://cloud.google.com/vertex-ai/generative-ai/docs/reference/rest/v1/GenerationConfig

