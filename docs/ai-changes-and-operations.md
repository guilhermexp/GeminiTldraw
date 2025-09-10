# Guia de Integrações de Imagem/Vídeo e Histórico de Mudanças

## Visão Geral (o que foi feito)
- Máscara integrada ao Assistant e ao Create: abrir editor de máscara com prompt do chat; opção “Edit” também no modo assistant.
- Overlay (composição) de duas formas:
  - Compose (AI): base + overlay com máscara e prompt; IA faz a fusão (Gemini, com fallback FAL).
  - Bake Overlay: mescla determinística (sem IA) o overlay na base, preservando pixels/cores.
- Fallback FAL.ai disponível (desligado por padrão):
  - Texto→Imagem → fal-ai/flux/schnell.
  - Imagem→Imagem → fal-ai/flux/dev/image-to-image.
  - Inpainting (máscara) → fal-ai/flux-general/inpainting.
  - Vídeo → fal-ai/veo3.
- Vídeo: atualizado o modelo padrão para Veo 3 (`veo-3.0-generate-001`).
- Editor de máscara: removido blur do modal, fixado tamanho do container, canvas/imagem 100% (melhor visibilidade e precisão).
- Assistente (orquestração): agora usa Gemini 2.5 Pro para decidir/encadear tools.

## Tools do Assistente (novas)
- generateImage(prompt, numberOfImages?, aspectRatio?, variationStrength?, stylePreset?, negativePrompt?, seed?)
- editImage(prompt)
- removeBackground()
- applyOverlay(baseShapeId?, overlayShapeId?) — composição determinística (sem IA)
- composeAI(prompt, baseShapeId?, overlayShapeId?) — integração com IA
- upscaleImage(factor?)
- generateVideo(prompt, aspectRatio?)
- plan(steps[]?) — planejar e então executar

## Variáveis de Ambiente
- `GEMINI_API_KEY`: chave Gemini (injetada como `process.env.API_KEY`).
- `FAL_KEY`: chave FAL.ai no formato `KEY_ID:KEY_SECRET` (injetada como `process.env.FAL_KEY`).
- `FORCE_EN_LOCALE`: quando `true`, força locale `en` e elimina avisos de tradução do tldraw.
- `SHOW_FALLBACK_PANEL`: quando `true`, exibe o painel de toggles do fallback FAL.
- Onde definir: `.env.local` (git-ignorado). Vite mapeia em tempo de build (veja `vite.config.ts`).

## Fluxos e Fallbacks
- Texto→Imagem
  - Modelo: Gemini 2.5 Image (`gemini-2.5-flash-image-preview`).
  - (Opcional) Fallback: FAL `fal-ai/flux/schnell` (se toggles ligados).
- Imagem→Imagem (variações)
  - Modelo: Gemini 2.5 Image (`gemini-2.5-flash-image-preview`).
  - (Opcional) Fallback: FAL `fal-ai/flux/dev/image-to-image`.
- Edição com Máscara (mask)
  - Modelo: Gemini (imagem + máscara [+ overlay opcional]) com `responseModalities=[IMAGE,TEXT]`.
  - (Opcional) Fallback: FAL `fal-ai/flux-general/inpainting`.
- Vídeo
  - Primeiro tenta: Veo 3 (`veo-3.0-generate-001`) com polling até `done`.
  - Fallback: FAL `fal-ai/veo3` (URLs convertidas para base64 antes de inserir na tela).
 - Assistente (Pro → Flash): se a primeira mensagem do Pro retornar 500/INTERNAL, alternamos para Flash e prosseguimos.

## Uso na Interface
- Create (toolbar contextual)
  - 1 imagem selecionada: “Edit” abre o editor de máscara.
  - 2 imagens selecionadas: “Compose (AI)” abre editor com base + overlay; “Bake Overlay” mescla overlay sem IA.
- Assistant (chat)
  - “Use in Chat” define uma imagem de referência (ex.: overlay). Ao pedir edição numa outra imagem (base), o editor de máscara abre com o prompt preenchido e overlay carregado.
  - Dica: use prompts curtos e específicos para a área pintada.
 - Conectores e títulos: conectores cinza, títulos em card escuro com texto branco e largura limitada para legibilidade.

## Modelos Utilizados
- Gemini: `gemini-2.5-pro` (chat/orquestração) e `gemini-2.5-flash-image-preview` (imagens).
- Veo 3: `veo-3.0-generate-001` (padrão), com fallback FAL `fal-ai/veo3`.
- FAL imagem: `fal-ai/flux/schnell`, `fal-ai/flux/dev/image-to-image`, `fal-ai/flux-general/inpainting`.

## Arquivos Alterados (principais)
- `index.tsx`
  - Atualização do modelo de vídeo para Veo 3 e polling.
  - Fallbacks FAL: `falTextToImages`, `falImageToImages`, `falInpaint`, `falVeo3Video`.
  - Integração de máscara no assistant (abre editor com `initialPrompt` e `overlaySrc`).
  - Ações “Compose (AI)” e “Bake Overlay” na toolbar contextual (2 imagens).
  - Função `bakeOverlayBetweenShapes` (composição determinística sem IA).
- `Components/ImageEditor.tsx`
  - Suporte a `initialPrompt`, `overlaySrc`, toggle “Use overlay”.
  - Envio de imagem + máscara (+ overlay opcional) ao backend.
- `index.css`
  - Remoção de blur no overlay, ajustes de tamanho/visibilidade do editor.
  - Ocultação de helper-buttons/watermark do tldraw.
- `vite.config.ts`
  - Injeção de `process.env.FAL_KEY`, `FORCE_EN_LOCALE` e `SHOW_FALLBACK_PANEL`.
- `package.json`
  - Dependência `@fal-ai/client` adicionada.

## Limitações e Observações
- Fallback FAL para inpainting pode ignorar overlay. Para usar um recorte exato de outra imagem, prefira “Bake Overlay” (determinístico) ou “Compose (AI)” quando disponível.
- Em produção, chaves expostas no cliente são acessíveis. Ideal: via proxy/backend.
- Veo 3 pode exigir habilitações específicas no projeto GCP dependendo do conteúdo (pessoas/crianças).
 - Watermark tldraw: CSS e observer removem visualmente; ver licenciamento para produção.

## Testes e Validação
- Tipagem: `npx tsc --noEmit` sem erros.
- Build: Vite compila; avisos de algumas libs UI são esperados.
- Manual: verificar visual do editor de máscara e os três fluxos (Create/Assistant/Bake) com uma imagem de base e outra de overlay.
 - Assistente: validar tools novas, fallback Pro→Flash (forçando erro) e comportamento dos toasts.

## Próximos Passos (sugeridos)
- Expor na UI seleção de provedor (Google/FAL) por fluxo e logging de fallback acionado.
- Opção “mostrar/ocultar máscara” no editor.
- Cache leve das últimas imagens geradas (melhor UX).
