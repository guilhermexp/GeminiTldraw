# Guia de Imagens com Gemini 2.5

## Visão Geral
- `gemini-2.5-pro` é usado para chat/orquestração e seleção de ferramentas.
- `gemini-2.5-flash-image-preview` é usado para todas as gerações/edições de imagem (texto→imagem e imagem→imagem, com ou sem máscara/overlay).
- Para vídeo, usamos Veo 3: `veo-3.0-generate-001`.

## Setup e Autenticação
- Defina `GEMINI_API_KEY` em `.env.local` (git-ignorado). O Vite injeta em `process.env.API_KEY` (veja `vite.config.ts`).
- Biblioteca: `@google/genai`. Instalação: `npm i @google/genai` (já presente).

## Fluxos Principais (exemplos TypeScript)
- Texto + Imagem → Imagem (edição/variação) com Gemini 2.5 Image
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
- Vídeo a partir de imagem ou texto com Veo 3
```ts
let operation = await ai.models.generateVideos({
  model: 'veo-3.0-generate-001',
  prompt,
  // Opcional: imagem base
  // image: { imageBytes: base64Image, mimeType: 'image/png' },
  config: { aspectRatio: '16:9' }
});
while (!operation.done) {
  await new Promise(r => setTimeout(r, 10_000));
  operation = await ai.operations.getVideosOperation({ operation });
}
const urls = await Promise.all(
  operation.response.generatedVideos.map(async (g) => {
    const url = decodeURIComponent(g.video.uri);
    const res = await fetch(`${url}&key=${process.env.API_KEY}`);
    const blob = await res.blob();
    return `data:video/mp4;base64,${await blobToBase64(blob)}`;
  })
);
```

## Boas Práticas de Prompting
- Descreva a cena de forma contextual (tema, composição, luz, estilo, qualidade). Evite lista solta de palavras.
- Para consistência visual, fixe aspectos (ângulo, lente, cores, materiais) e referências (imagens de estilo/modelo).
- Para texto em imagem (cartazes/logos), especifique tipografia, posicionamento e contraste.

## Parâmetros Importantes
- Gemini Image: use `config.responseModalities: [Modality.IMAGE]` para retornar a imagem; máscaras/overlays podem ser incluídas como `inlineData` adicionais.
- Veo 3: gere 1 vídeo por operação e faça polling até `done`.

## Edição e Máscaras
- Forneça a imagem original + prompt; opcionalmente inclua uma máscara (PNG) para delimitar a área a alterar. Dica: use bordas suaves para transições naturais.

## Segurança, Quotas e Erros
- Respeite políticas de conteúdo; respostas podem ser filtradas (verifique razões RAI antes de exibir). Trate erros e estados de operação.
- Rotacione chaves vazadas e nunca commit secrets. Em produção, prefira proxy/backend.
- Quotas, latência e limites variam por modelo; teste com `numberOfImages` baixo e `aspectRatio` adequado.

## Quando usar qual modelo
- Gemini 2.5 (Image): variações/edições guiadas por imagem, composição multi‑imagem, e geração a partir de texto.
- Veo 3: geração de vídeo curta a partir de texto e/ou imagem base.

## Referências
- Gemini API – Image generation: https://ai.google.dev/gemini-api/docs/image-generation
- Vertex AI – Model reference (GenerationConfig): https://cloud.google.com/vertex-ai/generative-ai/docs/reference/rest/v1/GenerationConfig
