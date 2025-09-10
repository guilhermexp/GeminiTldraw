<div align="center">
  <img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Canvas de Geração e Edição com IA

Aplicativo de canvas (tldraw + React) com assistente para geração/edição de imagens e geração de vídeo. O assistente orquestra ferramentas como: gerar imagem (texto→imagem e imagem→imagem), editar com máscara, compor overlay (IA e determinístico), upscale, e gerar vídeo. Fallback opcional via FAL.ai.

Link AI Studio (se aplicável): https://ai.studio/apps/drive/1rxISk_DjVIjywvSIeWlRWhC1yBapG9-4

Principais modelos:
- Chat/Orquestração: `gemini-2.5-pro` (fallback automático: `gemini-2.5-flash` em erro 500)
- Imagens (todas): `gemini-2.5-flash-image-preview`
- Vídeo: `veo-3.0-generate-001` (fallback opcional FAL Veo3)

---

## Sumário
- Visão geral e features
- Requisitos e setup
- Variáveis de ambiente
- Rodando em desenvolvimento e build
- Como usar (Create e Assistant)
- Fallbacks FAL.ai (opcional)
- Traduções e locale
- Estrutura do projeto
- Arquitetura e principais funções
- Diretrizes de contribuição
- Troubleshooting (erros comuns)
- Notas de licenciamento
- Documentação adicional

---

## Visão Geral e Features
- Geração de imagens com Gemini 2.5 Image a partir de texto ou imagem de referência (variações).
- Edição com máscara: pinte em branco as áreas a alterar e descreva o que quer mudar.
- Composição com overlay:
  - Compose (IA): integra a imagem overlay na base com o prompt.
  - Bake Overlay (determinístico): mescla os pixels do overlay na base sem IA.
- Geração de vídeo com Veo 3; polling até finalizar; insere no canvas como vídeo.
- Assistente (chat) usa ferramentas para planejar/executar: generateImage, editImage, removeBackground, applyOverlay, composeAI, upscaleImage, generateVideo, plan.
- UX: conectores cinza entre origem e resultados, “cards” de título legíveis, retry automático 1x quando a imagem não vem, toasts informativos, barra de prompt flutuante.
- Fallbacks FAL.ai opcionais para imagem/vídeo; painel de toggles oculto por padrão.

---

## Requisitos e Setup
- Node.js 18+ (recomendado 20+).
- Conta na Gemini API com chave válida.
- (Opcional) Conta FAL.ai e chave no formato `KEY_ID:KEY_SECRET`.

Crie um arquivo `.env.local` na raiz com:

```
GEMINI_API_KEY=coloque_sua_chave
# Opcional (para fallbacks):
FAL_KEY=KEY_ID:KEY_SECRET
# Opcional (evita avisos de tradução em dev):
FORCE_EN_LOCALE=true
# Opcional (exibe painel de toggles do FAL):
SHOW_FALLBACK_PANEL=true
```

Vite injeta essas variáveis para `process.env.*` (veja `vite.config.ts`).

---

## Rodando e Build
- Instalar dependências: `npm install`
- Dev server: `npm run dev` (Vite)
- Build produção: `npm run build` (gera `dist/`)
- Preview do build: `npm run preview`

O app utiliza fetch direto da API Gemini no cliente. Em produção, considere um proxy/backend para proteger chaves/supervisar uso.

---

## Como Usar

### Modo Create (barra contextual)
- Selecione 1 imagem: “Edit” abre o editor de máscara. Pinte em branco onde alterar e descreva a edição.
- Selecione 2 imagens: “Compose (AI)” abre editor com base + overlay; “Bake Overlay” faz a fusão determinística.
- Selecione texto (sem imagem): “Generate image” cria novas imagens a partir do texto.
- Selecione texto + imagem: “Generate image” gera variações condicionadas pela imagem.
- “Generate video”: usa o texto e/ou imagem selecionados para gerar um vídeo (Veo 3), posicionando o resultado no canvas.

### Modo Assistant (chat)
- Use “Use in Chat” para enviar uma imagem selecionada como referência (por exemplo, overlay) para a conversa.
- Peça ao assistente para editar a imagem selecionada: ele pode abrir o editor de máscara já com o prompt e overlay.
- Ferramentas disponíveis ao assistente: generateImage, editImage, removeBackground, applyOverlay, composeAI, upscaleImage, generateVideo e plan.

Boas práticas de prompt (imagens):
- Diga o que mudar e como (ângulo, iluminação, composição, fundo). Evite reproduzir a cena exatamente.
- Para variações, peça diversidade em pose, composição, ângulo, luz e fundo.

---

## Fallbacks FAL.ai (opcional)
- Endpoints utilizados:
  - Texto→Imagem: `fal-ai/flux/schnell`
  - Imagem→Imagem: `fal-ai/flux/dev/image-to-image`
  - Inpainting (máscara): `fal-ai/flux-general/inpainting`
  - Vídeo: `fal-ai/veo3`
- Para habilitar o painel de toggles no canto superior direito, defina `SHOW_FALLBACK_PANEL=true` no `.env.local`.
- É necessário definir `FAL_KEY` para qualquer fallback funcionar. Sem chave, os fallbacks permanecem inativos.

Observação: fallbacks são úteis quando o modelo primário falha ou retorna vazio. As URLs de mídia do FAL são baixadas e convertidas para base64 antes de inserir no canvas.

---

## Traduções e Locale
- Locale padrão: `pt-br`. Defina `FORCE_EN_LOCALE=true` para forçar inglês e evitar avisos de traduções incompletas durante o desenvolvimento.
- Arquivo de traduções parcial: `public/translations/pt-br.json`. Contribuições são bem-vindas para completar.

---

## Estrutura do Projeto
- `index.html`: entrada HTML, carrega `index.tsx` e CSS.
- `index.tsx`: app principal (tldraw + assistente + handlers). Integra Gemini e FAL.ai.
- `index.css`: estilos globais (prompt bar, editor de máscara, chat, ajustes tldraw).
- `Components/`
  - `ImageEditor.tsx`: editor de máscara (pincel/borracha, prompt, overlay opcional).
  - `PromptBar.tsx`: barra de prompt flutuante (Create/Assistant).
  - `NoticeBanner.tsx`: banner informativo (não exibido por padrão na UI principal).
- `utils.ts`: utilitários (conectores, placeholders, assets, conversões base64, etc.).
- `public/`: ícones da UI e traduções.
- `docs/`: guias complementares.
- `vite.config.ts`: injeção de variáveis de ambiente e aliases.
- `AGENTS.md`: diretrizes de contribuição neste repositório.

---

## Arquitetura e Principais Funções
- Modelos e providers (em `index.tsx`):
  - `GEMINI_MODEL_NAME = 'gemini-2.5-pro'`
  - `GEMINI_IMAGE_MODEL_NAME = 'gemini-2.5-flash-image-preview'`
  - `VEO_MODEL_NAME = 'veo-3.0-generate-001'`
- Geração/edição de imagens:
  - `generateImages(prompt, imageBlob?, numberOfImages?, aspectRatio?)`: usa Gemini Image; retry automático se vazio.
  - `editImage(imageBlob, maskBlob, prompt, overlayBlob?)`: usa Gemini Image com máscara (+ overlay opcional).
- Geração de vídeo:
  - `generateVideo(imageBlob?, prompt, numberOfVideos?, aspectRatio?)`: Veo 3 com polling; fallback FAL Veo3.
- Fallbacks FAL.ai:
  - `falTextToImages`, `falImageToImages`, `falInpaint`, `falVeo3Video` (requer `FAL_KEY`).
- UI e lógica de canvas:
  - `genImageClick` / `genVideoClick`: exportam seleção e inserem resultados; conectores cinza entre origem e saída.
  - `ImageEditor` (máscara branca sobre base preta) gera a máscara correta para inpainting.
  - “Compose (AI)” vs “Bake Overlay” para mesclar duas imagens.

---

## Variáveis de Ambiente
- `GEMINI_API_KEY` (obrigatória): chave da Gemini API. Injetada também como `process.env.API_KEY`.
- `FAL_KEY` (opcional): credenciais FAL.ai no formato `KEY_ID:KEY_SECRET`.
- `FORCE_EN_LOCALE` (opcional): quando `true`, força `en` e evita avisos de tradução.
- `SHOW_FALLBACK_PANEL` (opcional): quando `true`, exibe toggles de fallback FAL na UI.

---

## Diretrizes de Contribuição
- Siga o guia em `AGENTS.md` (estrutura, scripts, estilo de código, commits convencionais e práticas de segurança).
- Tipos: mantenha TypeScript estrito e use tipos do tldraw para IDs (`TLShapeId`) e shapes.
- UI: mantenha conectores cinza/sólidos; cards de título com fundo escuro e texto branco para legibilidade.
- Não exponha chaves em código. Use `.env.local` (git-ignorado) e considere proxy em produção.

---

## Troubleshooting
- “Gemini did not return images” / nenhuma imagem: há uma nova tentativa automática. Tente reforçar ângulo, luz, composição e variar pose/fundo.
- Vídeo não aparece: confirme que a operação de Veo 3 finalizou (logs de polling) e que `GEMINI_API_KEY` é válida. Se habilitado, verifique fallback FAL.
- Avisos de tradução no console: defina `FORCE_EN_LOCALE=true` durante o desenvolvimento.
- RAI/segurança: respostas podem vir filtradas (motivo em `response.raiMediaFilteredReasons`). Ajuste conteúdo ou prompt.

---

## Notas de Licenciamento
- Partes do código incluem cabeçalho de licença Apache 2.0.
- A UI oculta a watermark e botões auxiliares do tldraw via CSS/JS para prototipagem. Em produção, observe os termos de uso/licenciamento do tldraw.

---

## Documentação Adicional
- Mudanças e operação da IA: `docs/ai-changes-and-operations.md`
- Guia de imagens com Gemini: `docs/gemini-image-guide.md`

Sinta-se à vontade para abrir issues/PRs com melhorias, dúvidas ou sugestões.
